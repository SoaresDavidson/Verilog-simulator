import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { layoutGraph, type DiagramLayout } from '../netlist/layout'
import type { NetlistGraph } from '../netlist/parse'
import { bitValues, edgeValue, resolveSignalRefs, resolveValues, type SignalValues } from '../netlist/signals'
import { DiagramSvg, type DiagramHighlights, type DiagramSelection } from './DiagramSvg'
import { Legend } from './Legend'
import { Minimap } from './Minimap'
import { PropertiesPanel } from './PropertiesPanel'
import { useViewport } from './useViewport'
import './diagram.css'

/** Acima disso o diagrama só é desenhado sob demanda (fallback). */
export const DEFAULT_MAX_NODES = 400
const DEFAULT_MAX_EDGES = 1200

export interface DatapathDiagramProps {
  graph: NetlistGraph
  /** Layout pré-calculado (padrão: `layoutGraph(graph)`). */
  layout?: DiagramLayout
  /** Valores lógicos por referência de sinal (ex.: `valuesAt(timeline, t)`). */
  values?: SignalValues
  /** Referências dos sinais escolhidos (destacados). */
  selectedSignals?: readonly string[]
  /** Seleção controlada; omita para estado interno. */
  selection?: DiagramSelection | null
  onSelect?: (selection: DiagramSelection | null) => void
  /** Ação "Abrir módulo" nas instâncias de submódulo. */
  onOpenModule?: (name: string) => void
  maxNodes?: number
  /** Rótulo acessível da área do diagrama. */
  label?: string
}

interface SearchTarget {
  sel: DiagramSelection
  x: number
  y: number
}

function exists(graph: NetlistGraph, sel: DiagramSelection | null | undefined): sel is DiagramSelection {
  if (!sel) return false
  if (sel.kind === 'node') return graph.nodeById.has(sel.id)
  if (sel.kind === 'net') return graph.netById.has(sel.id)
  return graph.edgeById.has(sel.id)
}

/**
 * Diagrama SVG navegável (#30): zoom/pan (botões, roda, arraste, pinça e
 * teclado), centralização, busca de sinal, minimapa, painel de propriedades
 * e legenda 0/1/X/Z. Reutilizado pela tela 4 (#32) com `values`.
 */
export function DatapathDiagram({
  graph,
  layout: layoutProp,
  values,
  selectedSignals,
  selection,
  onSelect,
  onOpenModule,
  maxNodes = DEFAULT_MAX_NODES,
  label,
}: DatapathDiagramProps) {
  const tooLarge = graph.nodes.length > maxNodes || graph.edges.length > DEFAULT_MAX_EDGES
  const [forced, setForced] = useState<NetlistGraph | null>(null)
  const render = !tooLarge || forced === graph
  const layout = useMemo(() => layoutProp ?? (render ? layoutGraph(graph) : null), [layoutProp, render, graph])

  if (!layout) {
    return (
      <div className="dpd">
        <div className="card placeholder dpd-fallback" role="status">
          <p>
            Estrutura grande demais para o diagrama ({graph.nodes.length} nós, {graph.edges.length} conexões).
          </p>
          <p className="muted">Use a aba Estrutura para navegar por tabelas, ou desenhe assim mesmo (pode ficar lento).</p>
          <button type="button" className="btn bs bsm" onClick={() => setForced(graph)}>
            Desenhar assim mesmo
          </button>
        </div>
      </div>
    )
  }

  return (
    <DiagramView
      graph={graph}
      layout={layout}
      values={values}
      selectedSignals={selectedSignals}
      selection={selection}
      onSelect={onSelect}
      onOpenModule={onOpenModule}
      label={label}
    />
  )
}

type DiagramViewProps = Omit<DatapathDiagramProps, 'layout' | 'maxNodes'> & { layout: DiagramLayout }

