import { createContext, type Dispatch } from 'react'
import type { SessionAction, SessionState } from './session'

export const SessionStateContext = createContext<SessionState | null>(null)
export const SessionDispatchContext = createContext<Dispatch<SessionAction> | null>(null)
