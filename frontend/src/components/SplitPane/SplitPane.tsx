import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { ratioBounds } from './ratio'
import './SplitPane.css'

/** `horizontal` = painéis lado a lado; `vertical` = um sobre o outro. */
export type SplitOrientation = 'horizontal' | 'vertical'

export interface SplitPaneProps {
  first: ReactNode
  second: ReactNode
  orientation?: SplitOrientation
  /** Abaixo desta largura do container, empilha (`vertical`). */
  stackBelow?: number
  /** Fração inicial do primeiro painel (0–1). */
  defaultRatio?: number
  /** Tamanho mínimo (px) de cada painel no eixo do split. */
  minFirst?: number
  minSecond?: number
  /** Passo do teclado (fração). PageUp/PageDown usam 4×. */
  step?: number
  /** Rótulo acessível do divisor. */
  separatorLabel: string
  onRatioChange?: (ratio: number) => void
  className?: string
}

interface Size {
  width: number
  height: number
}

function useContainerSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setSize((prev) => (prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Split pane genérico (#35): divisor arrastável por mouse/toque (pointer
 * events) e teclado (`role="separator"`, setas, PageUp/PageDown, Home/End),
 * com mínimos por painel e empilhamento responsivo. Não conhece o conteúdo.
 */
export function SplitPane({
  first,
  second,
  orientation = 'horizontal',
  stackBelow,
  defaultRatio = 0.5,
  minFirst = 80,
  minSecond = 80,
  step = 0.05,
  separatorLabel,
  onRatioChange,
  className,
}: SplitPaneProps) {
  const firstId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const size = useContainerSize(containerRef)
  const [ratio, setRatio] = useState(defaultRatio)
  const [dragging, setDragging] = useState(false)

  const effectiveOrientation: SplitOrientation =
    stackBelow !== undefined && size.width > 0 && size.width < stackBelow ? 'vertical' : orientation
  const horizontal = effectiveOrientation === 'horizontal'
  const axisSize = horizontal ? size.width : size.height
  const bounds = ratioBounds(axisSize, minFirst, minSecond)
  const current = clamp(ratio, bounds.min, bounds.max)

  const update = (next: number) => {
    const value = clamp(next, bounds.min, bounds.max)
    setRatio(value)
    onRatioChange?.(value)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.currentTarget.focus()
    setDragging(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const total = horizontal ? rect.width : rect.height
    if (total <= 0) return
    const offset = horizontal ? event.clientX - rect.left : event.clientY - rect.top
    const live = ratioBounds(total, minFirst, minSecond)
    const value = clamp(offset / total, live.min, live.max)
    setRatio(value)
    onRatioChange?.(value)
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    setDragging(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number | 'min' | 'max'> = {
      ArrowLeft: -step,
      ArrowUp: -step,
      ArrowRight: step,
      ArrowDown: step,
      PageUp: -step * 4,
      PageDown: step * 4,
      Home: 'min',
      End: 'max',
    }
    const action = keys[event.key]
    if (action === undefined) return
    event.preventDefault()
    if (action === 'min') update(bounds.min)
    else if (action === 'max') update(bounds.max)
    else update(current + action)
  }

  const minProp = horizontal ? 'minWidth' : 'minHeight'
  const pct = (value: number) => Math.round(value * 100)

  return (
    <div
      ref={containerRef}
      className={`split-pane split-pane--${effectiveOrientation}${dragging ? ' split-pane--dragging' : ''}${className ? ` ${className}` : ''}`}
      data-orientation={effectiveOrientation}
    >
      <div id={firstId} className="split-pane__pane" style={{ flexBasis: `calc(${current * 100}% - 4px)`, [minProp]: minFirst }}>
        {first}
      </div>
      <div
        className="split-pane__sep"
        role="separator"
        tabIndex={0}
        aria-label={separatorLabel}
        aria-controls={firstId}
        // O separador é perpendicular ao eixo do split.
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuenow={pct(current)}
        aria-valuemin={pct(bounds.min)}
        aria-valuemax={pct(bounds.max)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      />
      <div className="split-pane__pane split-pane__pane--second" style={{ [minProp]: minSecond }}>
        {second}
      </div>
    </div>
  )
}
