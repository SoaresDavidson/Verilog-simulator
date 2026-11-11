/**
 * Renderer Canvas 2D do waveform (#33). Isolado atrás de `WaveformRenderer`:
 * não conhece React nem a timeline bruta, só o modelo e o viewport.
 */
import { floorIndex, formatTime } from '../simlog'
import type { LogicState } from '../signals'
import type { WaveformModel, WaveRow, WaveSegment } from './model'
import type { WaveformRenderer, WaveformRendererFactory } from './renderer'
import {
  gridTicks,
  LAYOUT,
  rowTop,
  segmentSpans,
  timestampMarks,
  timeToX,
  visibleTransitions,
  type WaveformViewport,
} from './viewport'

interface Palette {
  bg: string
  fg: string
  muted: string
  grid: string
  accent: string
  states: Record<'0' | '1' | 'x' | 'z' | 'bus', string>
  fills: Record<'x' | 'z' | 'bus', string>
}

function readPalette(el: Element): Palette {
  const style = getComputedStyle(el)
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    bg: v('--surface', '#131d22'),
    fg: v('--fg', '#d9e4eb'),
    muted: v('--muted', '#859491'),
    grid: v('--ov', '#3b4a47'),
    accent: v('--accent', '#51f3e3'),
    states: { '0': v('--s0', '#5b9bd5'), '1': v('--s1', '#74dc8b'), x: v('--sx', '#ffd59d'), z: v('--sz', '#b39ddb'), bus: v('--accent', '#51f3e3') },
    fills: { x: v('--sxb', 'rgba(255,213,157,.15)'), z: v('--szb', 'rgba(179,157,219,.15)'), bus: v('--accent-lt', 'rgba(81,243,227,.1)') },
  }
}

function stateColor(p: Palette, state: LogicState): string {
  if (state === 'none') return p.muted
  if (state === 'real') return p.states.bus
  return p.states[state]
}

function cursorText(row: WaveRow, cursor: number | null): string {
  if (cursor === null || row.segments.length === 0 || cursor < row.segments[0].start) return ''
  // segments[k] (k >= 1) começa em transitions[k - 1].
  const seg: WaveSegment | undefined = row.segments[floorIndex(row.transitions, cursor) + 1]
  return seg && seg.state !== 'none' ? seg.text : ''
}

function drawScalar(ctx: CanvasRenderingContext2D, p: Palette, row: WaveRow, top: number, vp: WaveformViewport) {
  const hi = top + LAYOUT.rowPad
  const lo = top + LAYOUT.rowHeight - LAYOUT.rowPad
  const mid = (hi + lo) / 2
  let prevY: number | null = null
  for (const { x0, x1, segment, dense } of segmentSpans(row, vp)) {
    const color = dense ? p.muted : stateColor(p, segment.state)
    ctx.strokeStyle = color
    if (dense) {
      ctx.fillStyle = p.grid
      ctx.fillRect(x0, hi, Math.max(1, x1 - x0), lo - hi)
      prevY = null
      continue
    }
    if (segment.state === 'x') {
      ctx.fillStyle = p.fills.x
      ctx.fillRect(x0, hi, x1 - x0, lo - hi)
    }
    const y = segment.state === '1' ? hi : segment.state === '0' ? lo : mid
    ctx.setLineDash(segment.state === 'none' || segment.state === 'z' ? [3, 3] : [])
    ctx.beginPath()
    if (prevY !== null && prevY !== y) {
      ctx.moveTo(x0, prevY)
      ctx.lineTo(x0, y)
    } else {
      ctx.moveTo(x0, y)
    }
    ctx.lineTo(x1, y)
    ctx.stroke()
    prevY = y
  }
  ctx.setLineDash([])
}

function drawBus(ctx: CanvasRenderingContext2D, p: Palette, row: WaveRow, top: number, vp: WaveformViewport) {
  const hi = top + LAYOUT.rowPad
  const lo = top + LAYOUT.rowHeight - LAYOUT.rowPad
  const mid = (hi + lo) / 2
  const slant = 3
  for (const { x0, x1, segment, dense } of segmentSpans(row, vp)) {
    if (dense) {
      ctx.fillStyle = p.grid
      ctx.fillRect(x0, hi, Math.max(1, x1 - x0), lo - hi)
      continue
    }
    const color = stateColor(p, segment.state)
    const s = Math.min(slant, (x1 - x0) / 2)
    ctx.beginPath()
    ctx.moveTo(x0, mid)
    ctx.lineTo(x0 + s, hi)
    ctx.lineTo(x1 - s, hi)
    ctx.lineTo(x1, mid)
    ctx.lineTo(x1 - s, lo)
    ctx.lineTo(x0 + s, lo)
    ctx.closePath()
    if (segment.state === 'x' || segment.state === 'z') {
      ctx.fillStyle = p.fills[segment.state]
      ctx.fill()
    }
    ctx.setLineDash(segment.state === 'none' || segment.state === 'z' ? [3, 3] : [])
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.setLineDash([])
    if (segment.state !== 'none') {
      const room = x1 - x0 - 2 * s - 4
      if (room > 8) {
        let text = segment.text
        while (text.length > 1 && ctx.measureText(text).width > room) text = text.slice(0, -2) + '…'
        if (ctx.measureText(text).width <= room) {
          ctx.fillStyle = p.fg
          ctx.fillText(text, (x0 + x1) / 2, mid)
        }
      }
    }
  }
}

