import { useState } from 'react'
import type { NetBit } from '../../../api/types'

const COLLAPSED_LIMIT = 32

const CONST_TITLE: Record<string, string> = {
  '0': 'constante 0 (baixo)',
  '1': 'constante 1 (alto)',
  x: 'constante X (indefinido)',
  z: 'constante Z (alta impedância)',
}

export interface BitListProps {
  bits: readonly NetBit[]
  /** Bit de net em foco (destacado em todas as listas). */
  focusedBit: number | null
  onFocusBit: (bit: number | null) => void
  /** Rótulo do vetor para leitor de tela (ex.: `porta a`). */
  label: string
}

/**
 * Bits LSB-first. Índices de net são botões (correlação); constantes usam as
 * cores de estado lógico e não são interativas.
 */
export function BitList({ bits, focusedBit, onFocusBit, label }: BitListProps) {
  const [expanded, setExpanded] = useState(false)
  if (bits.length === 0) return <span className="muted">—</span>
  const visible = expanded ? bits : bits.slice(0, COLLAPSED_LIMIT)
  const hidden = bits.length - visible.length

  return (
    <ul className="nx-bits" aria-label={`Bits de ${label} (LSB primeiro)`}>
      {visible.map((bit, index) =>
        typeof bit === 'number' ? (
          <li key={index}>
            <button
              type="button"
              className={`nx-bit${focusedBit === bit ? ' nx-bit--on' : ''}`}
              aria-pressed={focusedBit === bit}
              aria-label={`bit ${index}: net ${bit}`}
              title={`[${index}] net ${bit}`}
              onClick={() => onFocusBit(focusedBit === bit ? null : bit)}
            >
              {bit}
            </button>
          </li>
        ) : (
          <li key={index}>
            <span
              className={`b0 s${bit} nx-const`}
              data-const={bit}
              title={`[${index}] ${CONST_TITLE[bit]}`}
              aria-label={`bit ${index}: ${CONST_TITLE[bit]}`}
            >
              {bit.toUpperCase()}
            </span>
          </li>
        ),
      )}
      {hidden > 0 && (
        <li>
          <button type="button" className="nx-more" onClick={() => setExpanded(true)}>
            +{hidden} bits
          </button>
        </li>
      )}
    </ul>
  )
}
