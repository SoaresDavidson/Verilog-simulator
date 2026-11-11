import { IconCheck } from '../components/icons'
import type { StepNavigation } from './useStepNavigation'

/**
 * Stepper do cabeçalho: pads de solda ligados por uma trilha de cobre que
 * "energiza" (preenche) quando a etapa anterior é concluída.
 */
export function Stepper({ nav }: { nav: StepNavigation }) {
  return (
    <nav className="stepper" aria-label="Etapas do fluxo">
      <ol className="stepper__list">
        {nav.steps.map((step, index) => {
          const locked = step.status === 'locked'
          const reasonId = `step-${step.id}-reason`
          const title = locked ? `Bloqueado: ${step.blockReason}` : step.status === 'active' ? undefined : `Ir para ${step.label}`
          const prev = nav.steps[index - 1]
          const live = prev !== undefined && (prev.status === 'done' || (prev.status === 'active' && step.status !== 'locked'))
          return (
            <li key={step.id} className="stepper__item">
              {index > 0 && <span className={`trace${live ? ' is-live' : ''}`} aria-hidden="true" />}
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
                  {step.status === 'done' ? <IconCheck size={15} strokeWidth={2.6} /> : step.id}
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