function draw(canvas: HTMLCanvasElement, model: WaveformModel, vp: WaveformViewport) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const p = readPalette(canvas)
  const ratio = vp.pixelRatio || 1
  canvas.width = Math.round(vp.width * ratio)
  canvas.height = Math.round(vp.height * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, vp.width, vp.height)
  ctx.fillStyle = p.bg
  ctx.fillRect(0, 0, vp.width, vp.height)
  ctx.font = '10px "Fira Code", monospace'
  ctx.textBaseline = 'middle'

  const plotRight = vp.width
  const left = LAYOUT.labelWidth

  // Grade de tempo + rótulos no eixo.
  ctx.strokeStyle = p.grid
  ctx.lineWidth = 1
  ctx.fillStyle = p.muted
  ctx.textAlign = 'left'
  for (const t of gridTicks(vp)) {
    const x = Math.round(timeToX(t, vp)) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, LAYOUT.rulerHeight - 4)
    ctx.lineTo(x, vp.height)
    ctx.stroke()
    ctx.fillText(formatTime(t, model.timescale), x + 3, LAYOUT.rulerHeight / 2)
  }
  // Timestamps reais: marcas curtas no eixo.
  ctx.strokeStyle = p.muted
  for (const t of timestampMarks(model.timestamps, vp)) {
    const x = Math.round(timeToX(t, vp)) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, LAYOUT.rulerHeight - 4)
    ctx.lineTo(x, LAYOUT.rulerHeight)
    ctx.stroke()
  }

  // Séries.
  ctx.save()
  ctx.beginPath()
  ctx.rect(left, 0, plotRight - left, vp.height)
  ctx.clip()
  model.rows.forEach((row, i) => {
    const top = rowTop(i)
    ctx.lineWidth = 1.5
    ctx.textAlign = 'center'
    if (row.kind === 'bus') drawBus(ctx, p, row, top, vp)
    else drawScalar(ctx, p, row, top, vp)
    // Marcadores de transição.
    ctx.fillStyle = p.muted
    for (const t of visibleTransitions(row, vp)) {
      ctx.fillRect(Math.round(timeToX(t, vp)) - 0.5, top + LAYOUT.rowHeight - 3, 1, 3)
    }
  })
  ctx.restore()

  // Coluna de rótulos (nome = valor no cursor).
  ctx.textAlign = 'left'
  model.rows.forEach((row, i) => {
    const top = rowTop(i)
    ctx.strokeStyle = p.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, top + LAYOUT.rowHeight + 0.5)
    ctx.lineTo(plotRight, top + LAYOUT.rowHeight + 0.5)
    ctx.stroke()
    ctx.fillStyle = p.fg
    const value = cursorText(row, model.cursor)
    let label = value ? `${row.label} = ${value}` : row.label
    while (label.length > 3 && ctx.measureText(label).width > left - 10) label = label.slice(0, -2) + '…'
    ctx.fillText(label, 6, top + LAYOUT.rowHeight / 2)
  })
  ctx.strokeStyle = p.grid
  ctx.beginPath()
  ctx.moveTo(left + 0.5, 0)
  ctx.lineTo(left + 0.5, vp.height)
  ctx.stroke()

  // Cursor.
  if (model.cursor !== null && model.cursor >= vp.start && model.cursor <= vp.end) {
    const x = Math.round(timeToX(model.cursor, vp)) + 0.5
    ctx.strokeStyle = p.accent
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, vp.height)
    ctx.stroke()
  }
}

/** Fábrica padrão: Canvas 2D. Sem contexto 2D disponível, não desenha. */
export const createCanvasRenderer: WaveformRendererFactory = (canvas): WaveformRenderer => ({
  draw: (model, viewport) => draw(canvas, model, viewport),
  destroy: () => {
    canvas.width = 0
    canvas.height = 0
  },
})
