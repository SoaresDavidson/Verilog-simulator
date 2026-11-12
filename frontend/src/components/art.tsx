/**
 * Arte da identidade "Do código ao sinal": marca (uma porta AND num selo
 * amarelo), encaixes para as ilustrações geradas pelo time e as artes em SVG
 * que servem de reserva enquanto a imagem não existe.
 */
import { useState, type ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* Ilustração raster em public/assets/img/<name>.webp. Se o arquivo     */
/* ainda não existe, mostra a arte em SVG passada em `fallback`.        */
/* ------------------------------------------------------------------ */

export function Art({ name, fallback, className }: { name: string; fallback?: ReactNode; className?: string }) {
  const [ok, setOk] = useState(true)
  if (!ok) return <>{fallback}</>
  return (
    <img
      className={`art${className ? ` ${className}` : ''}`}
      src={`${import.meta.env.BASE_URL}assets/img/${name}.webp`}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setOk(false)}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Marca: porta AND em tinta sobre selo amarelo. A saída acende em      */
/* verde quando a simulação roda.                                       */
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
      viewBox="0 0 40 40"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-lit={lit}
    >
      <rect className="brand-mark__plate" width="40" height="40" rx="11" />
      <path className="brand-mark__gate" d="M12 10h8a10 10 0 0 1 0 20h-8z" />
      <path className="brand-mark__in" d="M4 15h8M4 25h8" />
      <path className={`brand-mark__out${lit >= 4 ? ' is-lit' : ''}`} d="M30 20h6" />
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
