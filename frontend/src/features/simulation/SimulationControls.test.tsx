import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MESSAGES } from '../../api/errors'
import type { SimLog } from '../../api/types'
import { PROJECT_ID, SESSION_TOKEN } from '../../test/fixtures'
import { createFetchMock, fetchCall, jsonResponse, pendingFetch, TEST_BASE_URL } from '../../test/http'
import { renderApp } from '../../test/render'
import { cpuLog, readyState, simResponse, simulatedState } from './testData'
import { PLAYBACK_BASE_MS } from './usePlayback'
import { SIM_MESSAGES, SIMULATION_TIMEOUT_MS } from './useSimulationRun'

function main() {
  return within(screen.getByRole('main'))
}
function timeDisplay() {
  return main().getByRole('group', { name: 'Controles da timeline' }).querySelector('output')!
}
function slider() {
  return main().getByRole('slider', { name: 'Timeline' })
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

describe('Tela 4 — execução da simulação (#34)', () => {
  it('idle: playback desabilitado; executar envia project_id ao endpoint e chega a success', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValueOnce(jsonResponse(200, simResponse()))
    renderApp({ initialState: readyState(), fetch })

    expect(main().getByText('Simulação ainda não executada.')).toBeInTheDocument()
    expect(main().getByRole('button', { name: 'Reproduzir' })).toBeDisabled()
    expect(slider()).toBeDisabled()

    await user.click(main().getByRole('button', { name: 'Executar simulação' }))
    expect(await main().findByText('Simulação concluída.')).toBeInTheDocument()

    expect(fetch).toHaveBeenCalledTimes(1)
    const call = fetchCall(fetch)
    expect(call.url).toBe(`${TEST_BASE_URL}/verilog/simular-execucao`)
    expect(call.method).toBe('POST')
    expect(JSON.parse(String(call.body))).toEqual({ project_id: PROJECT_ID })
    expect(call.headers.get('X-Session-Token')).toBe(SESSION_TOKEN)
    expect(main().getByRole('button', { name: 'Reproduzir' })).toBeEnabled()
    expect(timeDisplay()).toHaveTextContent('0 ns / 40 ns')
  })

  it('running mostra progresso e permite cancelar', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: readyState(), fetch: pendingFetch() })

    await user.click(main().getByRole('button', { name: 'Executar simulação' }))
    expect(main().getByText('Simulando…')).toBeInTheDocument()
    await user.click(main().getByRole('button', { name: 'Cancelar' }))
    expect(await main().findByRole('alert')).toHaveTextContent(SIM_MESSAGES.cancelled)
    expect(main().getByRole('button', { name: 'Executar novamente' })).toBeEnabled()
  })

  it('falha da ferramenta: error com stderr seguro visível', async () => {
    const user = userEvent.setup()
    const stderr = '/verilog_code/runs/run_0123456789abcdef0123456789abcdef/top.v:4: syntax error\n<script>alert(1)</script>'
    const fetch = createFetchMock().mockResolvedValueOnce(
      jsonResponse(200, simResponse(null, { success: false, stdout: 'iverilog', stderr })),
    )
    renderApp({ initialState: readyState(), fetch })
    await user.click(main().getByRole('button', { name: 'Executar simulação' }))

    expect(await main().findByRole('alert')).toHaveTextContent(SIM_MESSAGES.failed)
    const pre = main().getByText(/syntax error/)
    expect(pre.textContent).toBe('top.v:4: syntax error\n<script>alert(1)</script>')
    expect(document.querySelector('script')).toBeNull()
    expect(main().getByRole('button', { name: 'Reproduzir' })).toBeDisabled()
  })

  it('erro HTTP/rede vira mensagem segura', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValueOnce(
      jsonResponse(503, { error: { code: 'docker_unavailable', message: 'Docker indisponível.', request_id: 'r1' } }),
    )
    renderApp({ initialState: readyState(), fetch })
    await user.click(main().getByRole('button', { name: 'Executar simulação' }))
    expect(await main().findByRole('alert')).toHaveTextContent('Docker indisponível.')
  })

  it('timeout do cliente gera erro de tempo limite', async () => {
    vi.useFakeTimers()
    try {
      renderApp({ initialState: readyState(), fetch: pendingFetch() })
      fireEvent.click(main().getByRole('button', { name: 'Executar simulação' }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SIMULATION_TIMEOUT_MS + 10)
      })
      expect(main().getByRole('alert')).toHaveTextContent(MESSAGES.timeout)
    } finally {
      vi.useRealTimers()
    }
  })

  it('resposta obsoleta (execução cancelada) nunca substitui a atual', async () => {
    const user = userEvent.setup()
    let resolveStale: (r: Response) => void = () => {}
    const fetch = createFetchMock()
      // 1ª chamada ignora o AbortSignal e responde depois.
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveStale = resolve)))
      .mockResolvedValueOnce(jsonResponse(200, simResponse(cpuLog, { stdout: 'execucao-B' })))
    renderApp({ initialState: readyState(), fetch })

    await user.click(main().getByRole('button', { name: 'Executar simulação' }))
    await user.click(main().getByRole('button', { name: 'Cancelar' }))
    await user.click(main().getByRole('button', { name: 'Executar novamente' }))
    expect(await main().findByText('Simulação concluída.')).toBeInTheDocument()

    await act(async () => {
      resolveStale(jsonResponse(200, simResponse(cpuLog, { stdout: 'execucao-A' })))
    })
    expect(main().getByText('execucao-B')).toBeInTheDocument()
    expect(main().queryByText('execucao-A')).not.toBeInTheDocument()
  })

  it('success sem simulation_log utilizável desabilita playback', async () => {
    const user = userEvent.setup()
    const empty: SimLog = { metadata: { timescale: '1ns', begintime: 0, endtime: 0 }, modules: {}, timeline: {} }
    const fetch = createFetchMock().mockResolvedValueOnce(jsonResponse(200, simResponse(empty)))
    renderApp({ initialState: readyState(), fetch })
    await user.click(main().getByRole('button', { name: 'Executar simulação' }))

    expect(await main().findByText(/não contém um simulation_log utilizável/)).toBeInTheDocument()
    for (const name of ['Reproduzir', 'Passo anterior', 'Próximo passo', 'Reiniciar']) {
      expect(main().getByRole('button', { name })).toBeDisabled()
    }
    expect(slider()).toBeDisabled()
    expect(main().getByLabelText('Velocidade')).toBeDisabled()
  })
})

