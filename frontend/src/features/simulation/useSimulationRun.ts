import { useCallback, useEffect, useRef } from 'react'
import { useApi } from '../../api/context'
import { isAbortError, toUserMessage } from '../../api/errors'
import { useSession } from '../../state/hooks'

/** Tempo máximo da requisição de simulação (compilação + execução + VCD). */
export const SIMULATION_TIMEOUT_MS = 180_000

export const SIM_MESSAGES = {
  cancelled: 'Simulação cancelada.',
  failed: 'A simulação falhou. Veja o diagnóstico (stderr) abaixo.',
} as const

export interface SimulationRun {
  /** Inicia uma simulação; uma execução pendente é cancelada e descartada. */
  start: () => void
  /** Cancela a execução pendente (se houver). */
  cancel: () => void
  running: boolean
}

/**
 * Dispara `POST /simular-execucao` e grava o resultado no estado global.
 *
 * Concorrência: cada execução recebe um id; só a mais recente pode
 * despachar resultado. A anterior é abortada (`AbortController`) e, se ainda
 * assim responder, é ignorada. Resposta de outra sessão também é ignorada.
 */
export function useSimulationRun(timeoutMs = SIMULATION_TIMEOUT_MS): SimulationRun {
  const api = useApi()
  const { state, dispatch } = useSession()
  const projectId = state.session?.projectId ?? null
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const projectRef = useRef(projectId)

  useEffect(() => {
    projectRef.current = projectId
  }, [projectId])

  const cancel = useCallback(() => {
    const controller = controllerRef.current
    if (!controller) return
    controllerRef.current = null
    requestIdRef.current += 1
    controller.abort()
    dispatch({ type: 'SIMULATION_FAILED', error: SIM_MESSAGES.cancelled })
  }, [dispatch])

  // Sair da tela cancela a execução pendente.
  useEffect(() => cancel, [cancel])

  const start = useCallback(() => {
    if (!projectId) return
    controllerRef.current?.abort()
    const id = ++requestIdRef.current
    const controller = new AbortController()
    controllerRef.current = controller
    dispatch({ type: 'SIMULATION_STARTED' })

    const isCurrent = () => id === requestIdRef.current && projectRef.current === projectId
    const finish = () => {
      if (controllerRef.current === controller) controllerRef.current = null
    }

    api
      .simulate(projectId, { signal: controller.signal, timeoutMs })
      .then((result) => {
        if (!isCurrent()) return
        finish()
        if (result.success) dispatch({ type: 'SIMULATION_SUCCEEDED', result })
        else dispatch({ type: 'SIMULATION_FAILED', error: SIM_MESSAGES.failed, result })
      })
      .catch((error: unknown) => {
        if (!isCurrent()) return
        finish()
        dispatch({
          type: 'SIMULATION_FAILED',
          error: isAbortError(error) ? SIM_MESSAGES.cancelled : toUserMessage(error),
        })
      })
  }, [api, dispatch, projectId, timeoutMs])

  return { start, cancel, running: state.simulation.status === 'running' }
}
