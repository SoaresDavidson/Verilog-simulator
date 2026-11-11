import { useReducer, type ReactNode } from 'react'
import { SessionDispatchContext, SessionStateContext } from './context'
import { initialSessionState, sessionReducer, type SessionState } from './session'

export interface SessionProviderProps {
  children: ReactNode
  /** Estado inicial (testes/stories). Padrão: `initialSessionState`. */
  initialState?: SessionState
}

export function SessionProvider({ children, initialState = initialSessionState }: SessionProviderProps) {
  const [state, dispatch] = useReducer(sessionReducer, initialState)
  return (
    <SessionDispatchContext.Provider value={dispatch}>
      <SessionStateContext.Provider value={state}>{children}</SessionStateContext.Provider>
    </SessionDispatchContext.Provider>
  )
}
