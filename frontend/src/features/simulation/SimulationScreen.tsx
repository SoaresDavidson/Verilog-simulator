import { useMemo, useState, type ReactNode } from 'react'
import type { SimLog } from '../../api/types'
import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'
import { SplitPane } from '../../components/SplitPane'
import { useSessionState } from '../../state/hooks'
import { RunPanel } from './RunPanel'
import { SignalList } from './SignalList'
import { defaultVisibleIds, listSignals } from './signals'
import { MAX_WAVEFORM_SIGNALS } from './limits'
import type { DiagramSlot, LiveDiagramContext } from './liveDiagram'
import { indexSimLog } from './simlog'
import { TimelineControls } from './TimelineControls'
import { usePlayback } from './usePlayback'
import { useSimulationRun } from './useSimulationRun'
import { buildWaveformModel } from './waveform/model'
import { Waveform } from './waveform/Waveform'
import './simulation.css'

export interface SimulationScreenProps {
  /**
   * Painel do diagrama ao vivo (#32), acima do waveform. Pode ser uma função
   * que recebe o contexto (log, cursor, sinais visíveis). Sem slot, mostra um
   * placeholder.
   */
  diagramSlot?: DiagramSlot
}

/** Tela 4 (#s4) — simulação Icarus, lista de sinais, diagrama ao vivo, waveform e timeline. */
export function SimulationScreen({ diagramSlot }: SimulationScreenProps = {}) {
  const nav = useStepNavigation()
  const state = useSessionState()
  const run = useSimulationRun()

  const result = state.simulation.status === 'success' ? state.simulation.result : null
  const simLog = result?.simulation_log ?? null
  const sim = useMemo(() => (simLog ? indexSimLog(simLog) : null), [simLog])
  const playback = usePlayback(sim, state.timelineCursor)
  const signals = useMemo(() => (simLog && sim?.usable ? listSignals(simLog) : []), [simLog, sim])

  // Visibilidade pertence ao log atual: novo log => volta ao padrão.
  const [visibility, setVisibility] = useState<{ log: SimLog | null; ids: Set<string> }>({ log: null, ids: new Set() })
  const defaultIds = useMemo(() => defaultVisibleIds(signals, state.selectedSignals), [signals, state.selectedSignals])
  const visibleIds = visibility.log === simLog && simLog !== null ? visibility.ids : defaultIds
  const toggleSignal = (id: string) => {
    const next = new Set(visibleIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setVisibility({ log: simLog, ids: next })
  }

  const visibleSignals = useMemo(() => signals.filter((s) => visibleIds.has(s.id)), [signals, visibleIds])
  const waveModel = useMemo(
    () => (simLog && sim?.usable ? buildWaveformModel(simLog, visibleSignals, playback.time, MAX_WAVEFORM_SIGNALS) : null),
    [simLog, sim, visibleSignals, playback.time],
  )

  const diagramContext: LiveDiagramContext | null =
    simLog && sim?.usable ? { simLog, time: playback.time, signals, visibleIds, toggleSignal } : null
  let diagram: ReactNode = null
  if (diagramContext) diagram = typeof diagramSlot === 'function' ? diagramSlot(diagramContext) : diagramSlot
  if (diagram == null) {
    diagram = (
      <div className="sim-dp__placeholder">
        <p className="muted">Diagrama ao vivo</p>
      </div>
    )
  }

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

      {sim?.usable && (
        <div className="sim-main">
          <SignalList
            signals={signals}
            sim={sim}
            time={playback.time}
            visibleIds={visibleIds}
            onToggle={toggleSignal}
            selectedSignals={state.selectedSignals}
          />
          <SplitPane
            className="sim-split"
            orientation="vertical"
            defaultRatio={0.45}
            minFirst={120}
            minSecond={160}
            separatorLabel="Redimensionar diagrama e formas de onda"
            first={<section className="sim-dp" aria-label="Diagrama ao vivo">{diagram}</section>}
            second={waveModel && <Waveform model={waveModel} onSeekTime={playback.seekTime} />}
          />
        </div>
      )}

      <TimelineControls playback={playback} timescale={sim?.timescale ?? { magnitude: 1, unit: '' }} lastTime={lastTime} />

      <div className="scr__actions">
        <button type="button" className="btn bs bsm" onClick={() => nav.goTo(3)}>
          Voltar ao Caminho de Dados
        </button>
      </div>
    </Screen>
  )
}
