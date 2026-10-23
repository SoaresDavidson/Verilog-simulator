/**
 * Guarda do botão "avançar" da tela 2: além das guardas globais
 * (`stepBlockReason`), exige top confirmado pela síntese.
 */
import { isSynthesisConfirmed, stepBlockReason, type SessionState } from '../../state/session'
import { moduleCandidates } from './netlist'
import { isValidProjectId } from './useSynthesis'

export function isTopConfirmed(state: SessionState): boolean {
  const netlist = state.synthesis.result?.netlist_content
  if (!isSynthesisConfirmed(state) || !netlist || !state.topModule) return false
  return moduleCandidates(netlist).includes(state.topModule)
}

export function advanceBlockReason(state: SessionState): string | null {
  if (!isValidProjectId(state.session?.projectId)) return 'Sessão sem projeto válido. Envie o projeto novamente.'
  const reason = stepBlockReason(state, 3)
  if (reason) return reason
  if (!isTopConfirmed(state)) return 'Módulo top não confirmado pela síntese.'
  return null
}
