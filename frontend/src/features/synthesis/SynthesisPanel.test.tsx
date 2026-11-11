import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MESSAGES } from '../../api/errors'
import type { SynthesisResponse } from '../../api/types'
import { initialSessionState } from '../../state/session'
import { PROJECT_ID, SESSION_TOKEN, synthesisOk, synthesizedState, uploadedState } from '../../test/fixtures'
import { createFetchMock, fetchCall, jsonResponse, TEST_BASE_URL } from '../../test/http'
import { renderApp } from '../../test/render'
import { NETLIST_MESSAGES } from './netlist'
import { SYNTHESIS_MESSAGES } from './useSynthesis'

const at2 = () => uploadedState({ step: 2 })

function deferred() {
  let resolve!: (r: Response) => void
  const promise = new Promise<Response>((r) => (resolve = r))
  return { promise, resolve }
}

const panel = () => screen.getByRole('region', { name: 'Síntese Yosys' })
const synthButton = () => within(panel()).getByRole('button')
const inlineAlert = () => within(panel()).findByRole('alert')
const stats = () => within(panel()).queryByRole('list', { name: 'Estatísticas da netlist' })

const failed: SynthesisResponse = {
  success: false,
  stdout: 'Yosys 0.40\n-- Parsing --',
  stderr: 'ERROR: syntax error, unexpected <script>alert(1)</script>',
  top_module: null,
  netlist_content: null,
  stat_report: null,
}

