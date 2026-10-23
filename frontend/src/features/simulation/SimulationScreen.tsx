import { useMemo } from 'react'
import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'
import { useSessionState } from '../../state/hooks'
import { RunPanel } from './RunPanel'
import { indexSimLog } from './simlog'
import { TimelineControls } from './TimelineControls'
import { usePlayback } from './usePlayback'
import { useSimulationRun } from './useSimulationRun'
import './simulation.css'

/** Tela 4 (#s4) — simulação Icarus, lista de sinais, waveform e timeline. */
export function SimulationScreen() {
  const nav = useStepNavigation()
  const state = useSessionState()
  const run = useSimulationRun()

  const result = state.simulation.status === 'success' ? state.simulation.result : null
  const simLog = result?.simulation_log ?? null
  const sim = useMemo(() => (simLog ? indexSimLog(simLog) : null), [simLog])
  const playback = usePlayback(sim, state.timelineCursor)
  const lastTime = sim?.usable ? sim.timestamps[sim.timestamps.length - 1] : null

  return (
    <Screen title="Simulação" description="Execute a simulação e acompanhe os sinais ao longo do tempo." className="sim-scr">
      <RunPanel
        simulation={state.simulation}
        unusableLog={result !== null && !sim?.usable}
        canRun={state.session !== null}
        onRun={run.start}
        onCancel={run.cancel}
      />

      <TimelineControls playback={playback} timescale={sim?.timescale ?? { magnitude: 1, unit: '' }} lastTime={lastTime} />

      <div className="scr__actions">
        <button type="button" className="btn bs bsm" onClick={() => nav.goTo(3)}>
          Voltar ao Caminho de Dados
        </button>
      </div>
    </Screen>
  )
}
