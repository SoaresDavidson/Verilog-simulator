import { useId, type ReactNode } from 'react'
import { useSessionState } from '../state/hooks'
import { GateTiles } from './art'

export interface ScreenFigure {
  value: ReactNode
  label: string
  accent?: boolean
}

export interface ScreenProps {
  title: string
  description?: ReactNode
  children?: ReactNode
  /** Classe extra no container (ex.: `scr--center`). */
  className?: string
  /** Números grandes da etapa, como placas de edifício. */
  figures?: ScreenFigure[]
}

/**
 * Container padrão de uma tela do fluxo. Abre com a "placa da etapa": título
 * em letra de sinalização, números da etapa, azulejo de portas lógicas e o
 * carimbo de prancha (folha, projeto e módulo top). O `<h1>` recebe foco ao
 * trocar de etapa (ver `AppShell`), por isso tem `tabIndex={-1}`.
 */
export function Screen({ title, description, children, className, figures }: ScreenProps) {
  const headingId = useId()
  const state = useSessionState()
  const project = state.session?.fileName.replace(/\.zip$/i, '') ?? '—'
  const top = state.topModule ?? '—'

  return (
    <section className={`scr ${className ?? ''}`} aria-labelledby={headingId}>
      <header className="plate">
        <div className="plate__tiles" aria-hidden="true">
          <GateTiles cols={7} rows={4} cell={46} seed={state.step * 13 + 3} />
        </div>
        <div className="plate__fade" aria-hidden="true" />
        <div className="plate__main">
          <h1 id={headingId} tabIndex={-1} className="scr__title">
            {title}
          </h1>
          {description && <p className="scr__desc">{description}</p>}
          {figures && figures.length > 0 && (
            <div className="plate__figures">
              {figures.map((f) => (
                <div key={f.label} className={`figure${f.accent ? ' figure--accent' : ''}`}>
                  <b>{f.value}</b>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <dl className="carimbo" aria-label="Carimbo da prancha">
          <div>
            <dt>Folha</dt>
            <dd>0{state.step} / 04</dd>
          </div>
          <div>
            <dt>Projeto</dt>
            <dd title={project}>{project}</dd>
          </div>
          <div>
            <dt>Top</dt>
            <dd title={top}>{top}</dd>
          </div>
        </dl>
      </header>
      {children}
    </section>
  )
}

export interface ActionBarProps {
  /** Texto que explica o próximo passo (ou o que falta para avançar). */
  hint?: ReactNode
  hintId?: string
  /** `ok` quando o avanço está liberado. */
  tone?: 'ok' | 'wait'
  children: ReactNode
}

/** Barra de avanço fixa no rodapé: diz o que falta e oferece o próximo passo. */
export function ActionBar({ hint, hintId, tone = 'wait', children }: ActionBarProps) {
  return (
    <div className="scr__actions">
      <div className="scr__actions-bar">
        {hint && (
          <p className={`scr__hint scr__hint--${tone}`}>
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              {tone === 'ok' ? (
                <>
                  <circle cx="10" cy="10" r="8" fill="currentColor" opacity=".16" />
                  <path d="M6 10.4l2.6 2.6L14 7.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <>
                  <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2.4" />
                  <circle cx="10" cy="10" r="2.6" fill="currentColor" />
                </>
              )}
            </svg>
            <span id={hintId}>{hint}</span>
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
