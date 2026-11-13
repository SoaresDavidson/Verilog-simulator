/**
 * Arte da identidade "Do código ao sinal": marca (uma porta AND num selo
 * amarelo) e as artes de espera da síntese e da simulação. O mascote e as
 * cenas animadas ficam em `illustrations.tsx`.
 */
/* ------------------------------------------------------------------ */
/* Marca: porta AND com o "< >" do código dentro, sobre selo amarelo.   */
/* O ponto de saída acende em verde quando a simulação roda.            */
/* ------------------------------------------------------------------ */

export interface BrandMarkProps {
  size?: number
  /** Etapas concluídas (0–4); com 4 a saída da porta acende. */
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
      viewBox="0 0 44 44"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-lit={lit}
    >
      <rect className="brand-mark__plate" width="44" height="44" rx="12" />
      <path className="brand-mark__in" d="M5 17h9M5 27h9M36 22h3" />
      <path className="brand-mark__gate" d="M13 9h10a13 13 0 0 1 0 26H13z" />
      <path className="brand-mark__code" d="M21.5 17.5L17 22l4.5 4.5M26 17.5l4.5 4.5-4.5 4.5" />
      <circle className={`brand-mark__out${lit >= 4 ? ' is-lit' : ''}`} cx="40" cy="22" r="2.8" />
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
