import type { ReactNode } from 'react'
import { ApiProvider } from '../api/ApiProvider'
import { ToastProvider } from '../components/toast'
import { SessionProvider } from '../state/SessionProvider'
import type { SessionState } from '../state/session'

export interface AppProvidersProps {
  children: ReactNode
  /** Estado inicial da sessão (testes). */
  initialState?: SessionState
  /** fetch injetável (testes). */
  fetch?: typeof fetch
  baseUrl?: string
}

/** Ordem: Session → Api (lê o token da sessão) → Toast. */
export function AppProviders({ children, initialState, fetch, baseUrl }: AppProvidersProps) {
  return (
    <SessionProvider initialState={initialState}>
      <ApiProvider fetch={fetch} baseUrl={baseUrl}>
        <ToastProvider>{children}</ToastProvider>
      </ApiProvider>
    </SessionProvider>
  )
}
