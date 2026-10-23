import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PROJECT_ID, SESSION_TOKEN, synthesizedState, uploadedState } from '../../test/fixtures'
import { createFetchMock, fetchCall, jsonResponse } from '../../test/http'
import { renderApp } from '../../test/render'

function allUrls(fetch: ReturnType<typeof createFetchMock>) {
  return fetch.mock.calls.map(([input]) => String(input))
}

describe('encerramento da sessão (#36)', () => {
  it('saída normal chama DELETE, limpa o estado e volta ao upload', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetch = createFetchMock().mockResolvedValueOnce(jsonResponse(200, { success: true, message: 'ok' }))
    renderApp({ fetch, initialState: synthesizedState({ step: 3, selectedSignals: ['top.clk'] }) })

    await user.click(screen.getByRole('button', { name: 'Encerrar sessão' }))

    await screen.findByRole('heading', { level: 1, name: 'Novo Projeto' })
    const call = fetchCall(fetch)
    expect(call.method).toBe('DELETE')
    expect(call.url).toContain(`/verilog/projeto/${PROJECT_ID}`)
    expect(call.headers.get('X-Session-Token')).toBe(SESSION_TOKEN)
    expect(screen.queryByTitle('Sessão ativa')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Encerrar sessão' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /seleção/i })).toHaveAttribute('aria-disabled', 'true')
    expect(allUrls(fetch).some((url) => url.includes('/limpar'))).toBe(false)
  })

  it('cancelar a confirmação não chama a API', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const fetch = createFetchMock()
    renderApp({ fetch, initialState: uploadedState() })

    await user.click(screen.getByRole('button', { name: 'Encerrar sessão' }))
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByTitle('Sessão ativa')).toBeInTheDocument()
  })

  it('falha de limpeza mantém a sessão e avisa', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetch = createFetchMock()
      .mockResolvedValueOnce(jsonResponse(503, { error: { code: 'DOCKER_UNAVAILABLE', message: 'Docker indisponível.', request_id: 'r' } }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderApp({ fetch, initialState: synthesizedState({ step: 2 }) })

    await user.click(screen.getByRole('button', { name: 'Encerrar sessão' }))
    expect(await screen.findByText(/não foi possível encerrar a sessão\. docker indisponível/i)).toBeInTheDocument()
    expect(screen.getByTitle('Sessão ativa')).toHaveTextContent(PROJECT_ID)
    expect(screen.getByRole('heading', { level: 1, name: 'Seleção e Síntese' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Encerrar sessão' }))
    expect(await screen.findByText(/não foi possível conectar/i)).toBeInTheDocument()
    expect(screen.getByTitle('Sessão ativa')).toBeInTheDocument()
  })

  it('404 (run já removido) encerra a sessão local', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const fetch = createFetchMock().mockResolvedValueOnce(jsonResponse(404, { detail: 'not found' }))
    renderApp({ fetch, initialState: uploadedState() })

    await user.click(screen.getByRole('button', { name: 'Encerrar sessão' }))
    await waitFor(() => expect(screen.queryByTitle('Sessão ativa')).not.toBeInTheDocument())
  })

  it('fechar a página envia DELETE keepalive (exceto bfcache)', () => {
    const fetch = createFetchMock().mockResolvedValue(jsonResponse(200, { success: true, message: 'ok' }))
    renderApp({ fetch, initialState: uploadedState() })

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    expect(fetch).not.toHaveBeenCalled()

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))
    expect(fetch).toHaveBeenCalledTimes(1)
    const [, init] = fetch.mock.calls[0]
    expect(init?.method).toBe('DELETE')
    expect(init?.keepalive).toBe(true)
    expect(new Headers(init?.headers).get('X-Session-Token')).toBe(SESSION_TOKEN)
  })

  it('sem sessão, fechar a página não chama a API', () => {
    const fetch = createFetchMock()
    renderApp({ fetch })
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('indicador de disponibilidade (/status/)', () => {
  const report = (overrides: Record<string, { status: string }>, status = 'error') =>
    jsonResponse(status === 'ok' ? 200 : 503, {
      status,
      checks: {
        docker_daemon: { status: 'ok', detail: null, container: null },
        yosys: { status: 'ok', detail: null, container: 'yosys' },
        icarus: { status: 'ok', detail: null, container: 'icarus' },
        storage: { status: 'ok', detail: null, container: null },
        ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, { detail: 'interno', container: null, ...v }])),
      },
    })

  it('backend indisponível mostra mensagem acionável', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockRejectedValue(new TypeError('Failed to fetch'))
    renderApp({ fetch, statusPollMs: 60_000 })

    const pill = await screen.findByRole('button', { name: /serviços indisponíveis/i })
    expect(fetchCall(fetch).url).toMatch(/\/status\/$/)
    await user.click(pill)
    expect(pill).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText(/api indisponível/i).length).toBeGreaterThan(0)
  })

  it('Yosys e Docker indisponíveis aparecem sem expor detail', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValue(report({ yosys: { status: 'error' }, docker_daemon: { status: 'error' } }))
    renderApp({ fetch, statusPollMs: 60_000 })

    await user.click(await screen.findByRole('button', { name: /serviços indisponíveis/i }))
    expect(screen.getAllByText(/yosys indisponível/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/docker indisponível/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/interno/)).not.toBeInTheDocument()
  })

  it('Icarus degradado e recuperação ao verificar novamente', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock()
      .mockResolvedValueOnce(report({ icarus: { status: 'degraded' } }, 'degraded'))
      .mockResolvedValueOnce(report({}, 'ok'))
    renderApp({ fetch, statusPollMs: 60_000 })

    await user.click(await screen.findByRole('button', { name: /serviços com limitações/i }))
    expect(screen.getAllByText(/icarus verilog com limitações/i).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Verificar novamente' }))
    expect(await screen.findByRole('button', { name: /serviços disponíveis/i })).toBeInTheDocument()
  })
})
