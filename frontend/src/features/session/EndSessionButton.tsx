import { useEffect, useId, useRef, useState } from 'react'
import { IconPower } from '../../components/icons'
import { useSessionState } from '../../state/hooks'
import { useEndSession } from './useEndSession'

/**
 * Botão "Encerrar sessão" do cabeçalho (#36). Só aparece com sessão ativa.
 * A confirmação é um painel próprio (não o `confirm` do navegador).
 */
export function EndSessionButton() {
  const { session } = useSessionState()
  const { endSession, ending } = useEndSession()
  const [asking, setAsking] = useState(false)
  const panelId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!asking) return
    confirmRef.current?.focus()
    const onDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setAsking(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAsking(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [asking])

  if (!session) return null

  const confirm = async () => {
    setAsking(false)
    if (await endSession()) {
      document.querySelector<HTMLElement>('main h1')?.focus()
    }
  }

  return (
    <div className="end-session" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="btn bd bsm"
        onClick={() => setAsking((v) => !v)}
        disabled={ending}
        aria-expanded={asking}
        aria-controls={panelId}
      >
        <IconPower size={16} />
        <span className="end-session__label">{ending ? 'Encerrando…' : 'Encerrar sessão'}</span>
      </button>
      {asking && (
        <div id={panelId} className="end-session__panel card" role="dialog" aria-modal="false" aria-labelledby={`${panelId}-t`}>
          <p id={`${panelId}-t`} className="end-session__title">
            Encerrar a sessão?
          </p>
          <p className="muted end-session__text">O projeto enviado e os resultados serão apagados do servidor.</p>
          <div className="end-session__actions">
            <button type="button" className="btn bs bsm" onClick={() => setAsking(false)}>
              Continuar trabalhando
            </button>
            <button ref={confirmRef} type="button" className="btn bsm end-session__go" onClick={() => void confirm()}>
              Encerrar e apagar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
