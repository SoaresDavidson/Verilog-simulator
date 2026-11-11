import { useCallback } from 'react'
import { useToast } from '../components/toast'
import { useSession } from '../state/hooks'
import { STEPS, stepBlockReason, type StepId } from '../state/session'

export type StepStatus = 'active' | 'done' | 'available' | 'locked'

export interface StepView {
  id: StepId
  label: string
  hash: string
  status: StepStatus
  /** Motivo do bloqueio quando `status === 'locked'`. */
  blockReason: string | null
}

export interface StepNavigation {
  step: StepId
  steps: StepView[]
  /**
   * Guarda central de navegação: só troca de tela se as pré-condições
   * confirmadas pela API forem atendidas. Bloqueio gera toast de erro
   * (a menos que `silent`). Devolve `true` se navegou.
   */
  goTo: (step: StepId, options?: { silent?: boolean }) => boolean
}

export function useStepNavigation(): StepNavigation {
  const { state, dispatch } = useSession()
  const toast = useToast()

  const steps: StepView[] = STEPS.map(({ id, label, hash }) => {
    const blockReason = stepBlockReason(state, id)
    let status: StepStatus
    if (id === state.step) status = 'active'
    else if (blockReason) status = 'locked'
    else if (id < state.step) status = 'done'
    else status = 'available'
    return { id, label, hash, status, blockReason }
  })

  const goTo = useCallback(
    (step: StepId, options?: { silent?: boolean }) => {
      const reason = stepBlockReason(state, step)
      if (reason) {
        if (!options?.silent) toast.error(reason)
        return false
      }
      if (step !== state.step) dispatch({ type: 'STEP_CHANGED', step })
      return true
    },
    [state, dispatch, toast],
  )

  return { step: state.step, steps, goTo }
}
