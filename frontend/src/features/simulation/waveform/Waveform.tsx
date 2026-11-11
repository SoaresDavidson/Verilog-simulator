import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { formatTime } from '../simlog'
import { createCanvasRenderer } from './canvasRenderer'
import type { WaveformModel } from './model'
import type { WaveformRenderer, WaveformRendererFactory } from './renderer'
import { canvasHeight, fitWindow, MAX_ZOOM_LEVEL, xToTime, zoomFactor, zoomWindow, type WaveformViewport } from './viewport'

export interface WaveformProps {
  model: WaveformModel
  /** Clique no gráfico: leva o cursor ao timestamp existente `<=` tempo. */
  onSeekTime?: (time: number) => void
  /** Renderer substituível (padrão: Canvas 2D). */
  rendererFactory?: WaveformRendererFactory
}

const FALLBACK_WIDTH = 640

/** Largura observada do elemento (ResizeObserver quando disponível). */
function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width || FALLBACK_WIDTH
}

function truncationText(model: WaveformModel): string | null {
  const t = model.truncation
  if (!t) return null
  const parts = ['A timeline foi truncada pelo servidor; nem todos os instantes estão disponíveis']
  const details: string[] = []
  if (t.reason) details.push(`motivo: ${t.reason}`)
  if (t.totalTimestamps !== null) details.push(`${t.totalTimestamps.toLocaleString('pt-BR')} timestamps no total, ${model.timestamps.length.toLocaleString('pt-BR')} recebidos`)
  return details.length ? `${parts[0]} (${details.join('; ')}).` : `${parts[0]}.`
}

/** Waveform (#33): toolbar de zoom/ajuste + canvas desenhado por um renderer isolado. */
export function Waveform({ model, onSeekTime, rendererFactory = createCanvasRenderer }: WaveformProps) {
  const zoomId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<WaveformRenderer | null>(null)
  const [zoom, setZoom] = useState(0)
  const width = useElementWidth(wrapRef)

  const viewport = useMemo<WaveformViewport>(() => {
    const window_ = zoom === 0 ? fitWindow(model) : zoomWindow(model, zoom, model.cursor)
    return {
      ...window_,
      width,
      height: canvasHeight(model.rows.length),
      pixelRatio: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
    }
  }, [model, zoom, width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = rendererFactory(canvas)
    rendererRef.current = renderer
    return () => {
      renderer.destroy()
      if (rendererRef.current === renderer) rendererRef.current = null
    }
  }, [rendererFactory])

  useEffect(() => {
    if (model.rows.length === 0) return
    let frame = 0
    const paint = () => rendererRef.current?.draw(model, viewport)
    if (typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(paint)
      return () => cancelAnimationFrame(frame)
    }
    paint()
  }, [model, viewport])

  const onClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!onSeekTime) return
    const rect = event.currentTarget.getBoundingClientRect()
    const time = xToTime(event.clientX - rect.left, viewport)
    if (time >= viewport.start && time <= viewport.end) onSeekTime(time)
  }

  const warning = truncationText(model)
  const cursorLabel = model.cursor === null ? 'sem cursor' : `cursor em ${formatTime(model.cursor, model.timescale)}`
  const label = `Formas de onda de ${model.rows.length} ${model.rows.length === 1 ? 'sinal' : 'sinais'}, de ${formatTime(viewport.start, model.timescale)} a ${formatTime(viewport.end, model.timescale)}, ${cursorLabel}.`

  return (
    <div className="sim-wf">
      <div className="sim-wf__bar">
        <h2 className="sim-h sim-wf__title">Formas de onda</h2>
        <button type="button" className="btn bg bsm" onClick={() => setZoom(0)} disabled={zoom === 0} title="Ajustar à simulação inteira">
          Ajustar
        </button>
        <label htmlFor={zoomId}>Zoom</label>
        <input
          id={zoomId}
          type="range"
          min={0}
          max={MAX_ZOOM_LEVEL}
          step={1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-valuetext={`${zoomFactor(zoom)}x`}
        />
        <span className="sim-wf__zoom">{zoomFactor(zoom)}x</span>
      </div>
      {warning && (
        <p className="sim-warn" role="note">
          {warning}
        </p>
      )}
      {model.omittedRows > 0 && (
        <p className="sim-warn" role="note">
          Exibindo {model.rows.length} de {model.rows.length + model.omittedRows} sinais marcados. Desmarque sinais para ver os demais.
        </p>
      )}
      <div className="sim-wf__canvas" ref={wrapRef}>
        {model.rows.length === 0 ? (
          <p className="muted sim-wf__empty">Nenhum sinal visível. Marque sinais na lista para desenhá-los.</p>
        ) : (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={label}
            style={{ width: '100%', height: viewport.height }}
            onClick={onClick}
          />
        )}
      </div>
    </div>
  )
}
