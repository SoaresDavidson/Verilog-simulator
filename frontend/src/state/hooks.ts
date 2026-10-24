import { useContext, type Dispatch } from 'react'
import { SessionDispatchContext, SessionStateContext } from './context'
import type { SessionAction, SessionState } from './session'

/** Estado completo da sessão. */
export function useSessionState(): SessionState {
  const state = useContext(SessionStateContext)
  if (!state) throw new Error('useSessionState deve ser usado dentro de <SessionProvider>.')
  return state
}

/** `dispatch` tipado com `SessionAction`. Referência estável. */
export function useSessionDispatch(): Dispatch<SessionAction> {
  const dispatch = useContext(SessionDispatchContext)
  if (!dispatch) throw new Error('useSessionDispatch deve ser usado dentro de <SessionProvider>.')
  return dispatch
}

export function useSession(): { state: SessionState; dispatch: Dispatch<SessionAction> } {
  return { state: useSessionState(), dispatch: useSessionDispatch() }
}