function DiagramView({ graph, layout, values, selectedSignals, selection, onSelect, onOpenModule, label }: DiagramViewProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const hintId = useId()
  const ppId = useId()
  const { view, size, zoomBy, panBy, fit, focusPoint } = useViewport(canvasRef, layout, layout)

  // Seleção controlada ou interna.
  const [inner, setInner] = useState<DiagramSelection | null>(null)
  const controlled = selection !== undefined
  const rawSel = controlled ? selection : inner
  const current = exists(graph, rawSel) ? rawSel : null
  const select = (sel: DiagramSelection | null) => {
    if (!controlled) setInner(sel)
    onSelect?.(sel)
  }

  // Valores simulados.
  const netValues = useMemo(() => resolveValues(graph, values), [graph, values])
  const edgeValues = useMemo(() => {
    const out = new Map<string, string>()
    if (netValues.size === 0) return out
    const bits = bitValues(graph, netValues)
    for (const e of graph.edges) {
      if (e.constant) continue
      const v = edgeValue(e, bits)
      if (v !== undefined) out.set(e.id, v)
    }
    return out
  }, [graph, netValues])
  const selectedNets = useMemo(() => resolveSignalRefs(graph, selectedSignals), [graph, selectedSignals])

  // Busca.
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hitIdx, setHitIdx] = useState(-1)
  const q = query.trim().toLowerCase()
  const { highlights, targets } = useMemo(() => {
    const nodes = new Set<string>()
    const nets = new Set<string>()
    const list: SearchTarget[] = []
    if (q) {
      for (const n of graph.nodes) {
        if (n.kind === 'const') continue
        if (n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q)) {
          const box = layout.nodeBox.get(n.id)
          nodes.add(n.id)
          if (box) list.push({ sel: { kind: 'node', id: n.id }, x: box.x + box.w / 2, y: box.y + box.h / 2 })
        }
      }
      for (const net of graph.nets) {
        if (!net.name.toLowerCase().includes(q)) continue
        const edge = graph.edges.find((e) => e.net === net.id)
        const route = edge && layout.edgeRoute.get(edge.id)
        if (!route) continue
        nets.add(net.id)
        const mid = route.points[Math.floor(route.points.length / 2)]
        list.push({ sel: { kind: 'net', id: net.id }, x: mid.x, y: mid.y })
      }
    }
    return { highlights: { nodes, nets, selectedNets } satisfies DiagramHighlights, targets: list }
  }, [q, graph, layout, selectedNets])

  const goToHit = (step: 1 | -1) => {
    if (targets.length === 0) return
    const next = (hitIdx + step + targets.length) % targets.length
    setHitIdx(next)
    const t = targets[next]
    select(t.sel)
    focusPoint(t.x, t.y, 1)
  }

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  // Roda do mouse: listener nativo para poder impedir a rolagem da página.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  // Arraste (pan) e pinça (zoom) com Pointer Events: mouse, caneta e toque.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef({ moved: false, dist: 0 })
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    drag.current = { moved: false, dist: pinchDist() }
  }
  const pinchDist = () => {
    const [a, b] = [...pointers.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    if (!drag.current.moved && Math.hypot(dx, dy) < 3) return
    if (!drag.current.moved) {
      drag.current.moved = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
      const d = pinchDist()
      const r = e.currentTarget.getBoundingClientRect()
      const [a, b] = [...pointers.current.values()]
      if (drag.current.dist > 0 && d > 0) zoomBy(d / drag.current.dist, { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top })
      drag.current.dist = d
    } else {
      panBy(dx, dy)
    }
  }
  const endPointer = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    drag.current.dist = pinchDist()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, button:not([data-node])')) return
    const step = e.shiftKey ? 120 : 40
    const actions: Record<string, () => void> = {
      ArrowLeft: () => panBy(step, 0),
      ArrowRight: () => panBy(-step, 0),
      ArrowUp: () => panBy(0, step),
      ArrowDown: () => panBy(0, -step),
      '+': () => zoomBy(1.2),
      '=': () => zoomBy(1.2),
      '-': () => zoomBy(1 / 1.2),
      '0': fit,
      Escape: () => select(null),
    }
    const action = actions[e.key]
    if (!action || e.ctrlKey || e.metaKey || e.altKey) return
    e.preventDefault()
    action()
  }

  const hasValues = netValues.size > 0
  const far = view.k < 0.5

  return (
    <div className="dpd">
      <Legend hasValues={hasValues} />
      <div className="dpd-stage">
        <div
          ref={canvasRef}
          className={`cw dpd-canvas${far ? ' dpd--far' : ''}`}
          role="region"
          aria-label={label ?? `Diagrama do módulo ${graph.module}`}
          aria-describedby={hintId}
          tabIndex={0}
          onKeyDown={onKeyDown}
        >
          <p id={hintId} className="sr-only">
            Setas movem a vista, + e - aproximam e afastam, 0 centraliza. Tab percorre os blocos; Enter mostra as propriedades.
          </p>
          <div className="ctb dpd-tb" role="toolbar" aria-label="Controles do diagrama">
            <button type="button" className="bi" title="Aproximar (+)" aria-label="Aproximar" onClick={() => zoomBy(1.25)}>
              +
            </button>
            <button type="button" className="bi" title="Afastar (-)" aria-label="Afastar" onClick={() => zoomBy(1 / 1.25)}>
              −
            </button>
            <button type="button" className="bi" title="Centralizar (0)" aria-label="Centralizar" onClick={fit}>
              ⊞
            </button>
            <button
              type="button"
              className="bi"
              title="Buscar sinal"
              aria-label="Buscar sinal"
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen((o) => !o)}
            >
              ⌕
            </button>
            {searchOpen && (
              <form
                className="dpd-search"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault()
                  goToHit(1)
                }}
              >
                <input
                  ref={searchRef}
                  type="search"
                  aria-label="Nome do sinal, célula ou porta"
                  placeholder="sinal, célula…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setHitIdx(-1)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchOpen(false)
                      setQuery('')
                    }
                  }}
                />
                <span className="dpd-search__n" role="status" aria-live="polite">
                  {q ? (targets.length ? `${hitIdx >= 0 ? hitIdx + 1 : 0}/${targets.length}` : 'nada') : ''}
                </span>
                <button type="submit" className="bi" aria-label="Próximo resultado" disabled={targets.length === 0}>
                  ↵
                </button>
              </form>
            )}
          </div>
          <svg
            className="dpd-svg"
            width="100%"
            height="100%"
            data-testid="datapath-svg"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onClickCapture={(e) => {
              if (drag.current.moved) {
                e.stopPropagation()
                drag.current.moved = false
              }
            }}
            onClick={() => select(null)}
          >
            <g data-testid="viewport" transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
              <DiagramSvg
                graph={graph}
                layout={layout}
                highlights={highlights}
                selection={current}
                edgeValues={edgeValues}
                onSelect={select}
              />
            </g>
          </svg>
          <Minimap layout={layout} view={view} viewport={size} onCenter={(x, y) => focusPoint(x, y, view.k)} />
        </div>
        {current && (
          <PropertiesPanel
            graph={graph}
            selection={current}
            netValues={netValues}
            edgeValues={edgeValues}
            onSelect={select}
            onClose={() => select(null)}
            onOpenModule={onOpenModule}
            headingId={ppId}
          />
        )}
      </div>
    </div>
  )
}
