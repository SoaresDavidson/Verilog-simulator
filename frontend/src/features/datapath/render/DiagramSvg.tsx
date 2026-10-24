import { memo, type KeyboardEvent } from 'react'
import type { DiagramLayout } from '../netlist/layout'
import { routePath } from '../netlist/layout'
import type { GraphEdge, GraphNode, NetlistGraph } from '../netlist/parse'
import { formatValue, logicStateOf } from '../netlist/signals'

export type DiagramSelection = { kind: 'node'; id: string } | { kind: 'net'; id: string } | { kind: 'edge'; id: string }

export interface DiagramHighlights {
  /** Nós destacados pela busca. */
  nodes: ReadonlySet<string>
  /** Fios (`GraphNet.id`) destacados pela busca. */
  nets: ReadonlySet<string>
  /** Fios dos sinais selecionados na tela 2. */
  selectedNets: ReadonlySet<string>
}

export interface DiagramSvgProps {
  graph: NetlistGraph
  layout: DiagramLayout
  highlights: DiagramHighlights
  selection: DiagramSelection | null
  /** Valor (MSB-first) por id de aresta. */
  edgeValues: ReadonlyMap<string, string>
  onSelect: (selection: DiagramSelection) => void
}

const KIND_LABEL: Record<GraphNode['kind'], string> = {
  input: 'porta de entrada',
  output: 'porta de saída',
  inout: 'porta bidirecional',
  cell: 'célula',
  instance: 'instância de módulo',
  const: 'constante',
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function onActivate(handler: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      handler()
    }
  }
}

function edgeClass(edge: GraphEdge, h: DiagramHighlights, sel: DiagramSelection | null, value: string | undefined): string {
  const cls = ['dp-edge']
  if (edge.width > 1) cls.push('dp-edge--bus')
  if (edge.constant) cls.push('dp-edge--const', `dp-v--${logicStateOf(edge.label.replace(/^\d+'b/, ''))}`)
  else if (value !== undefined) cls.push(`dp-v--${logicStateOf(value)}`)
  if (edge.net && h.selectedNets.has(edge.net)) cls.push('dp-edge--sig')
  if (edge.net && h.nets.has(edge.net)) cls.push('dp-hit')
  if (sel && ((sel.kind === 'edge' && sel.id === edge.id) || (sel.kind === 'net' && sel.id === edge.net))) cls.push('dp-on')
  return cls.join(' ')
}

/**
 * Renderização pura do grafo posicionado. Coordenadas no espaço do layout;
 * zoom/pan ficam a cargo de quem envolve (`DatapathDiagram`).
 */
export const DiagramSvg = memo(function DiagramSvg({ graph, layout, highlights, selection, edgeValues, onSelect }: DiagramSvgProps) {
  // Rótulo uma vez por pino de origem (evita repetir o nome do fio em cada ramo).
  const labelled = new Set<string>()

  return (
    <g className="dp-root">
      {graph.isTop && (
        <text className="dp-toplabel" x={8} y={14}>
          TOP · {graph.module}
        </text>
      )}
      <g className="dp-edges">
        {graph.edges.map((edge) => {
          const route = layout.edgeRoute.get(edge.id)
          if (!route) return null
          const value = edgeValues.get(edge.id)
          const d = routePath(route.points)
          const srcKey = `${edge.from.node}.${edge.from.pin}`
          const showLabel = !labelled.has(srcKey) && !graph.nodeById.get(edge.from.node)?.hidden
          labelled.add(srcKey)
          const p0 = route.points[0]
          const last = route.points[route.points.length - 1]
          const text = value !== undefined ? `${edge.label} = ${formatValue(value, edge.width)}` : edge.label
          return (
            <g
              key={edge.id}
              className={edgeClass(edge, highlights, selection, value)}
              data-edge={edge.id}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(edge.net ? { kind: 'net', id: edge.net } : { kind: 'edge', id: edge.id })
              }}
            >
              <title>
                {edge.label} ({edge.width} {edge.width === 1 ? 'bit' : 'bits'})
              </title>
              <path className="dp-wire-hit" d={d} />
              <path className="dp-wire" d={d} />
              {edge.width > 1 && (
                <g className="dp-busmark" transform={`translate(${last.x - 14},${last.y})`}>
                  <line x1={-3} y1={5} x2={3} y2={-5} />
                  <text x={0} y={-7}>
                    {edge.width}
                  </text>
                </g>
              )}
              {showLabel && !edge.constant && (
                <text className="dp-wlabel" x={p0.x + 4} y={p0.y - 4}>
                  {truncate(text, 28)}
                </text>
              )}
            </g>
          )
        })}
      </g>
      <g className="dp-nodes">
        {graph.nodes.map((node) => {
          const box = layout.nodeBox.get(node.id)
          if (!box) return null
          const on = selection?.kind === 'node' && selection.id === node.id
          const portNet = node.kind === 'input' || node.kind === 'output' || node.kind === 'inout' ? `net:${node.name}` : null
          const cls = [
            'dp-node',
            `dp-node--${node.kind}`,
            'dp-click',
            graph.isTop && portNet ? 'dp-node--top' : '',
            highlights.nodes.has(node.id) ? 'dp-hit' : '',
            portNet && highlights.selectedNets.has(portNet) ? 'dp-node--sig' : '',
            node.kind === 'const' ? `dp-v--${logicStateOf(node.constValue ?? '')}` : '',
            on ? 'dp-on' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const select = () => onSelect({ kind: 'node', id: node.id })
          const isBlock = node.kind === 'cell' || node.kind === 'instance'
          return (
            <g
              key={node.id}
              className={cls}
              data-node={node.id}
              transform={`translate(${box.x},${box.y})`}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${KIND_LABEL[node.kind]} ${node.name}${isBlock ? `, tipo ${node.type}` : ''}, ${node.width} ${node.width === 1 ? 'bit' : 'bits'}`}
              onClick={(e) => {
                e.stopPropagation()
                select()
              }}
              onKeyDown={onActivate(select)}
            >
              <rect className="dp-box" width={box.w} height={box.h} rx={node.kind === 'const' ? 12 : 4} />
              {node.kind === 'instance' && <rect className="dp-box2" x={3} y={3} width={box.w - 6} height={box.h - 6} rx={3} />}
              {isBlock ? (
                <>
                  <text className="dp-name" x={8} y={13}>
                    {truncate(node.hidden ? node.type : node.name, 20)}
                  </text>
                  <text className="dp-type" x={8} y={24}>
                    {truncate(node.hidden ? node.name : node.type, 24)}
                  </text>
                  {node.inputs.map((p) => {
                    const pt = box.pins[`in:${p.name}`]
                    return (
                      <text key={`i${p.name}`} className="dp-pin" x={5} y={pt.y - box.y + 3}>
                        {truncate(p.name, 8)}
                      </text>
                    )
                  })}
                  {node.outputs.map((p) => {
                    const pt = box.pins[`out:${p.name}`]
                    return (
                      <text key={`o${p.name}`} className="dp-pin dp-pin--out" x={box.w - 5} y={pt.y - box.y + 3}>
                        {truncate(p.name, 8)}
                      </text>
                    )
                  })}
                </>
              ) : (
                <text className="dp-name dp-name--c" x={box.w / 2} y={box.h / 2 + 4}>
                  {truncate(node.kind === 'const' ? node.name : `${node.name}${node.width > 1 ? ` [${node.width}]` : ''}`, 14)}
                </text>
              )}
            </g>
          )
        })}
      </g>
    </g>
  )
})
