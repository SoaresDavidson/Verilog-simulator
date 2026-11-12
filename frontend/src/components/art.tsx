/**
 * Arte da identidade "Maleta Didática": marca (módulo do kit), protoboard do
 * upload e ilustrações das telas. Tudo desenhado em SVG, sem imagens externas.
 */

/* ------------------------------------------------------------------ */
/* Marca: um módulo da maleta didática com uma porta AND serigrafada e  */
/* o borne vermelho na saída. O LED acende quando a simulação roda.     */
/* ------------------------------------------------------------------ */

export interface BrandMarkProps {
  size?: number
  /** Etapas concluídas (0–4); com 4 o LED do módulo acende. */
  lit?: number
  className?: string
  title?: string
}

export function BrandMark({ size = 40, lit = 0, className, title }: BrandMarkProps) {
  return (
    <svg
      className={`brand-mark${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 52 52"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-lit={lit}
    >
      <rect className="brand-mark__plate" x="1.5" y="1.5" width="49" height="49" rx="12" />
      <path className="brand-mark__silk" d="M14 15h10.5a10.5 10.5 0 0 1 0 21H14z" fill="none" />
      <path className="brand-mark__silk" d="M5.5 20.5h8.5M5.5 30.5h8.5M35 25.5h5" fill="none" />
      <circle className="brand-mark__jack" cx="43.5" cy="25.5" r="5.6" />
      <circle className="brand-mark__hole" cx="43.5" cy="25.5" r="2" />
      <circle className={`brand-mark__led${lit >= 4 ? ' is-lit' : ''}`} cx="43.5" cy="10" r="2.6" />
      {[0, 1, 2].map((i) => (
        <rect key={i} className={`brand-mark__step${lit > i ? ' is-lit' : ''}`} x={14 + i * 7} y="42" width="5" height="3" rx="1.5" />
      ))}
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
