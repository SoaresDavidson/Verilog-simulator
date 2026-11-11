import { useMemo, useState } from 'react'
import { DatapathDiagram, layoutGraph, parseNetlist, type DiagramSelection, type NetlistGraph } from '../../datapath'
import { useSessionState } from '../../../state/hooks'
import type { LiveDiagramContext } from '../liveDiagram'
import { valuesAt } from '../simlog'
import { baseName, formatValue, logicState, type SignalInfo } from '../signals'
import './live.css'

/** Nome do fio selecionado no diagrama (nó de porta, fio ou aresta). */
function selectedNetName(graph: NetlistGraph, sel: DiagramSelection | null): string | null {
  if (!sel) return null
  if (sel.kind === 'net') return graph.netById.get(sel.id)?.name ?? null
  if (sel.kind === 'edge') {
    const net = graph.edgeById.get(sel.id)?.net
    return net ? (graph.netById.get(net)?.name ?? null) : null
  }
  const node = graph.nodeById.get(sel.id)
  return node && (node.kind === 'input' || node.kind === 'output' || node.kind === 'inout') ? node.name : null
}

/**
 * Diagrama de datapath ao vivo (#32): reutiliza parser/layout da tela 3 e
 * aplica os valores do timestamp em vigor. O layout é calculado uma vez por
 * netlist; mudar o cursor só troca os valores.
 */
export function LiveDatapath({ context }: { context: LiveDiagramContext }) {
  const { synthesis, topModule } = useSessionState()
  const netlist = synthesis.result?.netlist_content ?? null
  const top = synthesis.result?.top_module ?? topModule

  const graph = useMemo(() => parseNetlist(netlist, { top }), [netlist, top])
  const layout = useMemo(() => (graph ? layoutGraph(graph) : null), [graph])
  const [selection, setSelection] = useState<DiagramSelection | null>(null)

  const { simLog, time, signals, visibleIds, toggleSignal } = context
  const current = useMemo(() => (time === null ? new Map<string, string>() : valuesAt(simLog, time)), [simLog, time])
  const values = useMemo(() => Object.fromEntries(current), [current])
  const visible = useMemo(() => signals.filter((s) => visibleIds.has(s.id)), [signals, visibleIds])
  const highlighted = useMemo(() => visible.map((s) => s.path), [visible])

  // Selecionar um fio no diagrama passa a exibi-lo também na lista e no waveform.
  const onSelect = (next: DiagramSelection | null) => {
    setSelection(next)
    const name = graph && selectedNetName(graph, next)
    if (!name) return
    const match = signals.find((s) => baseName(s.name) === name)
    if (match && !visibleIds.has(match.id)) toggleSignal(match.id)
  }

  return (
    <div className="live-dp">
      {graph && layout ? (
        <DatapathDiagram
          key={graph.module}
          graph={graph}
          layout={layout}
          values={values}
          selectedSignals={highlighted}
          selection={selection}
          onSelect={onSelect}
          label={`Diagrama ao vivo do módulo ${graph.module}`}
        />
      ) : (
        <p className="muted live-dp__empty" role="status">
          Sem netlist da síntese para desenhar o diagrama ao vivo.
        </p>
      )}
      <BusBar signals={visible} values={current} />
    </div>
  )
}

/** Estado dos sinais exibidos no instante atual; marca os sem amostra. */
function BusBar({ signals, values }: { signals: readonly SignalInfo[]; values: ReadonlyMap<string, string> }) {
  if (signals.length === 0) return null
  return (
    <ul className="live-bus" aria-label="Sinais selecionados no instante atual">
      {signals.map((s) => {
        const value = values.get(s.ref) ?? null
        const state = logicState(value, s.width, s.varType)
        return (
          <li key={s.id} className={`live-bus__item live-bus__item--${state}`} title={s.path}>
            <span className="live-bus__name">{s.name}</span>
            <span className="live-bus__value">{value === null ? 'sem amostra' : formatValue(value, s.width, s.varType)}</span>
          </li>
        )
      })}
    </ul>
  )
}
