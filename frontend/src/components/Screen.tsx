import { useId, type ReactNode } from 'react'
import { useSessionState } from '../state/hooks'

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
 * Container padrão de uma tela do fluxo. Abre com o módulo da etapa: título
 * serigrafado, displays de 7 segmentos com os números da etapa e a plaqueta
 * do projeto (folha, projeto e módulo top). O `<h1>` recebe foco ao
 * trocar de etapa (ver `AppShell`), por isso tem `tabIndex={-1}`.
 */
export function Screen({ title, description, children, className, figures }: ScreenProps) {
  const headingId = useId()
  const state = useSessionState()
  const project = state.session?.fileName.replace(/\.zip$/i, '') ?? '—'
  const top = state.topModule ?? '—'

  return (
    <section className={`scr ${className ?? ''}`} aria-labelledby={headingId}>
      <header className="plate module">
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
        <dl className="carimbo" aria-label="Plaqueta do projeto">
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
      <div className="scr__actions-bar module">
        {hint && (
          <p className={`scr__hint scr__hint--${tone}`}>
            <span className={`led ${tone === 'ok' ? 'led--ok' : 'led--warn'}`} aria-hidden="true" />
            <span id={hintId}>{hint}</span>
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
