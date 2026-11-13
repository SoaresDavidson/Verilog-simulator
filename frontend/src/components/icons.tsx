/**
 * Ícones e ilustrações autorais da identidade "Bancada no Campus".
 * Ícones: grade 20×20, traço 1.8 com pontas arredondadas, `currentColor`.
 * Ilustrações: usam as variáveis de cor do tema (--pcb, --copper, --gold...).
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Icon>
)
export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
  </Icon>
)
export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Icon>
)
export const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 10h11" />
  </Icon>
)
/** Enquadrar: quatro cantos de mira. */
export const IconFit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5v-2a2 2 0 012-2h2M12.5 3.5h2a2 2 0 012 2v2M16.5 12.5v2a2 2 0 01-2 2h-2M7.5 16.5h-2a2 2 0 01-2-2v-2" />
    <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
  </Icon>
)
export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8.8" cy="8.8" r="5" />
    <path d="M12.6 12.6l3.9 3.9" />
  </Icon>
)
export const IconEnter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15.5 4.5v5a2.5 2.5 0 01-2.5 2.5H5" />
    <path d="M8 8.5L4.5 12 8 15.5" />
  </Icon>
)
export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 10h11.5M11 5.5l4.5 4.5-4.5 4.5" />
  </Icon>
)
export const IconArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 10H4.5M9 5.5L4.5 10 9 14.5" />
  </Icon>
)
export const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 5l5 5-5 5" />
  </Icon>
)
export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 4.6v10.8a.8.8 0 001.2.7l8.6-5.4a.8.8 0 000-1.4L7.7 3.9a.8.8 0 00-1.2.7z" fill="currentColor" />
  </Icon>
)
export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="4" width="3.4" height="12" rx="1.2" fill="currentColor" />
    <rect x="11.6" y="4" width="3.4" height="12" rx="1.2" fill="currentColor" />
  </Icon>
)
export const IconStepBack = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4.5v11" />
    <path d="M15 5.4v9.2a.7.7 0 01-1.1.6l-6.6-4.6a.7.7 0 010-1.2l6.6-4.6a.7.7 0 011.1.6z" fill="currentColor" />
  </Icon>
)
export const IconStepFwd = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 4.5v11" />
    <path d="M5 5.4v9.2a.7.7 0 001.1.6l6.6-4.6a.7.7 0 000-1.2L6.1 4.8A.7.7 0 005 5.4z" fill="currentColor" />
  </Icon>
)
export const IconRestart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 10a5.5 5.5 0 105.5-5.5H7" />
    <path d="M9 2.2L6.6 4.5 9 6.8" />
  </Icon>
)
export const IconRun = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 13h3l1.5-6 2.5 9 2-6 1.5 3h4.5" />
  </Icon>
)
export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13V3.5M6 7.2L10 3.2l4 4" />
    <path d="M3.5 12.5v2a2 2 0 002 2h9a2 2 0 002-2v-2" />
  </Icon>
)
export const IconSwap = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h11M12 4l3 3-3 3M16 13H5M8 10l-3 3 3 3" />
  </Icon>
)
export const IconPower = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3v6.5" />
    <path d="M6 5.6a6 6 0 108 0" />
  </Icon>
)
export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="3.4" />
    <path d="M10 2.5v1.6M10 15.9v1.6M2.5 10h1.6M15.9 10h1.6M4.7 4.7l1.1 1.1M14.2 14.2l1.1 1.1M4.7 15.3l1.1-1.1M14.2 5.8l1.1-1.1" />
  </Icon>
)
export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15.8 12.4A6.5 6.5 0 017.6 4.2 6.5 6.5 0 1015.8 12.4z" />
  </Icon>
)
export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.2l7.4 12.8H2.6z" />
    <path d="M10 8.3v3.4" />
    <circle cx="10" cy="13.9" r=".5" fill="currentColor" />
  </Icon>
)
export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 9.2v4.3" />
    <circle cx="10" cy="6.6" r=".5" fill="currentColor" />
  </Icon>
)
export const IconFolder = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.8 6a2 2 0 012-2h3.2l1.8 2h5.4a2 2 0 012 2v6a2 2 0 01-2 2H4.8a2 2 0 01-2-2z" />
  </Icon>
)
/** Estrela de "escolhido": um pad de solda com miolo. */
export const IconPinned = (p: IconProps) => (
  <Icon {...p} strokeWidth={2}>
    <circle cx="10" cy="10" r="5.2" />
    <circle cx="10" cy="10" r="1.9" fill="currentColor" stroke="none" />
  </Icon>
)
export const IconTerminal = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.8" y="3.8" width="14.4" height="12.4" rx="3" />
    <path d="M6 8l2.5 2L6 12M10.5 12.5h3.5" />
  </Icon>
)
export const IconLayers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3l7 3.8-7 3.8-7-3.8z" />
    <path d="M3 10.6l7 3.8 7-3.8M3 13.9l7 3.8 7-3.8" />
  </Icon>
)

