import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** Transformação tela = conteúdo * k + (x, y). */
export interface View {
  k: number
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 3
const FALLBACK: Size = { width: 800, height: 480 }

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Zoom mínimo do enquadramento automático: abaixo disso o texto fica ilegível. */
export const MIN_FIT_ZOOM = 0.4

/**
 * Enquadra o conteúdo (sem ampliar além de 1.25x). Se não couber com zoom
 * legível, alinha ao canto superior esquerdo (entradas) em vez de centralizar.
 */
export function fitView(content: Size, viewport: Size, margin = 16): View {
  const k = clamp(
    Math.min((viewport.width - margin * 2) / Math.max(content.width, 1), (viewport.height - margin * 2) / Math.max(content.height, 1)),
    MIN_FIT_ZOOM,
    1.25,
  )
  const axis = (avail: number, size: number) => (size * k <= avail - margin * 2 ? (avail - size * k) / 2 : margin)
  return { k, x: axis(viewport.width, content.width), y: axis(viewport.height, content.height) }
}

/** Zoom mantendo fixo o ponto de tela `(cx, cy)`. */
export function zoomAt(view: View, factor: number, cx: number, cy: number): View {
  const k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM)
  const r = k / view.k
  return { k, x: cx - (cx - view.x) * r, y: cy - (cy - view.y) * r }
}

/** Centraliza o ponto de conteúdo `(px, py)`. */
export function centerOn(view: View, viewport: Size, px: number, py: number, minK = view.k): View {
  const k = clamp(Math.max(view.k, minK), MIN_ZOOM, MAX_ZOOM)
  return { k, x: viewport.width / 2 - px * k, y: viewport.height / 2 - py * k }
}

/**
 * Estado de zoom/pan de um viewport. O enquadramento inicial é derivado
 * enquanto o usuário não mexe; trocar `contentKey` (novo layout) volta a
 * enquadrar.
 */
export function useViewport(containerRef: RefObject<HTMLElement | null>, content: Size, contentKey: unknown) {
  const [size, setSize] = useState<Size>(FALLBACK)
  const [manual, setManual] = useState<{ key: unknown; view: View } | null>(null)
  const view = manual && manual.key === contentKey ? manual.view : fitView(content, size)

  const sizeRef = useRef(size)
  useEffect(() => {
    sizeRef.current = size
  })
  const { width: cw, height: ch } = content

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setSize({ width: r.width, height: r.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  const update = useCallback(
    (fn: (v: View, s: Size) => View) =>
      setManual((prev) => {
        const s = sizeRef.current
        const base = prev && prev.key === contentKey ? prev.view : fitView({ width: cw, height: ch }, s)
        return { key: contentKey, view: fn(base, s) }
      }),
    [contentKey, cw, ch],
  )

  const zoomBy = useCallback(
    (factor: number, at?: { x: number; y: number }) =>
      update((v, s) => zoomAt(v, factor, at?.x ?? s.width / 2, at?.y ?? s.height / 2)),
    [update],
  )
  const panBy = useCallback((dx: number, dy: number) => update((v) => ({ ...v, x: v.x + dx, y: v.y + dy })), [update])
  const fit = useCallback(() => setManual(null), [])
  const focusPoint = useCallback(
    (px: number, py: number, minK = 1) => update((v, s) => centerOn(v, s, px, py, minK)),
    [update],
  )

  return { view, size, zoomBy, panBy, fit, focusPoint }
}
