import { createContext, useContext } from 'react'
import type { ApiClient } from './client'

export const ApiContext = createContext<ApiClient | null>(null)

/** Cliente HTTP da aplicação (com `X-Session-Token` automático). */
export function useApi(): ApiClient {
  const client = useContext(ApiContext)
  if (!client) throw new Error('useApi deve ser usado dentro de <ApiProvider>.')
  return client
}
