import { createContext, useContext } from 'react'
import type { HealthState } from './health'

export interface HealthApi {
  state: HealthState
  /** Força nova consulta a `GET /status/`. */
  refresh: () => void
}

export const HealthContext = createContext<HealthApi | null>(null)

/** Estado do healthcheck (`GET /status/`) — API, Docker, Yosys, Icarus, storage. */
export function useHealth(): HealthApi {
  const value = useContext(HealthContext)
  if (!value) throw new Error('useHealth deve ser usado dentro de <HealthProvider>.')
  return value
}
