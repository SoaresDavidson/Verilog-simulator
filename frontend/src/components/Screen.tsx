import { useId, type ReactNode } from 'react'

export interface ScreenProps {
  title: string
  description?: ReactNode
  children?: ReactNode
  /** Classe extra no container (ex.: `scr--center`). */
  className?: string
}

/**
 * Container padrão de uma tela do fluxo. O `<h1>` recebe foco ao trocar de
 * etapa (ver `AppShell`), por isso tem `tabIndex={-1}`.
 */
export function Screen({ title, description, children, className }: ScreenProps) {
  const headingId = useId()
  return (
    <section className={`scr ${className ?? ''}`} aria-labelledby={headingId}>
      <header className="scr__head">
        <h1 id={headingId} tabIndex={-1} className="scr__title">
          {title}
        </h1>
        {description && <p className="scr__desc">{description}</p>}
      </header>
      {children}
    </section>
  )
}
