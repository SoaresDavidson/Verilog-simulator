/**
 * Ciclo de vida da síntese (#22, #28): uma requisição por vez, resultado
 * anterior invalidado ao iniciar, falhas distinguidas por tipo e nova
 * tentativa sem reenviar o projeto.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../../api/context'
import { isAbortError, isApiError, MESSAGES, type ApiErrorKind } from '../../api/errors'
import { PROJECT_ID_PATTERN, type SynthesisResponse } from '../../api/types'
import { useSession } from '../../state/hooks'
import type { SessionState } from '../../state/session'
import { checkNetlist, checkTopModule } from './netlist'

/** Maior que o timeout padrão das ferramentas no backend, para receber o 408 dele. */
export const SYNTHESIS_TIMEOUT_MS = 180_000

export type SynthesisFailureKind =
  /** `success: false` — Yosys rodou e falhou. */
  | 'synthesis'
  /** Sucesso sem netlist utilizável. */
  | 'netlist'
  /** `top_module` ausente ou fora da netlist. */
  | 'top'
  /** Requisição interrompida ao sair da tela. */
  | 'interrupted'
  | Exclude<ApiErrorKind, 'aborted'>

export const SYNTHESIS_MESSAGES = {
  synthesis: 'A síntese falhou no Yosys. Revise o log abaixo, corrija o projeto e tente novamente.',
  timeout: 'A síntese excedeu o tempo limite. Simplifique o projeto ou tente novamente.',
  network: MESSAGES.network,
  interrupted: 'A síntese foi interrompida ao sair da tela. Inicie novamente.',
} as const

export function isValidProjectId(projectId: string | null | undefined): projectId is string {
  return typeof projectId === 'string' && PROJECT_ID_PATTERN.test(projectId)
}

export interface UseSynthesis {
  /** Há sessão com `project_id` válido e nenhuma síntese em andamento. */
  canStart: boolean
  running: boolean
  /** Tipo da última falha observada nesta montagem da tela. */
  failureKind: SynthesisFailureKind | null
  start: () => Promise<void>
}

export function useSynthesis(): UseSynthesis {
  const api = useApi()
  const { state, dispatch } = useSession()
  const [failureKind, setFailureKind] = useState<SynthesisFailureKind | null>(null)
  const inFlightRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const stateRef = useRef<SessionState>(state)
  useEffect(() => {
    stateRef.current = state
  })

  // Ao sair da tela, interrompe a requisição (o `catch` registra a falha).
  useEffect(() => () => controllerRef.current?.abort(), [])

  const projectId = state.session?.projectId
  const running = state.synthesis.status === 'running'
  const canStart = isValidProjectId(projectId) && !running

  const start = useCallback(async () => {
    const current = stateRef.current
    const id = current.session?.projectId
    if (inFlightRef.current || current.synthesis.status === 'running' || !isValidProjectId(id)) return
    inFlightRef.current = true
    const controller = new AbortController()
    controllerRef.current = controller
    setFailureKind(null)
    dispatch({ type: 'SYNTHESIS_STARTED' })
    dispatch({ type: 'TOP_MODULE_SELECTED', topModule: null })

    // Descarta respostas que chegarem depois de a sessão mudar.
    const stillCurrent = () => stateRef.current.session?.projectId === id

    const fail = (kind: SynthesisFailureKind, error: string, result?: SynthesisResponse) => {
      setFailureKind(kind)
      dispatch({ type: 'SYNTHESIS_FAILED', error, result: result ?? null })
    }

    try {
      const response = await api.synthesize(id, { signal: controller.signal, timeoutMs: SYNTHESIS_TIMEOUT_MS })
      if (!stillCurrent()) return
      if (!response.success) {
        fail('synthesis', SYNTHESIS_MESSAGES.synthesis, response)
        return
      }
      const check = checkNetlist(response.netlist_content)
      if (!check.ok) {
        fail('netlist', check.message, { ...response, netlist_content: null })
        return
      }
      const top = checkTopModule(check.netlist, response.top_module)
      if (!top.ok) {
        fail('top', top.message, { ...response, netlist_content: null })
        return
      }
      dispatch({ type: 'SYNTHESIS_SUCCEEDED', result: { ...response, netlist_content: check.netlist } })
      dispatch({ type: 'TOP_MODULE_SELECTED', topModule: top.top })
    } catch (error) {
      if (!stillCurrent()) return
      if (isAbortError(error)) {
        fail('interrupted', SYNTHESIS_MESSAGES.interrupted)
      } else if (isApiError(error)) {
        const kind = error.kind === 'aborted' ? 'interrupted' : error.kind
        const message =
          kind === 'timeout' ? SYNTHESIS_MESSAGES.timeout : kind === 'network' ? SYNTHESIS_MESSAGES.network : error.message
        fail(kind, message)
      } else {
        fail('http', MESSAGES.unknown)
      }
    } finally {
      inFlightRef.current = false
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [api, dispatch])

  return { canStart, running, failureKind, start }
}
