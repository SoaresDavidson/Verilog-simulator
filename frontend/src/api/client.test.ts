import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFetchMock, fetchCall, jsonResponse, pendingFetch, TEST_BASE_URL } from '../test/http'
import { PROJECT_ID, SESSION_TOKEN, synthesisOk } from '../test/fixtures'
import { createApiClient } from './client'
import { ApiError, isAbortError, MESSAGES } from './errors'

function client(fetchImpl: typeof fetch, token: string | null = null, timeoutMs = 5_000) {
  return createApiClient({ baseUrl: TEST_BASE_URL, fetch: fetchImpl, getSessionToken: () => token, timeoutMs })
}

async function catchError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('esperava rejeição')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createApiClient', () => {
  it('envia X-Session-Token quando há sessão e JSON no corpo', async () => {
    const fetchMock = createFetchMock().mockResolvedValueOnce(jsonResponse(200, synthesisOk))
    const result = await client(fetchMock, SESSION_TOKEN).synthesize(PROJECT_ID)

    expect(result.top_module).toBe('top')
    const call = fetchCall(fetchMock)
    expect(call.url).toBe(`${TEST_BASE_URL}/verilog/mapear-processador`)
    expect(call.method).toBe('POST')
    expect(call.headers.get('X-Session-Token')).toBe(SESSION_TOKEN)
    expect(call.headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(call.body))).toEqual({ project_id: PROJECT_ID })
  })

  it('não envia token quando não há sessão', async () => {
    const fetchMock = createFetchMock().mockResolvedValueOnce(jsonResponse(200, synthesisOk))
    await client(fetchMock, null).synthesize(PROJECT_ID)
    expect(fetchCall(fetchMock).headers.has('X-Session-Token')).toBe(false)
  })

  it('DELETE mantém a barra do project_id na rota', async () => {
    const fetchMock = createFetchMock().mockResolvedValueOnce(jsonResponse(200, { success: true, message: 'ok' }))
    await client(fetchMock, SESSION_TOKEN).deleteProject(PROJECT_ID)
    const call = fetchCall(fetchMock)
    expect(call.method).toBe('DELETE')
    expect(call.url).toBe(`${TEST_BASE_URL}/verilog/projeto/${PROJECT_ID}`)
  })

  it('upload envia multipart com campo file sem Content-Type manual', async () => {
    const fetchMock = createFetchMock().mockResolvedValueOnce(
      jsonResponse(200, { project_id: PROJECT_ID, message: 'ok', session_token: SESSION_TOKEN }),
    )
    const file = new File(['x'], 'p.zip', { type: 'application/zip' })
    const result = await client(fetchMock, 'antigo').uploadProject(file)

    expect(result).toEqual({ project_id: PROJECT_ID, message: 'ok', session_token: SESSION_TOKEN })
    const call = fetchCall(fetchMock)
    expect(call.body).toBeInstanceOf(FormData)
    expect((call.body as FormData).get('file')).toBeInstanceOf(File)
    expect(call.headers.has('Content-Type')).toBe(false)
    expect(call.headers.has('X-Session-Token')).toBe(false)
  })

  it('rejeita resposta de upload fora do contrato', async () => {
    const fetchMock = createFetchMock().mockResolvedValueOnce(jsonResponse(200, { project_id: '../etc', message: 'x' }))
    const error = await catchError(client(fetchMock).uploadProject(new File(['x'], 'p.zip')))
    expect(error.kind).toBe('invalid_response')
  })

  it('lê erro no formato novo {"error": {...}}', async () => {
    const fetchMock = createFetchMock().mockResolvedValueOnce(
      jsonResponse(400, { error: { code: 'INVALID_ZIP', message: 'ZIP inválido.', request_id: 'req-1' } }),
    )
    const error = await catchError(client(fetchMock).synthesize(PROJECT_ID))
    expect(error).toMatchObject({ kind: 'http', status: 400, code: 'INVALID_ZIP', message: 'ZIP inválido.', requestId: 'req-1' })
  })

  it('aceita {"detail": ...} legado e descarta detalhes internos', async () => {
    const fetchMock = createFetchMock()
      .mockResolvedValueOnce(jsonResponse(400, { detail: 'Only ZIP archive files (.zip) are supported.' }))
      .mockResolvedValueOnce(jsonResponse(400, { detail: "Project path '/verilog_code/runs/x' is not a directory." }))
      .mockResolvedValueOnce(jsonResponse(500, { detail: 'Failed: Traceback ...' }))
      .mockResolvedValueOnce(jsonResponse(422, { detail: [{ loc: ['body'], msg: 'field required' }] }))
    const api = client(fetchMock)

    expect((await catchError(api.synthesize(PROJECT_ID))).message).toBe('Only ZIP archive files (.zip) are supported.')
    const leaked = await catchError(api.synthesize(PROJECT_ID))
    expect(leaked.message).not.toContain('/verilog_code')
    const server = await catchError(api.synthesize(PROJECT_ID))
    expect(server.message).not.toMatch(/traceback/i)
    expect(server.status).toBe(500)
    const validation = await catchError(api.synthesize(PROJECT_ID))
    expect(validation.message).toMatch(/inválida/)
  })

  it('usa X-Request-ID do header quando o corpo não traz request_id', async () => {
    const fetchMock = createFetchMock().mockResolvedValueOnce(jsonResponse(404, { detail: 'not found' }, { 'X-Request-ID': 'hdr-9' }))
    const error = await catchError(client(fetchMock).synthesize(PROJECT_ID))
    expect(error.requestId).toBe('hdr-9')
  })

  it('classifica 408 como timeout e 503 como indisponível', async () => {
    const fetchMock = createFetchMock()
      .mockResolvedValueOnce(jsonResponse(408, { error: { code: 'TOOL_TIMEOUT', message: 'Tempo esgotado.', request_id: 'r' } }))
      .mockResolvedValueOnce(jsonResponse(503, { detail: 'docker down' }))
    const api = client(fetchMock)
    expect((await catchError(api.synthesize(PROJECT_ID))).kind).toBe('timeout')
    const unavailable = await catchError(api.synthesize(PROJECT_ID))
    expect(unavailable.kind).toBe('unavailable')
    expect(unavailable.message).toMatch(/indisponível/)
  })

  it('distingue falha de rede', async () => {
    const fetchMock = createFetchMock().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const error = await catchError(client(fetchMock).synthesize(PROJECT_ID))
    expect(error.kind).toBe('network')
    expect(error.message).toBe(MESSAGES.network)
  })

  it('JSON inválido em resposta 2xx vira invalid_response', async () => {
    const fetchMock = createFetchMock().mockResolvedValueOnce(new Response('<html>', { status: 200 }))
    expect((await catchError(client(fetchMock).synthesize(PROJECT_ID))).kind).toBe('invalid_response')
  })

  it('cancela via AbortSignal com kind aborted', async () => {
    const controller = new AbortController()
    const promise = client(pendingFetch()).synthesize(PROJECT_ID, { signal: controller.signal })
    controller.abort()
    const error = await catchError(promise)
    expect(error.kind).toBe('aborted')
    expect(isAbortError(error)).toBe(true)
  })

  it('signal já abortado não dispara fetch', async () => {
    const fetchMock = createFetchMock()
    const controller = new AbortController()
    controller.abort()
    const error = await catchError(client(fetchMock).synthesize(PROJECT_ID, { signal: controller.signal }))
    expect(error.kind).toBe('aborted')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('timeout no cliente gera kind timeout', async () => {
    vi.useFakeTimers()
    const promise = client(pendingFetch(), null, 1_000).synthesize(PROJECT_ID)
    const assertion = catchError(promise)
    await vi.advanceTimersByTimeAsync(1_001)
    expect((await assertion).kind).toBe('timeout')
  })

  it('getStatus devolve o relatório também em 503', async () => {
    const report = { status: 'error', checks: { docker_daemon: { status: 'error', detail: 'down', container: null } } }
    const fetchMock = createFetchMock().mockResolvedValueOnce(jsonResponse(503, report))
    await expect(client(fetchMock).getStatus()).resolves.toEqual(report)
    expect(fetchCall(fetchMock).url).toBe(`${TEST_BASE_URL}/status/`)
  })
})
