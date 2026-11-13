/**
 * "Entenda esta etapa": módulo didático com pequenos desenhos que explicam o
 * conceito da tela (síntese, símbolos do diagrama, formas de onda).
 * Fica aberto por padrão; a escolha de recolher é lembrada por tela.
 */
import { useState, type ReactNode } from 'react'
import { Bit } from './illustrations'
import { IconChevron } from './icons'

export interface ExplainerItem {
  art: ReactNode
  title: string
  text: ReactNode
}

const KEY = 'verilog-classroom:explainer:'

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const saved = window.localStorage.getItem(KEY + id)
    return saved === null ? fallback : saved !== 'closed'
  } catch {
    return fallback
  }
}

export function Explainer({
  id,
  title,
  items,
  className,
  defaultOpen = true,
}: {
  id: string
  title: string
  items: ExplainerItem[]
  className?: string
  /** Estado inicial quando o aluno ainda não escolheu abrir ou recolher. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen))
  return (
    <details
      className={`card explainer${className ? ` ${className}` : ''}`}
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open
        setOpen(next)
        try {
          window.localStorage.setItem(KEY + id, next ? 'open' : 'closed')
        } catch {
          // Só conveniência.
        }
      }}
    >
      <summary className="explainer__sum">
        <IconChevron size={16} className="explainer__chev" />
        <Bit pose="lupa" className="explainer__bit" />
        <span className="explainer__title">{title}</span>
        <span className="explainer__hint">{open ? 'recolher' : 'mostrar'}</span>
      </summary>
      <ol className="explainer__list">
        {items.map((item, i) => (
          <li key={item.title} className="explainer__item" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="explainer__art" aria-hidden="true">
              {item.art}
            </div>
            <div>
              <b>{item.title}</b>
              <p>{item.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  )
}

/* ------------------------------------------------------------------ */
/* Mini-desenhos (60×40)                                               */
/* ------------------------------------------------------------------ */

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export function MiniArt({ kind }: { kind: string }) {
  let g: ReactNode
  switch (kind) {
    case 'and':
      g = (
        <>
          <path {...S} d="M6 14h12M6 26h12M42 20h12" />
          <path {...S} className="ma-fill" d="M18 8h12a12 12 0 0 1 0 24H18z" />
        </>
      )
      break
    case 'or':
      g = (
        <>
          <path {...S} d="M6 14h16M6 26h16M44 20h10" />
          <path {...S} className="ma-fill" d="M18 8q8 12 0 24q18 0 26-12q-8-12-26-12z" />
        </>
      )
      break
    case 'xor':
      g = (
        <>
          <path {...S} d="M6 14h16M6 26h16M46 20h8M15 8q8 12 0 24" />
          <path {...S} className="ma-fill" d="M20 8q8 12 0 24q18 0 26-12q-8-12-26-12z" />
        </>
      )
      break
    case 'not':
      g = (
        <>
          <path {...S} d="M6 20h12M46 20h8" />
          <path {...S} className="ma-fill" d="M18 9l20 11-20 11z" />
          <circle {...S} cx="42" cy="20" r="3.5" />
        </>
      )
      break
    case 'mux':
      g = (
        <>
          <path {...S} d="M6 13h16M6 27h16M38 20h16M30 34v4" />
          <path {...S} className="ma-fill" d="M22 4l16 6v20l-16 6z" />
        </>
      )
      break
    case 'dff':
      g = (
        <>
          <path {...S} d="M6 13h14M6 28h14M40 13h14" />
          <rect {...S} className="ma-fill" x="20" y="5" width="20" height="30" rx="3" />
          <path {...S} d="M20 24l5 4-5 4" />
        </>
      )
      break
    case 'arith':
      g = (
        <>
          <path {...S} d="M6 13h14M6 27h14M40 20h14" />
          <rect {...S} className="ma-fill" x="20" y="6" width="20" height="28" rx="5" />
          <path {...S} d="M30 15v10M25 20h10" />
        </>
      )
      break
    case 'flag':
      g = (
        <>
          <rect x="4" y="13" width="28" height="14" rx="7" className="ma-ink" />
          <text x="18" y="23.5" textAnchor="middle" className="ma-txt-inv">
            clk
          </text>
          <path {...S} d="M32 20h8" />
          <rect {...S} className="ma-fill" x="40" y="8" width="16" height="24" rx="3" />
        </>
      )
      break
    case 'code':
      g = (
        <>
          <rect x="4" y="4" width="52" height="32" rx="5" className="ma-ink" />
          <rect x="10" y="11" width="22" height="3.5" rx="1.75" className="ma-line-a" />
          <rect x="10" y="18" width="34" height="3.5" rx="1.75" className="ma-line-b" />
          <rect x="10" y="25" width="16" height="3.5" rx="1.75" className="ma-line-a" />
        </>
      )
      break
    case 'yosys':
      g = (
        <>
          <path {...S} d="M4 20h14M42 20h14" />
          <path {...S} d="M48 14l6 6-6 6" />
          <circle {...S} className="ma-fill" cx="30" cy="20" r="11" />
          <path {...S} d="M30 13v14M23 20h14" />
        </>
      )
      break
    case 'netlist':
      g = (
        <>
          <path {...S} className="ma-fill" d="M6 8h9a7 7 0 0 1 0 14H6z" />
          <path {...S} className="ma-fill" d="M34 18q6 8 0 16q12 0 18-8q-6-8-18-8z" />
          <path {...S} d="M22 15h6v12h6" />
        </>
      )
      break
    case 'select':
      g = (
        <>
          <rect x="6" y="11" width="22" height="12" rx="6" className="ma-ink" />
          <circle cx="22" cy="17" r="4" className="ma-knob" />
          <path {...S} d="M34 17h20M34 28h14" />
        </>
      )
      break
    case 'w0':
      g = <path {...S} className="ma-s0" d="M4 30H56" />
      break
    case 'w1':
      g = <path {...S} className="ma-s1" d="M4 10H56" />
      break
    case 'wx':
      g = (
        <>
          <rect x="4" y="10" width="52" height="20" className="ma-sx-fill" />
          <path {...S} className="ma-sx" d="M4 10H56M4 30H56" />
        </>
      )
      break
    case 'wz':
      g = <path {...S} className="ma-sz" strokeDasharray="4 4" d="M4 20H56" />
      break
    case 'wbus':
      g = (
        <>
          <path {...S} className="ma-s1" d="M4 10h18l4 10-4 10H4M26 20l4-10h26M30 30h26" />
          <text x="13" y="23.5" textAnchor="middle" className="ma-txt">
            0A
          </text>
          <text x="43" y="23.5" textAnchor="middle" className="ma-txt">
            2A
          </text>
        </>
      )
      break
    case 'clock':
      g = <path {...S} className="ma-s1" d="M4 30h6V10h10v20h10V10h10v20h10V10h6" />
      break
    default:
      g = null
  }
  return (
    <svg className="mini-art" width="60" height="40" viewBox="0 0 60 40">
      {g}
    </svg>
  )
}
