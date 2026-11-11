import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApi } from '../../api/context'
import { isAbortError } from '../../api/errors'
import { STATUS_POLL_INTERVAL_MS } from '../../config'
import { HealthContext, type HealthApi } from './context'
import type { HealthState } from './health'

export interface HealthProviderProps {
  children: ReactNode
  /** Intervalo de consulta em ms; `null` desliga a consulta automática (testes). */
  pollMs?: number | null
}

/** Consulta `GET /status/` ao montar e periodicamente. */
export function HealthProvider({ children, pollMs = STATUS_POLL_INTERVAL_MS }: HealthProviderProps) {
  const api = useApi()
  const [state, setState] = useState<HealthState>({ kind: 'checking' })
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (pollMs === null && tick === 0) return
    const controller = new AbortController()
    api
      .getStatus({ signal: controller.signal, timeoutMs: 10_000 })
      .then((report) => setState({ kind: 'report', report }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setState({ kind: 'unreachable' })
      })
    return () => controller.abort()
  }, [api, tick, pollMs])

  useEffect(() => {
    if (!pollMs) return
    const timer = setInterval(refresh, pollMs)
    return () => clearInterval(timer)
  }, [pollMs, refresh])

  const value = useMemo<HealthApi>(() => ({ state, refresh }), [state, refresh])
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>
}