/* ------------------------------------------------------------------ */
/* Glifos de hardware (estatísticas e arquivos) — duas cores, sólidos  */
/* ------------------------------------------------------------------ */

type GlyphProps = { size?: number; className?: string }

/** Chip DIP: módulo. */
export function GlyphChip({ size = 36, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="8" y="6" width="20" height="24" rx="5" fill="var(--glyph-ink)" />
      <path d="M15 6a3 3 0 006 0" fill="var(--surface)" />
      <g fill="var(--gold)">
        {[11, 16.5, 22].map((y) => (
          <g key={y}>
            <rect x="3" y={y} width="5" height="2.6" rx="1.3" />
            <rect x="28" y={y} width="5" height="2.6" rx="1.3" />
          </g>
        ))}
      </g>
      <circle cx="12.5" cy="11" r="1.5" fill="var(--copper-2)" />
    </svg>
  )
}

/** Porta AND + inversor: células. */
export function GlyphGate({ size = 36, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M2.5 13h6M2.5 23h6" stroke="var(--glyph-ink)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8 8h9a10 10 0 010 20H8z" fill="var(--copper)" />
      <circle cx="30" cy="18" r="3.2" fill="none" stroke="var(--glyph-ink)" strokeWidth="2.6" />
    </svg>
  )
}

/** Porta de E/S: pino com seta. */
export function GlyphPort({ size = 36, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="9" cy="18" r="5.5" fill="none" stroke="var(--glyph-ink)" strokeWidth="3" />
      <circle cx="9" cy="18" r="1.8" fill="var(--gold)" />
      <path d="M15 18h16M25.5 12l6 6-6 6" fill="none" stroke="var(--copper)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Fio: trilha de cobre com dobra a 45°. */
export function GlyphWire({ size = 36, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M5 10h9l8 16h9" fill="none" stroke="var(--copper)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5" cy="10" r="3.4" fill="var(--glyph-ink)" />
      <circle cx="31" cy="26" r="3.4" fill="var(--glyph-ink)" />
    </svg>
  )
}

/** Barramento: vários bits atravessados pela marca de largura. */
export function GlyphBus({ size = 36, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <g stroke="var(--glyph-ink)" strokeWidth="2.4" strokeLinecap="round">
        <path d="M4 10h28M4 15.3h28M4 20.6h28M4 26h28" />
      </g>
      <path d="M23 5l-8 26" stroke="var(--copper)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Tipos de célula: AND, OR, NOT e registrador. */
export function GlyphCellTypes({ size = 36, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M4 5h6a6 6 0 010 12H4z" fill="var(--glyph-ink)" />
      <path d="M20 5q7 0 12 6-5 6-12 6 3-6 0-12z" fill="var(--copper)" />
      <path d="M4 20.5l9 5-9 5z" fill="var(--gold)" />
      <rect x="20" y="20" width="12" height="11" rx="3" fill="none" stroke="var(--glyph-ink)" strokeWidth="2.4" />
      <path d="M20 27.5l2.6-2 -2.6-2" fill="none" stroke="var(--glyph-ink)" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

/** Arquivo-fonte: um chip deitado. */
export function GlyphSourceFile({ size = 26, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size * 0.75} viewBox="0 0 24 18" aria-hidden="true">
      <rect x="3" y="3" width="18" height="12" rx="3.2" fill="var(--glyph-ink)" />
      <g fill="var(--gold)">
        {[5.5, 10.5, 15.5].map((x) => (
          <g key={x}>
            <rect x={x} y="0" width="2.4" height="3.4" rx="1.2" />
            <rect x={x} y="14.6" width="2.4" height="3.4" rx="1.2" />
          </g>
        ))}
      </g>
    </svg>
  )
}

/** Testbench: uma bancada de medição com uma onda. */
export function GlyphTestbenchFile({ size = 26, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size * 0.75} viewBox="0 0 24 18" aria-hidden="true">
      <rect x="2" y="2" width="20" height="14" rx="3.6" fill="none" stroke="var(--copper)" strokeWidth="2" />
      <path d="M5 11.5h2.5V6.5h3v5h3V6.5h3v5H19" fill="none" stroke="var(--copper)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Outro arquivo: folha com dobra. */
export function GlyphOtherFile({ size = 26, className }: GlyphProps) {
  return (
    <svg className={className} width={size} height={size * 0.75} viewBox="0 0 24 18" aria-hidden="true">
      <path d="M7 1.5h7l4 4V15a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 15V3A1.5 1.5 0 017 1.5z" fill="none" stroke="var(--outline)" strokeWidth="1.6" />
      <path d="M14 1.5V5.5h4" fill="none" stroke="var(--outline)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
