import { useRef, type PointerEvent } from 'react'
import type { DiagramLayout } from '../netlist/layout'
import type { Size, View } from './useViewport'

export interface MinimapProps {
  layout: DiagramLayout
  view: View
  viewport: Size
  /** Centraliza o viewport no ponto de conteúdo clicado/arrastado. */
  onCenter: (x: number, y: number) => void
}

const W = 160
const H = 100

/**
 * Visão geral do conteúdo com o retângulo da área visível. Decorativo para
 * leitor de tela (a navegação equivalente está na toolbar e no teclado).
 */
export function Minimap({ layout, view, viewport, onCenter }: MinimapProps) {
  const dragging = useRef(false)
  const scale = Math.min(W / layout.width, H / layout.height)
  const ox = (W - layout.width * scale) / 2
  const oy = (H - layout.height * scale) / 2

  const vx = -view.x / view.k
  const vy = -view.y / view.k
  const vw = viewport.width / view.k
  const vh = viewport.height / view.k

  const toContent = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const sx = r.width ? r.width / W : 1
    const sy = r.height ? r.height / H : 1
    return { x: ((e.clientX - r.left) / sx - ox) / scale, y: ((e.clientY - r.top) / sy - oy) / scale }
  }

  return (
    <div className="mm dpd-mm" aria-hidden="true" data-testid="minimap">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture?.(e.pointerId)
          const p = toContent(e)
          onCenter(p.x, p.y)
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          const p = toContent(e)
          onCenter(p.x, p.y)
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <g transform={`translate(${ox},${oy}) scale(${scale})`}>
          {layout.nodes.map((n) => (
            <rect key={n.id} className="mm-node" x={n.x} y={n.y} width={n.w} height={n.h} />
          ))}
          <rect className="mmv-rect" data-testid="minimap-viewport" x={vx} y={vy} width={vw} height={vh} vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
    </div>
  )
}