describe('Tela 4 — playback (#34)', () => {
  it('próximo/anterior/reset/slider andam só por timestamps existentes e ficam nos limites', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: simulatedState() })

    expect(main().getByRole('button', { name: 'Passo anterior' })).toBeDisabled()
    await user.click(main().getByRole('button', { name: 'Próximo passo' }))
    expect(timeDisplay()).toHaveTextContent('10 ns / 40 ns')

    await user.selectOptions(main().getByLabelText('Intervalo'), '5')
    await user.click(main().getByRole('button', { name: 'Próximo passo' }))
    expect(timeDisplay()).toHaveTextContent('40 ns / 40 ns')
    expect(main().getByRole('button', { name: 'Próximo passo' })).toBeDisabled()

    await user.click(main().getByRole('button', { name: 'Passo anterior' }))
    expect(timeDisplay()).toHaveTextContent('0 ns / 40 ns')

    fireEvent.change(slider(), { target: { value: '3' } })
    expect(timeDisplay()).toHaveTextContent('30 ns / 40 ns')
    expect(slider()).toHaveAttribute('max', '4')

    await user.click(main().getByRole('button', { name: 'Reiniciar' }))
    expect(timeDisplay()).toHaveTextContent('0 ns / 40 ns')
  })

  it('play percorre timestamps na velocidade escolhida e para no fim; pause interrompe', () => {
    vi.useFakeTimers()
    try {
      renderApp({ initialState: simulatedState() })
      fireEvent.change(main().getByLabelText('Velocidade'), { target: { value: '2' } })
      fireEvent.click(main().getByRole('button', { name: 'Reproduzir' }))
      expect(main().getByRole('button', { name: 'Pausar' })).toHaveAttribute('aria-pressed', 'true')

      act(() => vi.advanceTimersByTime(PLAYBACK_BASE_MS / 2))
      expect(timeDisplay()).toHaveTextContent('10 ns')

      fireEvent.click(main().getByRole('button', { name: 'Pausar' }))
      act(() => vi.advanceTimersByTime(PLAYBACK_BASE_MS * 10))
      expect(timeDisplay()).toHaveTextContent('10 ns /')

      fireEvent.click(main().getByRole('button', { name: 'Reproduzir' }))
      act(() => vi.advanceTimersByTime(PLAYBACK_BASE_MS * 20))
      expect(timeDisplay()).toHaveTextContent('40 ns / 40 ns')
      expect(main().getByRole('button', { name: 'Reproduzir' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cursor fora dos timestamps é ajustado ao último timestamp existente <= cursor', async () => {
    renderApp({ initialState: simulatedState(cpuLog, { timelineCursor: 27 }) })
    await waitFor(() => expect(timeDisplay()).toHaveTextContent('20 ns / 40 ns'))
  })
})

afterEach(() => {
  vi.useRealTimers()
})
