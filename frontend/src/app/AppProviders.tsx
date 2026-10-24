import type { ReactNode } from 'react'
import { ApiProvider } from '../api/ApiProvider'
import { ToastProvider } from '../components/toast'
import { HealthProvider } from '../features/health'
import { SessionProvider } from '../state/SessionProvider'
import type { SessionState } from '../state/session'

export interface AppProvidersProps {
  children: ReactNode
  /** Estado inicial da sessão (testes). */
  initialState?: SessionState
  /** fetch injetável (testes). */
  fetch?: typeof fetch
  baseUrl?: string
  /** Intervalo do healthcheck; `null` desliga a consulta automática (testes). */
  statusPollMs?: number | null
}

/** Ordem: Session → Api (lê o token da sessão) → Toast → Health. */
export function AppProviders({ children, initialState, fetch, baseUrl, statusPollMs }: AppProvidersProps) {
  return (
    <SessionProvider initialState={initialState}>
      <ApiProvider fetch={fetch} baseUrl={baseUrl}>
        <ToastProvider>
          <HealthProvider pollMs={statusPollMs}>{children}</HealthProvider>
        </ToastProvider>
      </ApiProvider>
    </SessionProvider>
  )
}
