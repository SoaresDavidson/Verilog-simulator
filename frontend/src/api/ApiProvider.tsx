import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useSessionState } from '../state/hooks'
import { createApiClient } from './client'
import { ApiContext } from './context'

export interface ApiProviderProps {
  children: ReactNode
  /** URL base (padrão: `VITE_API_URL`). */
  baseUrl?: string
  /** fetch injetável (testes). */
  fetch?: typeof fetch
  timeoutMs?: number
}

/** Guarda mutável do token, lida pelo cliente a cada requisição. */
class TokenStore {
  private token: string | null
  constructor(initial: string | null) {
    this.token = initial
  }
  set(token: string | null) {
    this.token = token
  }
  get(): string | null {
    return this.token
  }
}

/**
 * Disponibiliza um `ApiClient` único que envia automaticamente o
 * `X-Session-Token` da sessão ativa. Deve ficar dentro de `SessionProvider`.
 */
export function ApiProvider({ children, baseUrl, fetch, timeoutMs }: ApiProviderProps) {
  const { session } = useSessionState()
  const [store] = useState(() => new TokenStore(session?.sessionToken ?? null))

  // Layout effect: o token é atualizado antes de qualquer efeito/handler das telas.
  useLayoutEffect(() => {
    store.set(session?.sessionToken ?? null)
  }, [store, session])

  const client = useMemo(
    () => createApiClient({ baseUrl, fetch, timeoutMs, getSessionToken: () => store.get() }),
    [baseUrl, fetch, timeoutMs, store],
  )

  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
}
