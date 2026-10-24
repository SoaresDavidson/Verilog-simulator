/**
 * Viewport do waveform e geometria independente de renderer. Zoom e ajuste
 * produzem um novo viewport; o modelo/dados nunca são alterados.
 */
import { floorIndex } from '../simlog'
import type { WaveformModel, WaveRow, WaveSegment } from './model'

export interface WaveformViewport {
  /** Janela de tempo visível (unidades da timeline). */
  start: number
  end: number
  /** Tamanho em pixels CSS da área de desenho. */
  width: number
  height: number
  pixelRatio: number
}

export const LAYOUT = {
  labelWidth: 132,
  rulerHeight: 22,
  rowHeight: 26,
  rowPad: 5,
  /** Distância mínima entre linhas de grade, em px. */
  gridSpacing: 80,
} as const

export const MAX_ZOOM_LEVEL = 12

export function zoomFactor(level: number): number {
  return 2 ** Math.max(0, Math.min(MAX_ZOOM_LEVEL, Math.round(level)))
}

/** Janela inteira `[begin, end]` (garante largura > 0). */
export function fitWindow(model: Pick<WaveformModel, 'begin' | 'end'>): { start: number; end: number } {
  const span = model.end - model.begin
  return span > 0 ? { start: model.begin, end: model.end } : { start: model.begin, end: model.begin + 1 }
}

/** Janela com zoom `2^level`, centrada em `center` e presa a `[begin, end]`. */
export function zoomWindow(model: Pick<WaveformModel, 'begin' | 'end'>, level: number, center: number | null): { start: number; end: number } {
  const full = fitWindow(model)
  const span = (full.end - full.start) / zoomFactor(level)
  const mid = center ?? full.start + span / 2
  const start = Math.min(Math.max(mid - span / 2, full.start), full.end - span)
  return { start, end: start + span }
}

export function plotWidth(viewport: WaveformViewport): number {
  return Math.max(1, viewport.width - LAYOUT.labelWidth)
}

export function timeToX(time: number, viewport: WaveformViewport): number {
  const span = viewport.end - viewport.start || 1
  return LAYOUT.labelWidth + ((time - viewport.start) / span) * plotWidth(viewport)
}

export function xToTime(x: number, viewport: WaveformViewport): number {
  const span = viewport.end - viewport.start || 1
  return viewport.start + ((x - LAYOUT.labelWidth) / plotWidth(viewport)) * span
}

export function rowTop(rowIndex: number): number {
  return LAYOUT.rulerHeight + rowIndex * LAYOUT.rowHeight
}

export function canvasHeight(rows: number): number {
  return LAYOUT.rulerHeight + Math.max(1, rows) * LAYOUT.rowHeight
}

/** Passo "redondo" (1, 2, 5 × 10^n) com espaçamento mínimo em px. */
export function gridStep(viewport: WaveformViewport): number {
  const span = viewport.end - viewport.start || 1
  const raw = (span * LAYOUT.gridSpacing) / plotWidth(viewport)
  const pow = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow
  return 10 * pow
}

/** Linhas de grade (tempos) dentro do viewport. */
export function gridTicks(viewport: WaveformViewport): number[] {
  const step = gridStep(viewport)
  const ticks: number[] = []
  for (let t = Math.ceil(viewport.start / step) * step; t <= viewport.end + step * 1e-9 && ticks.length < 1000; t += step) {
    ticks.push(Number(t.toPrecision(12)))
  }
  return ticks
}

/** Timestamps reais dentro do viewport, ou `[]` se forem densos demais para marcar (> 1 por 4px). */
export function timestampMarks(timestamps: readonly number[], viewport: WaveformViewport): number[] {
  const from = Math.max(0, floorIndex(timestamps, viewport.start))
  const to = floorIndex(timestamps, viewport.end)
  if (to < from || to - from + 1 > plotWidth(viewport) / 4) return []
  return timestamps.slice(from, to + 1).filter((t) => t >= viewport.start)
}

/** Transições de uma série dentro do viewport. */
export function visibleTransitions(row: WaveRow, viewport: WaveformViewport): number[] {
  const from = floorIndex(row.transitions, viewport.start - 1e-12) + 1
  const to = floorIndex(row.transitions, viewport.end)
  return row.transitions.slice(from, to + 1)
}

export interface SegmentSpan {
  x0: number
  x1: number
  /** Segmento representativo; `dense` quando vários segmentos caem em < 1px. */
  segment: WaveSegment
  dense: boolean
}

/**
 * Segmentos visíveis convertidos em pixels. Segmentos menores que 1px são
 * agregados (`dense`) com saltos por busca binária: custo O(px · log n),
 * independente do número de transições (#15).
 */
export function segmentSpans(row: WaveRow, viewport: WaveformViewport): SegmentSpan[] {
  const segs = row.segments
  if (segs.length === 0) return []
  // segments[k] (k >= 1) começa em transitions[k - 1].
  const segAt = (time: number) => floorIndex(row.transitions, time) + 1
  const spans: SegmentSpan[] = []
  const xEnd = timeToX(viewport.end, viewport)
  let i = segAt(viewport.start)
  while (i < segs.length && segs[i].start <= viewport.end) {
    const seg = segs[i]
    const x0 = Math.max(timeToX(seg.start, viewport), LAYOUT.labelWidth)
    const x1 = Math.min(timeToX(seg.end, viewport), xEnd)
    if (x1 - x0 >= 1 || i === segs.length - 1) {
      spans.push({ x0, x1: Math.max(x1, x0), segment: seg, dense: false })
      i += 1
      continue
    }
    // Pula para o segmento em vigor 1px adiante.
    const nextX = x0 + 1
    const j = Math.max(i + 1, segAt(xToTime(nextX, viewport)))
    spans.push({ x0, x1: Math.min(nextX, xEnd), segment: seg, dense: j > i + 1 })
    i = j
  }
  return spans
}
