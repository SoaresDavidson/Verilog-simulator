import type { ReactNode } from 'react'
import { directionLabel, widthLabel } from '../netlist/model'
import { edgesOfNet, edgesOfNode, type GraphEdge, type GraphNode, type NetlistGraph } from '../netlist/parse'
import { formatValue } from '../netlist/signals'
import type { DiagramSelection } from './DiagramSvg'

export interface PropertiesPanelProps {
  graph: NetlistGraph
  selection: DiagramSelection
  /** Valor por fio (`GraphNet.id`). */
  netValues: ReadonlyMap<string, string>
  /** Valor por aresta. */
  edgeValues: ReadonlyMap<string, string>
  onSelect: (selection: DiagramSelection) => void
  onClose: () => void
  onOpenModule?: (name: string) => void
  headingId: string
}

const KIND: Record<GraphNode['kind'], string> = {
  input: 'Porta de entrada',
  output: 'Porta de saída',
  inout: 'Porta bidirecional',
  cell: 'Célula',
  instance: 'Instância de módulo',
  const: 'Constante',
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pp-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Painel (`#ppan`): referência, largura, tipo, módulo, conexões e valor. */
export function PropertiesPanel({ graph, selection, netValues, edgeValues, onSelect, onClose, onOpenModule, headingId }: PropertiesPanelProps) {
  const nodeName = (id: string) => graph.nodeById.get(id)?.name ?? id
  const link = (e: GraphEdge, side: 'from' | 'to') => {
    const end = e[side]
    return (
      <button type="button" className="nx-link" onClick={() => onSelect({ kind: 'node', id: end.node })}>
        {nodeName(end.node)}.{end.pin}
      </button>
    )
  }
  const netLink = (e: GraphEdge) =>
    e.net ? (
      <button type="button" className="nx-link" onClick={() => onSelect({ kind: 'net', id: e.net! })}>
        {e.label}
      </button>
    ) : (
      <span className="nx-mono">{e.label}</span>
    )

  let title: string
  let body: ReactNode

  if (selection.kind === 'node') {
    const node = graph.nodeById.get(selection.id)
    if (!node) return null
    title = node.name
    const { incoming, outgoing } = edgesOfNode(graph, node.id)
    const portNet = node.kind === 'input' || node.kind === 'output' || node.kind === 'inout' ? graph.netById.get(`net:${node.name}`) : undefined
    const value = portNet ? netValues.get(portNet.id) : undefined
    body = (
      <>
        <dl className="pp-dl">
          <Row label="Referência">
            <span className="nx-mono">
              {node.module}.{node.name}
            </span>
          </Row>
          <Row label="Tipo">
            {KIND[node.kind]}
            {(node.kind === 'cell' || node.kind === 'instance') && <span className="nx-mono"> {node.type}</span>}
          </Row>
          <Row label="Módulo">{node.module}</Row>
          <Row label="Largura">{widthLabel(node.width)}</Row>
          {value !== undefined && <Row label="Valor">{formatValue(value, node.width)}</Row>}
          {node.parameters.slice(0, 8).map(([k, v]) => (
            <Row key={k} label={k}>
              <span className="nx-mono">{v}</span>
            </Row>
          ))}
        </dl>
        {node.submodule && onOpenModule && (
          <button type="button" className="btn bs bsm" onClick={() => onOpenModule(node.submodule!)}>
            Abrir módulo {node.submodule}
          </button>
        )}
        <h4 className="pp-sub">Conexões</h4>
        {incoming.length + outgoing.length === 0 ? (
          <p className="muted">Sem conexões.</p>
        ) : (
          <ul className="pp-list">
            {incoming.map((e) => (
              <li key={e.id}>
                <span className="nx-mono">{e.to.pin}</span> ← {netLink(e)} de {link(e, 'from')}
              </li>
            ))}
            {outgoing.map((e) => (
              <li key={e.id}>
                <span className="nx-mono">{e.from.pin}</span> → {netLink(e)} para {link(e, 'to')}
              </li>
            ))}
          </ul>
        )}
      </>
    )
  } else if (selection.kind === 'net') {
    const net = graph.netById.get(selection.id)
    if (!net) return null
    title = net.name
    const edges = edgesOfNet(graph, net.id)
    const value = netValues.get(net.id)
    body = (
      <>
        <dl className="pp-dl">
          <Row label="Referência">
            <span className="nx-mono">{net.ref}</span>
          </Row>
          <Row label="Tipo">{net.width > 1 ? 'Barramento' : 'Fio'}</Row>
          <Row label="Módulo">{graph.module}</Row>
          <Row label="Largura">{widthLabel(net.width)}</Row>
          {value !== undefined && <Row label="Valor">{formatValue(value, net.width)}</Row>}
        </dl>
        <h4 className="pp-sub">Conexões</h4>
        {edges.length === 0 ? (
          <p className="muted">Fio sem conexões desenhadas.</p>
        ) : (
          <ul className="pp-list">
            {edges.map((e) => (
              <li key={e.id}>
                {link(e, 'from')} → {link(e, 'to')}
                {e.label !== net.name && <span className="muted"> ({e.label})</span>}
              </li>
            ))}
          </ul>
        )}
      </>
    )
  } else {
    const edge = graph.edgeById.get(selection.id)
    if (!edge) return null
    title = edge.label
    const value = edgeValues.get(edge.id)
    body = (
      <>
        <dl className="pp-dl">
          <Row label="Referência">
            <span className="nx-mono">{edge.label}</span>
          </Row>
          <Row label="Tipo">{edge.constant ? 'Constante' : 'Conexão'}</Row>
          <Row label="Módulo">{graph.module}</Row>
          <Row label="Largura">{widthLabel(edge.width)}</Row>
          {value !== undefined && <Row label="Valor">{formatValue(value, edge.width)}</Row>}
        </dl>
        <h4 className="pp-sub">Conexões</h4>
        <ul className="pp-list">
          <li>
            {link(edge, 'from')} → {link(edge, 'to')} ({directionLabel('output')} → {directionLabel('input')})
          </li>
        </ul>
      </>
    )
  }

  return (
    <section className="pp card dpd-pp" aria-labelledby={headingId}>
      <div className="pp-head">
        <h3 id={headingId} className="nx-mono">
          {title}
        </h3>
        <button type="button" className="bi" aria-label="Fechar propriedades" onClick={onClose}>
          ×
        </button>
      </div>
      {body}
    </section>
  )
}
