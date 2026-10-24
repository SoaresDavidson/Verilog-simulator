/**
 * Estado global da sessão (reducer puro, sem React). O Provider fica em
 * `SessionProvider.tsx`; os hooks em `hooks.ts`.
 *
 * Regras:
 * - Só o que foi confirmado pela API libera etapas (`stepBlockReason`).
 * - Nova síntese invalida sinais, simulação e cursor (dependem do netlist).
 * - `SESSION_CLEARED` volta ao estado inicial; despache-o só depois de o
 *   `DELETE /projeto/{id}` ter sido confirmado (ver `useEndSession`).
 */
import type { ProjectId, SimulationResponse, SynthesisResponse } from '../api/types'

export type StepId = 1 | 2 | 3 | 4

export const STEPS: ReadonlyArray<{ id: StepId; label: string; hash: string }> = [
  { id: 1, label: 'Upload', hash: '#s1' },
  { id: 2, label: 'Seleção', hash: '#s2' },
  { id: 3, label: 'Caminho de Dados', hash: '#s3' },
  { id: 4, label: 'Simulação', hash: '#s4' },
]

export interface ActiveSession {
  projectId: ProjectId
  sessionToken: string
  /** Nome do ZIP enviado (somente exibição). */
  fileName: string
}

export type ProjectFileKind = 'source' | 'testbench' | 'other'

export interface ProjectFile {
  /** Caminho relativo dentro do ZIP (com `/`). */
  path: string
  /** Tamanho descompactado em bytes. */
  size: number
  kind: ProjectFileKind
}

export interface IdentifiedFiles {
  /**
   * `client-preview`: derivado do ZIP no navegador — só exibição, NUNCA fonte
   * para síntese. `api`: listagem confirmada pelo backend (futuro).
   */
  origin: 'client-preview' | 'api'
  items: ProjectFile[]
}

export type OperationStatus = 'idle' | 'running' | 'success' | 'error'

export interface OperationState<T> {
  status: OperationStatus
  result: T | null
  /** Mensagem segura para o usuário quando `status === 'error'`. */
  error: string | null
}

export interface SessionState {
  step: StepId
  session: ActiveSession | null
  files: IdentifiedFiles | null
  /** Módulo top selecionado/confirmado. */
  topModule: string | null
  synthesis: OperationState<SynthesisResponse>
  /** Referências dos sinais escolhidos na tela 2. */
  selectedSignals: string[]
  simulation: OperationState<SimulationResponse>
  /** Timestamp atual da timeline (chave de `simulation_log.timeline`, numérica). */
  timelineCursor: number | null
}

const idleOperation = { status: 'idle', result: null, error: null } as const

export const initialSessionState: SessionState = {
  step: 1,
  session: null,
  files: null,
  topModule: null,
  synthesis: idleOperation,
  selectedSignals: [],
  simulation: idleOperation,
  timelineCursor: null,
}

export type SessionAction =
  | { type: 'SESSION_CREATED'; session: ActiveSession; files: IdentifiedFiles | null }
  | { type: 'FILES_IDENTIFIED'; files: IdentifiedFiles }
  | { type: 'TOP_MODULE_SELECTED'; topModule: string | null }
  | { type: 'SYNTHESIS_STARTED' }
  | { type: 'SYNTHESIS_SUCCEEDED'; result: SynthesisResponse }
  | { type: 'SYNTHESIS_FAILED'; error: string; result?: SynthesisResponse | null }
  | { type: 'SIGNALS_SELECTED'; signals: string[] }
  | { type: 'SIMULATION_STARTED' }
  | { type: 'SIMULATION_SUCCEEDED'; result: SimulationResponse }
  | { type: 'SIMULATION_FAILED'; error: string; result?: SimulationResponse | null }
  | { type: 'TIMELINE_CURSOR_SET'; timestamp: number | null }
  | { type: 'STEP_CHANGED'; step: StepId }
  | { type: 'SESSION_CLEARED' }

// ---------------------------------------------------------------------------
// Seletores / guardas
// ---------------------------------------------------------------------------

/** Síntese confirmada pela API: sucesso e netlist presente. */
export function isSynthesisConfirmed(state: SessionState): boolean {
  const { status, result } = state.synthesis
  return status === 'success' && result !== null && result.success && result.netlist_content !== null
}

/** Simulação confirmada pela API com `simulation_log` utilizável. */
export function isSimulationConfirmed(state: SessionState): boolean {
  const { status, result } = state.simulation
  return status === 'success' && result !== null && result.success && result.simulation_log !== null
}

/**
 * Motivo do bloqueio da etapa, ou `null` se ela pode ser aberta.
 * Etapa 1 nunca bloqueia.
 */
export function stepBlockReason(state: SessionState, step: StepId): string | null {
  if (step === 1) return null
  if (!state.session) return 'Faça o upload do projeto primeiro.'
  if (step === 2) return null
  if (!isSynthesisConfirmed(state)) return 'Conclua a síntese primeiro.'
  // Mesma regra do botão da tela 2 (#29): diagrama e simulação filtram pelos sinais escolhidos.
  if (state.selectedSignals.length === 0) return 'Selecione pelo menos 1 sinal.'
  return null
}

export function canEnterStep(state: SessionState, step: StepId): boolean {
  return stepBlockReason(state, step) === null
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'SESSION_CREATED':
      return { ...initialSessionState, step: state.step, session: action.session, files: action.files }

    case 'FILES_IDENTIFIED':
      return state.session ? { ...state, files: action.files } : state

    case 'TOP_MODULE_SELECTED':
      return state.session ? { ...state, topModule: action.topModule } : state

    case 'SYNTHESIS_STARTED':
      if (!state.session) return state
      return {
        ...state,
        synthesis: { status: 'running', result: null, error: null },
        selectedSignals: [],
        simulation: idleOperation,
        timelineCursor: null,
      }

    case 'SYNTHESIS_SUCCEEDED':
      if (!state.session) return state
      return {
        ...state,
        synthesis: { status: 'success', result: action.result, error: null },
        topModule: action.result.top_module ?? state.topModule,
      }

    case 'SYNTHESIS_FAILED':
      if (!state.session) return state
      return { ...state, synthesis: { status: 'error', result: action.result ?? null, error: action.error } }

    case 'SIGNALS_SELECTED':
      if (!isSynthesisConfirmed(state)) return state
      return { ...state, selectedSignals: [...new Set(action.signals)] }

    case 'SIMULATION_STARTED':
      if (!state.session) return state
      return { ...state, simulation: { status: 'running', result: null, error: null }, timelineCursor: null }

    case 'SIMULATION_SUCCEEDED':
      if (!state.session) return state
      return {
        ...state,
        simulation: { status: 'success', result: action.result, error: null },
        timelineCursor: action.result.simulation_log?.metadata.begintime ?? null,
      }

    case 'SIMULATION_FAILED':
      if (!state.session) return state
      return { ...state, simulation: { status: 'error', result: action.result ?? null, error: action.error } }

    case 'TIMELINE_CURSOR_SET':
      return { ...state, timelineCursor: action.timestamp }

    case 'STEP_CHANGED':
      return canEnterStep(state, action.step) ? { ...state, step: action.step } : state

    case 'SESSION_CLEARED':
      return initialSessionState
  }
}
