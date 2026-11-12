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

/* ------------------------------------------------------------------ */
/* Upload: a maleta didática aberta. Tampa com espuma e plaqueta; base  */
/* com protoboard, display de 7 segmentos, bornes, chaves e LEDs.       */
/* `state`: idle (chip pairando), drag (arquivo sobre a área), seated   */
/* (arquivo aceito: chip encaixado, LEDs verdes).                       */
/* ------------------------------------------------------------------ */

export type KitState = 'idle' | 'drag' | 'seated'

export function KitCaseArt({ label = 'projeto.zip', state = 'idle' }: { label?: string; state?: KitState }) {
  const holes: Array<[number, number]> = []
  for (let c = 0; c < 17; c++) for (let r = 0; r < 4; r++) holes.push([62 + c * 12, 180 + r * 10], [62 + c * 12, 236 + r * 10])
  const foam: Array<[number, number]> = []
  for (let c = 0; c < 26; c++) for (let r = 0; r < 3; r++) foam.push([58 + c * 16 + (r % 2) * 8, 36 + r * 16])
  const display = state === 'seated' ? ' OK' : state === 'drag' ? 'SOLTE' : '- - -'
  const chip = label.length > 12 ? `${label.slice(0, 11)}…` : label
  return (
    <svg className={`kit kit--${state}`} viewBox="0 0 520 320" width="100%" aria-hidden="true">
      {/* tampa */}
      <g className="kit__lid">
        <rect x="18" y="8" width="484" height="104" rx="16" className="kit__shell" />
        <rect x="34" y="20" width="452" height="72" rx="10" className="kit__foam" />
        {foam.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="5" className="kit__foam-dot" />
        ))}
        <rect x="186" y="44" width="148" height="30" rx="6" className="kit__nameplate" />
        <text x="260" y="64" textAnchor="middle" className="kit__nameplate-text">
          VERILOG CLASSROOM
        </text>
      </g>
      {/* dobradiças */}
      <rect x="120" y="110" width="44" height="10" rx="3" className="kit__hinge" />
      <rect x="356" y="110" width="44" height="10" rx="3" className="kit__hinge" />
      {/* base */}
      <rect x="18" y="118" width="484" height="196" rx="16" className="kit__shell" />
      <rect x="32" y="130" width="456" height="172" rx="10" className="kit__panel" />
      {/* protoboard */}
      <rect x="48" y="166" width="216" height="118" rx="8" className="kit__bb" />
      <path d="M58 172H254M58 278H254" className="kit__rail" />
      <rect x="54" y="221" width="204" height="7" rx="3.5" className="kit__channel" />
      {holes.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 2.2} y={y - 2.2} width="4.4" height="4.4" rx="1.2" className="kit__hole" />
      ))}
      <path d="M74 190C70 150 118 146 122 196" className="kit__wire kit__wire--r" />
      <path d="M230 262C236 300 196 302 194 246" className="kit__wire kit__wire--b" />
      {/* chip */}
      <g className="kit__chip">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i}>
            <rect x={108 + i * 12 - 2} y="206" width="4" height="12" rx="2" className="kit__leg" />
            <rect x={108 + i * 12 - 2} y="232" width="4" height="12" rx="2" className="kit__leg" />
          </g>
        ))}
        <rect x="96" y="212" width="86" height="26" rx="6" className="kit__chip-body" />
        <path d="M96 219a6 6 0 0 1 0 12" className="kit__chip-notch" />
        <text x="140" y="229" textAnchor="middle" className="kit__chip-text">
          {chip}
        </text>
      </g>
      {/* display de 7 segmentos */}
      <rect x="282" y="146" width="190" height="56" rx="8" className="kit__seg" />
      <text x="377" y="185" textAnchor="middle" className="kit__seg-text">
        {display}
      </text>
      <text x="290" y="216" className="kit__silk">
        DISPLAY
      </text>
      {/* bornes */}
      {[
        ['var(--jack-red)', 296],
        ['var(--jack-black)', 330],
        ['var(--jack-yellow)', 364],
        ['var(--jack-blue)', 398],
      ].map(([c, x]) => (
        <g key={String(x)}>
          <circle cx={Number(x)} cy="244" r="12" style={{ fill: String(c) }} className="kit__jack" />
          <circle cx={Number(x)} cy="244" r="4.5" className="kit__jack-hole" />
        </g>
      ))}
      {/* chaves e LEDs */}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={290 + i * 34} y="268" width="26" height="14" rx="7" className="kit__sw" />
          <circle cx={297 + i * 34 + (state === 'seated' ? 12 : 0)} cy="275" r="5" className="kit__sw-knob" />
          <circle cx={448} cy={226 + i * 16} r="5" className={`kit__led kit__led--${i}`} />
        </g>
      ))}
    </svg>
  )
}
