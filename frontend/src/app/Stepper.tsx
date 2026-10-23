import type { StepNavigation } from './useStepNavigation'

/** Stepper do cabeçalho (`STEPS` / `rStp()` do protótipo). */
export function Stepper({ nav }: { nav: StepNavigation }) {
  return (
    <nav className="stepper" aria-label="Etapas do fluxo">
      <ol className="stepper__list">
        {nav.steps.map((step, index) => {
          const locked = step.status === 'locked'
          const reasonId = `step-${step.id}-reason`
          const title = locked ? `Bloqueado: ${step.blockReason}` : step.status === 'active' ? undefined : `Ir para ${step.label}`
          return (
            <li key={step.id} className="stepper__item">
              {index > 0 && <span className="sep" aria-hidden="true" />}
              <button
                type="button"
                className={`step ${step.status}`}
                aria-current={step.status === 'active' ? 'step' : undefined}
                aria-disabled={locked || undefined}
                aria-describedby={locked ? reasonId : undefined}
                title={title}
                onClick={() => nav.goTo(step.id)}
              >
                <span className="n" aria-hidden="true">
                  {step.status === 'done' ? '✓' : step.id}
                </span>
                <span className="step__label">
                  <span className="sr-only">Etapa {step.id}: </span>
                  {step.label}
                  {step.status === 'done' && <span className="sr-only"> (concluída)</span>}
                </span>
              </button>
              {locked && (
                <span id={reasonId} className="sr-only">
                  Bloqueado: {step.blockReason}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