describe('Tela 2c — síntese Yosys (#22, #28)', () => {
  it('ação indisponível sem project_id válido', () => {
    renderApp({
      initialState: {
        ...initialSessionState,
        step: 2,
        session: { projectId: 'run_x', sessionToken: 't', fileName: 'a.zip' },
      },
    })
    expect(synthButton()).toBeDisabled()
    expect(within(panel()).getByRole('status')).toHaveTextContent(/sem projeto válido/i)
  })

  it('estado idle inicial', () => {
    renderApp({ initialState: at2() })
    expect(synthButton()).toHaveTextContent('Iniciar síntese')
    expect(within(panel()).getByRole('status')).toHaveTextContent('Pronto para sintetizar.')
    expect(within(panel()).getByRole('status')).toHaveAttribute('data-status', 'idle')
  })

  it('um clique dispara uma única requisição com o corpo esperado; envio duplicado é bloqueado', async () => {
    const user = userEvent.setup()
    const pending = deferred()
    const fetch = createFetchMock().mockReturnValueOnce(pending.promise)
    renderApp({ initialState: at2(), fetch })

    await user.click(synthButton())
    await user.click(synthButton())
    await user.dblClick(synthButton())

    // running: indicador indeterminado (sem porcentagem) e botão bloqueado.
    const progress = within(panel()).getByRole('progressbar', { name: 'Sintetizando' })
    expect(progress).not.toHaveAttribute('aria-valuenow')
    expect(within(panel()).getByRole('status')).toHaveAttribute('data-status', 'running')
    expect(synthButton()).toBeDisabled()
    expect(fetch).toHaveBeenCalledTimes(1)

    const call = fetchCall(fetch)
    expect(call.url).toBe(`${TEST_BASE_URL}/verilog/mapear-processador`)
    expect(call.method).toBe('POST')
    expect(JSON.parse(String(call.body))).toEqual({ project_id: PROJECT_ID })
    expect(call.headers.get('X-Session-Token')).toBe(SESSION_TOKEN)

    pending.resolve(jsonResponse(200, synthesisOk))
    expect(await within(panel()).findByText('Síntese concluída.')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('sucesso armazena a netlist, mostra estatísticas e stat_report e libera a etapa 3', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValueOnce(
      jsonResponse(200, { ...synthesisOk, stat_report: '=== top ===\n   Number of cells: 0' }),
    )
    renderApp({ initialState: at2(), fetch })
    await user.click(synthButton())
    await within(panel()).findByText('Síntese concluída.')

    const list = stats()
    expect(list).not.toBeNull()
    const value = (key: string) => list?.querySelector(`[data-stat="${key}"] .v`)?.textContent
    expect(value('modules')).toBe('1')
    expect(value('cells')).toBe('0')
    expect(value('ports')).toBe('1')
    expect(value('wires')).toBe('1')
    expect(within(panel()).getByText(/Number of cells: 0/)).toBeInTheDocument()
    expect(synthButton()).toHaveTextContent('Sintetizar novamente')
  })

  it('success:false mostra stderr/stdout com segurança e não marca como concluída', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValueOnce(jsonResponse(200, failed))
    const { container } = renderApp({ initialState: at2(), fetch })
    await user.click(synthButton())

    expect(await inlineAlert()).toHaveTextContent(SYNTHESIS_MESSAGES.synthesis)
    expect(within(panel()).getByText(/syntax error, unexpected <script>/)).toBeInTheDocument()
    expect(within(panel()).getByText(/-- Parsing --/)).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(stats()).toBeNull()
    expect(within(panel()).getByRole('status')).toHaveAttribute('data-status', 'error')
    expect(screen.getByRole('button', { name: /ver caminho de dados/i })).toBeDisabled()
  })

  it('erro HTTP do backend mostra mensagem segura', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'internal', message: 'Falha interna ao sintetizar.', request_id: 'r1' } }),
    )
    renderApp({ initialState: at2(), fetch })
    await user.click(synthButton())
    const alert = await inlineAlert()
    expect(alert).toHaveTextContent('Erro do servidor')
    expect(alert).toHaveTextContent('Falha interna ao sintetizar.')
  })

  it('timeout (408), rede e indisponibilidade (503) têm mensagens distintas', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock()
      .mockResolvedValueOnce(jsonResponse(408, { detail: 'timeout' }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(503, { error: { code: 'unavailable', message: 'Yosys indisponível.', request_id: 'r' } }))
    renderApp({ initialState: at2(), fetch })

    await user.click(synthButton())
    const timeout = (await inlineAlert()).textContent
    expect(timeout).toContain('Tempo limite excedido')
    expect(timeout).toContain(SYNTHESIS_MESSAGES.timeout)

    await user.click(synthButton())
    await waitFor(() => expect(within(panel()).getByRole('alert')).toHaveTextContent('Falha de conexão'))
    const network = within(panel()).getByRole('alert').textContent
    expect(network).toContain(MESSAGES.network)
    expect(network).not.toEqual(timeout)

    await user.click(synthButton())
    await waitFor(() => expect(within(panel()).getByRole('alert')).toHaveTextContent('Serviço indisponível'))
    expect(within(panel()).getByRole('alert')).toHaveTextContent('Yosys indisponível.')
  })

  it('sucesso sem netlist ou resposta inválida viram erro acionável', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock()
      .mockResolvedValueOnce(jsonResponse(200, { ...synthesisOk, netlist_content: null }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, { ...synthesisOk, netlist_content: { creator: 'Y', modules: {} } }))
    renderApp({ initialState: at2(), fetch })

    await user.click(synthButton())
    expect(await inlineAlert()).toHaveTextContent(NETLIST_MESSAGES.missing)
    expect(stats()).toBeNull()

    await user.click(synthButton())
    await waitFor(() => expect(within(panel()).getByRole('alert')).toHaveTextContent(MESSAGES.invalidResponse))

    await user.click(synthButton())
    await waitFor(() => expect(within(panel()).getByRole('alert')).toHaveTextContent(NETLIST_MESSAGES.empty))
    expect(screen.getByRole('button', { name: /ver caminho de dados/i })).toBeDisabled()
  })

  it('nova tentativa funciona sem reenviar o projeto', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock()
      .mockResolvedValueOnce(jsonResponse(200, failed))
      .mockResolvedValueOnce(jsonResponse(200, synthesisOk))
    renderApp({ initialState: at2(), fetch })

    await user.click(synthButton())
    await inlineAlert()
    expect(synthButton()).toHaveTextContent('Tentar novamente')
    await user.click(synthButton())
    await within(panel()).findByText('Síntese concluída.')

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls.every(([url]) => String(url).endsWith('/verilog/mapear-processador'))).toBe(true)
    expect(within(panel()).queryByRole('alert')).toBeNull()
  })

  it('resultado anterior some durante e após tentativa malsucedida', async () => {
    const user = userEvent.setup()
    const pending = deferred()
    const fetch = createFetchMock().mockReturnValueOnce(pending.promise)
    renderApp({ initialState: synthesizedState({ step: 2 }), fetch })

    expect(stats()).not.toBeNull()
    await user.click(synthButton())
    expect(stats()).toBeNull()
    expect(within(panel()).getByRole('progressbar')).toBeInTheDocument()

    pending.resolve(jsonResponse(200, failed))
    await inlineAlert()
    expect(stats()).toBeNull()
    expect(within(panel()).queryByText('Síntese concluída.')).toBeNull()
  })

  it('sair da tela durante a síntese interrompe a requisição e permite reiniciar', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockImplementationOnce(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    renderApp({ initialState: at2(), fetch })
    await user.click(synthButton())
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Novo Projeto' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /criar sessão e continuar/i }))
    await waitFor(() => expect(within(panel()).getByRole('alert')).toHaveTextContent(SYNTHESIS_MESSAGES.interrupted))
    expect(synthButton()).toBeEnabled()
  })
})
