import { useMemo, useState, type ReactNode } from 'react'
import type { SimLog } from '../../api/types'
import { useStepNavigation } from '../../app/useStepNavigation'
import { Explainer, MiniArt } from '../../components/Explainer'
import { IconArrowLeft } from '../../components/icons'
import { Screen, type ScreenFigure } from '../../components/Screen'
import { SplitPane } from '../../components/SplitPane'
import { useSessionState } from '../../state/hooks'
import { RunPanel } from './RunPanel'
import { SignalList } from './SignalList'
import { defaultVisibleIds, formatValue, listSignals } from './signals'
import { MAX_WAVEFORM_SIGNALS } from './limits'
import type { DiagramSlot, LiveDiagramContext } from './liveDiagram'
import { formatTime, indexSimLog, trackValueAt } from './simlog'
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
  // Displays ao vivo: as saídas do módulo top no instante da timeline.
  const netlist = state.synthesis.result?.netlist_content ?? null
  const topName = state.synthesis.result?.top_module ?? state.topModule
  const outputSignals = useMemo(() => {
    const ports = topName ? netlist?.modules?.[topName]?.ports : undefined
    if (!ports || !signals.length) return []
    const outs = Object.entries(ports)
      .filter(([, p]) => p.direction === 'output')
      .map(([name]) => name)
    return outs
      .map((name) => signals.filter((s) => s.name === name).sort((a, b) => b.depth - a.depth)[0])
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .slice(0, 3)
  }, [netlist, topName, signals])

  let figures: ScreenFigure[] | undefined
  if (sim?.usable && lastTime !== null) {
    const now = playback.time ?? sim.timestamps[0]
    figures = [
      { value: formatTime(now, sim.timescale), label: `t de ${formatTime(lastTime, sim.timescale)}` },
      ...outputSignals.map((s) => ({
        value: formatValue(trackValueAt(sim.tracks.get(s.ref), now), s.width, s.varType),
        label: `saída ${s.name}`,
        accent: true,
      })),
    ]
    if (outputSignals.length === 0) figures.push({ value: signals.length, label: 'sinais gravados' })
  }

  // Antes de rodar, o painel de execução abre a tela; depois, o circuito e as ondas vêm primeiro.
  const runPanel = (
    <RunPanel
      simulation={state.simulation}
      unusableLog={result !== null && !sim?.usable}
      canRun={state.session !== null}
      onRun={run.start}
      onCancel={run.cancel}
    />
  )

  return (
    <Screen
      title="Simulação"
      description={sim?.usable ? undefined : 'Rode o testbench e acompanhe cada sinal ao longo do tempo, no diagrama e nas formas de onda.'}
      className="sim-scr"
      figures={figures}
    >
      {!sim?.usable && runPanel}

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
            defaultRatio={0.56}
            minFirst={120}
            minSecond={160}
            separatorLabel="Redimensionar diagrama e formas de onda"
            first={<section className="sim-dp" aria-label="Diagrama ao vivo">{diagram}</section>}
            second={waveModel && <Waveform model={waveModel} onSeekTime={playback.seekTime} />}
          />
        </div>
      )}

      {sim?.usable && runPanel}

      {sim?.usable && (
        <Explainer
          id="simulacao"
          defaultOpen={false}
          title="Como ler as formas de onda"
          items={[
            { art: <MiniArt kind="clock" />, title: 'Clock', text: 'O sinal que sobe e desce sem parar. Os flip-flops agem na subida.' },
            { art: <MiniArt kind="w0" />, title: '0 · baixo', text: 'Linha embaixo, em azul.' },
            { art: <MiniArt kind="w1" />, title: '1 · alto', text: 'Linha em cima, em verde.' },
            { art: <MiniArt kind="wx" />, title: 'X · indefinido', text: 'Ninguém atribuiu valor ainda (por exemplo, antes do reset).' },
            { art: <MiniArt kind="wz" />, title: 'Z · alta impedância', text: 'O fio não está ligado a nada que o dirija.' },
            { art: <MiniArt kind="wbus" />, title: 'Barramento', text: 'Vários bits juntos; o valor aparece em hexadecimal.' },
          ]}
        />
      )}

      <div className="scr__actions">
        <div className="scr__actions-bar module sim-dock">
          <button type="button" className="btn bs sim-dock__back" onClick={() => nav.goTo(3)}>
            <IconArrowLeft size={16} />
            Voltar ao Caminho de Dados
          </button>
          <TimelineControls playback={playback} timescale={sim?.timescale ?? { magnitude: 1, unit: '' }} lastTime={lastTime} />
        </div>
      </div>
    </Screen>
  )
}
