import type { ReactNode } from 'react'
import { IconCheck } from '../components/icons'
import type { StepId } from '../state/session'
import type { StepNavigation } from './useStepNavigation'

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Um desenho por etapa: código, porta, circuito, onda. */
const STEP_ICON: Record<StepId, ReactNode> = {
  1: <path {...stroke} d="M8 6l-5 6 5 6M16 6l5 6-5 6" />,
  2: <path {...stroke} d="M6 5h6a7 7 0 0 1 0 14H6z" />,
  3: <path {...stroke} d="M3 7h6v10h6V7h6" />,
  4: <path {...stroke} d="M2 16h4V8h5v8h5V8h6" />,
}

/**
 * Trilha do cabeçalho: código, portas, circuito, sinais. Quando a etapa
 * seguinte fica disponível, o trecho de fio entre as duas passa a conduzir.
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
                  <svg width="22" height="22" viewBox="0 0 24 24">
                    {STEP_ICON[step.id]}
                  </svg>
                  {step.status === 'done' && (
                    <span className="n__ok">
                      <IconCheck size={11} strokeWidth={3.4} />
                    </span>
                  )}
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
