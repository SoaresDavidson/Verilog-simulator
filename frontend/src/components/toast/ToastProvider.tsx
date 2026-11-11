import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isAbortError, toUserMessage } from '../../api/errors'
import { ToastContext, type ToastApi, type ToastItem, type ToastKind } from './context'

const DEFAULT_DURATION: Record<ToastKind, number> = { success: 3500, info: 3500, error: 6000 }

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (item.durationMs <= 0) return
    const timer = setTimeout(() => onDismiss(item.id), item.durationMs)
    return () => clearTimeout(timer)
  }, [item, onDismiss])

  return (
    <div className={`toast toast--${item.kind}`}>
      <span className="toast__msg">{item.message}</span>
      <button type="button" className="toast__close" aria-label="Fechar notificação" onClick={() => onDismiss(item.id)}>
        ×
      </button>
    </div>
  )
}

/**
 * Toasts acessíveis: erros em região `role="alert"` (assertiva), demais em
 * `role="status"` (educada). As regiões ficam sempre montadas para que o
 * leitor de tela anuncie o conteúdo inserido.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const api = useMemo<ToastApi>(() => {
    const show = (message: string, kind: ToastKind = 'info', durationMs = DEFAULT_DURATION[kind]) => {
      const id = nextId.current++
      // Mantém no máximo 4 toasts visíveis.
      setItems((current) => [...current.slice(-3), { id, kind, message, durationMs }])
      return id
    }
    return {
      show,
      success: (message) => show(message, 'success'),
      error: (message) => show(message, 'error'),
      notifyError: (error) => {
        if (!isAbortError(error)) show(toUserMessage(error), 'error')
      },
      dismiss,
    }
  }, [dismiss])

  const errors = items.filter((item) => item.kind === 'error')
  const others = items.filter((item) => item.kind !== 'error')

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack">
        <div role="alert" aria-live="assertive" className="toast-region">
          {errors.map((item) => (
            <Toast key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
        <div role="status" aria-live="polite" className="toast-region">
          {others.map((item) => (
            <Toast key={item.id} item={item} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}
