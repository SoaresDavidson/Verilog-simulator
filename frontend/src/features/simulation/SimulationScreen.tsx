import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'

/**
 * Tela 4 (#s4) — simulação Icarus, lista de sinais, waveform e timeline.
 * Placeholder da fundação (#24). Use `useApi().simulate`, as ações
 * `SIMULATION_*` e `TIMELINE_CURSOR_SET`.
 */
export function SimulationScreen() {
  const nav = useStepNavigation()
  return (
    <Screen title="Simulação" description="Execute a simulação e acompanhe os sinais ao longo do tempo.">
      <div className="card placeholder">
        <p>Em construção.</p>
      </div>
      <div className="scr__actions">
        <button type="button" className="btn bs bsm" onClick={() => nav.goTo(3)}>
          Voltar
        </button>
      </div>
    </Screen>
  )
}
