/**
 * Arte da identidade: marca (chip-fachada), azulejo de portas lógicas e
 * ilustrações das telas. Tudo desenhado em SVG, sem imagens externas.
 */
import { useId, useMemo, type CSSProperties } from 'react'

/* ------------------------------------------------------------------ */
/* Marca: chip DIP desenhado como fachada de universidade.             */
/* As três colunas e o ponto do frontão energizam conforme as etapas.  */
/* ------------------------------------------------------------------ */

export interface BrandMarkProps {
  size?: number
  /** Etapas concluídas (0–4): acende colunas da esquerda para a direita e, por fim, o frontão. */
  lit?: number
  className?: string
  title?: string
}

const COLUMNS = [
  { x: 434, top: 512, bottom: 799, rTop: 36, rBottom: 36 },
  { x: 627, top: 543, bottom: 771, rTop: 36, rBottom: 28 },
  { x: 820, top: 512, bottom: 799, rTop: 36, rBottom: 36 },
]

export function BrandMark({ size = 40, lit = 0, className, title }: BrandMarkProps) {
  const mask = useId().replace(/:/g, '')
  return (
    <svg
      className={`brand-mark${className ? ` ${className}` : ''}`}
      width={size}
      height={size * (782 / 902)}
      viewBox="176 222 902 782"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-lit={lit}
    >
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="176" y="222" width="902" height="782">
          <rect x="176" y="222" width="902" height="782" fill="#fff" />
          <circle cx="627" cy="417" r="63" fill="#000" />
          <path d="M571 884V864a55.5 55.5 0 0 1 111 0v20z" fill="#000" />
        </mask>
      </defs>
      <g className="brand-mark__gold" fill="#EAB64E">
        {[506, 620, 734].map((y) => (
          <g key={y}>
            <rect x="188" y={y} width="150" height="52" rx="26" />
            <rect x="916" y={y} width="150" height="52" rx="26" />
          </g>
        ))}
        <rect x="328" y="891" width="598" height="25" rx="12.5" />
        <rect x="285" y="922" width="684" height="29" rx="14.5" />
        <rect x="246" y="958" width="762" height="36" rx="18" />
      </g>
      <path d="M286 401L627 237L968 401Z" fill="#B95D1C" stroke="#B95D1C" strokeWidth="24" strokeLinejoin="round" />
      <circle className={`brand-mark__oculus${lit >= 4 ? ' is-lit' : ''}`} cx="627" cy="315" r="26" />
      <rect x="303" y="430" width="648" height="450" rx="46" fill="#134E3F" mask={`url(#${mask})`} />
      {COLUMNS.map((c, i) => (
        <g key={c.x} className={`brand-mark__col${lit > i ? ' is-lit' : ''}`} style={{ '--i': i } as CSSProperties}>
          <rect x={c.x - 15} y={c.top} width="30" height={c.bottom - c.top} />
          <circle cx={c.x} cy={c.top} r={c.rTop} />
          <circle cx={c.x} cy={c.bottom} r={c.rBottom} />
        </g>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Azulejo modular de portas lógicas (à maneira dos painéis modernistas */
/* de campus). Determinístico por `seed`, para cada etapa ter o seu.    */
/* ------------------------------------------------------------------ */

type TileShape = 'and' | 'quarter' | 'buf' | 'half' | 'dot' | 'empty'
const SHAPES: TileShape[] = ['and', 'quarter', 'buf', 'half', 'dot', 'and', 'quarter', 'empty', 'empty', 'empty']
const TONES = ['var(--tile-a)', 'var(--tile-a)', 'var(--tile-b)', 'var(--tile-b)', 'var(--tile-c)', 'var(--tile-d)']

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 10000) / 10000
  }
}

function tilePath(shape: TileShape, s: number): string | null {
  const h = s / 2
  switch (shape) {
    case 'and': // porta AND: meio retângulo + meio círculo
      return `M0 0H${h}A${h} ${h} 0 0 1 ${h} ${s}H0Z`
    case 'quarter': // quarto de círculo
      return `M0 0H${s}A${s} ${s} 0 0 1 0 ${s}Z`
    case 'buf': // buffer: triângulo
      return `M0 0L${s} ${h}L0 ${s}Z`
    case 'half':
      return `M0 0H${s}V${h}H0Z`
    case 'dot':
      return null
    case 'empty':
      return null
  }
}

export interface GateTilesProps {
  cols: number
  rows: number
  seed?: number
  /** Tamanho de cada módulo em px. */
  cell?: number
  className?: string
}

export function GateTiles({ cols, rows, seed = 7, cell = 44, className }: GateTilesProps) {
  const tiles = useMemo(() => {
    const r = rng(seed * 9973 + cols * 31 + rows)
    const out: { x: number; y: number; shape: TileShape; rot: number; tone: string; delay: number }[] = []
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const shape = SHAPES[Math.floor(r() * SHAPES.length)]
        out.push({
          x,
          y,
          shape,
          rot: Math.floor(r() * 4) * 90,
          tone: TONES[Math.floor(r() * TONES.length)],
          delay: (x + (rows - y)) * 35,
        })
      }
    }
    return out
  }, [cols, rows, seed])

  const s = cell
  return (
    <svg
      className={`gate-tiles${className ? ` ${className}` : ''}`}
      width={cols * s}
      height={rows * s}
      viewBox={`0 0 ${cols * s} ${rows * s}`}
      aria-hidden="true"
    >
      {tiles.map((t) => {
        const d = tilePath(t.shape, s)
        return (
          <g
            key={`${t.x}-${t.y}`}
            className="gate-tiles__cell"
            style={{ '--d': `${t.delay}ms`, transformOrigin: `${t.x * s + s / 2}px ${t.y * s + s / 2}px` } as CSSProperties}
          >
            <g transform={`translate(${t.x * s} ${t.y * s}) rotate(${t.rot} ${s / 2} ${s / 2})`}>
              {d && <path d={d} fill={t.tone} />}
              {t.shape === 'dot' && <circle cx={s / 2} cy={s / 2} r={s / 4} fill={t.tone} />}
            </g>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Upload: protoboard com um chip pairando, que encaixa ao arrastar.    */
/* ------------------------------------------------------------------ */

export function BreadboardArt({ label = 'projeto.zip', seated = false }: { label?: string; seated?: boolean }) {
  const W = 360
  const holes: { x: number; y: number }[] = []
  for (let c = 0; c < 22; c++) {
    for (let r = 0; r < 5; r++) {
      holes.push({ x: 26 + c * 14.6, y: 104 + r * 12 })
      holes.push({ x: 26 + c * 14.6, y: 184 + r * 12 })
    }
  }
  return (
    <svg className={`bb-art${seated ? ' bb-art--seated' : ''}`} viewBox={`0 0 ${W} 280`} width="100%" aria-hidden="true">
      {/* placa */}
      <rect x="6" y="70" width={W - 12} height="200" rx="22" className="bb-art__board" />
      {/* trilhos de alimentação */}
      <path d={`M26 84H${W - 26}`} className="bb-art__rail bb-art__rail--pos" />
      <path d={`M26 256H${W - 26}`} className="bb-art__rail bb-art__rail--neg" />
      {/* canal central */}
      <rect x="20" y="166" width={W - 40} height="8" rx="4" className="bb-art__channel" />
      {holes.map((h) => (
        <rect key={`${h.x}-${h.y}`} x={h.x - 2.6} y={h.y - 2.6} width="5.2" height="5.2" rx="1.6" className="bb-art__hole" />
      ))}
      {/* jumpers */}
      <path d="M40.6 116C40 60 92 54 99 128" className="bb-art__wire bb-art__wire--a" />
      <path d="M318 244C322 292 260 296 260 208" className="bb-art__wire bb-art__wire--b" />
      <path d="M289 104C292 70 318 66 318 84" className="bb-art__wire bb-art__wire--c" />
      {/* chip (desce e encaixa no canal quando há arquivo sobre a área) */}
      <g className="bb-art__chip">
        <g className="bb-art__legs">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <g key={i}>
              <rect x={128 + i * 14.6 - 2.5} y="140" width="5" height="14" rx="2.5" />
              <rect x={128 + i * 14.6 - 2.5} y="186" width="5" height="14" rx="2.5" />
            </g>
          ))}
        </g>
        <rect x="114" y="146" width="116" height="48" rx="10" className="bb-art__body" />
        <path d="M114 162a8 8 0 010 16" className="bb-art__notch" />
        <circle cx="126" cy="185" r="3" className="bb-art__pin1" />
        <text x="172" y="175" textAnchor="middle" className="bb-art__label">
          {label.length > 12 ? `${label.slice(0, 11)}…` : label}
        </text>
      </g>
      {/* sombra que encolhe quando o chip encaixa */}
      <ellipse cx="172" cy="214" rx="56" ry="5" className="bb-art__shadow" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Síntese em espera: código → portas. Uma linha de Verilog vira AND.   */
/* ------------------------------------------------------------------ */

export function SynthArt({ running = false }: { running?: boolean }) {
  return (
    <svg className={`synth-art${running ? ' is-running' : ''}`} viewBox="0 0 320 120" width="100%" aria-hidden="true">
      <rect x="6" y="18" width="118" height="84" rx="16" className="synth-art__code" />
      {[36, 52, 68, 84].map((y, i) => (
        <rect key={y} x="22" y={y - 4} width={[70, 86, 54, 76][i]} height="8" rx="4" className={`synth-art__line synth-art__line--${i}`} />
      ))}
      <path d="M132 60h40" className="synth-art__arrow" />
      <path d="M164 52l9 8-9 8" className="synth-art__arrow" />
      <g className="synth-art__gate">
        <path d="M196 26h26a34 34 0 010 68h-26z" className="synth-art__and" />
        <path d="M184 44h12M184 76h12" className="synth-art__wire" />
        <path d="M256 60h20" className="synth-art__wire" />
        <circle cx="282" cy="60" r="6" className="synth-art__pad" />
        <circle cx="184" cy="44" r="4.5" className="synth-art__pad" />
        <circle cx="184" cy="76" r="4.5" className="synth-art__pad" />
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Simulação em espera: um relógio e um sinal desenhando-se.            */
/* ------------------------------------------------------------------ */

export function WaveArt() {
  return (
    <svg className="wave-art" viewBox="0 0 320 120" width="100%" aria-hidden="true">
      <rect x="4" y="8" width="312" height="104" rx="18" className="wave-art__screen" />
      {[40, 80, 120, 160, 200, 240, 280].map((x) => (
        <path key={x} d={`M${x} 18v84`} className="wave-art__grid" />
      ))}
      <path d="M20 52h20V30h20v22h20V30h20v22h20V30h20v22h20V30h20v22h20V30h20v22h20V30h20v22h20" className="wave-art__clk" />
      <path d="M20 90h10l6-12h68l6 12h40l6-12h96l6 12h52" className="wave-art__bus" />
      <path d="M20 78h10l6 12h68l6-12h40l6 12h96l6-12h52" className="wave-art__bus" />
    </svg>
  )
}
