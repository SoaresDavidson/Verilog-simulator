import { createContext, useContext } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  durationMs: number
}

export interface ToastApi {
  /** Exibe um toast e devolve seu id. Mensagem deve ser segura (sem detalhes internos). */
  show(message: string, kind?: ToastKind, durationMs?: number): number
  success(message: string): number
  error(message: string): number
  /**
   * Converte qualquer erro (ex.: `ApiError`) em mensagem segura e exibe.
   * Cancelamentos (`kind: 'aborted'`) são ignorados.
   */
  notifyError(error: unknown): void
  dismiss(id: number): void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast deve ser usado dentro de <ToastProvider>.')
  return api
}
