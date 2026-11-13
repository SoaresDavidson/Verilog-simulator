/**
 * Ilustrações da identidade "Do código ao sinal", desenhadas em SVG e animadas
 * com Motion: o mascote Bit (um chip) e as cenas do caminho código → sinais.
 * São decorativas (aria-hidden). O movimento reduzido é tratado pelo
 * `MotionConfig reducedMotion="user"` da raiz.
 */
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

// Cores da paleta ativa (tokens.css); atributos de apresentação do SVG aceitam var().
const INK = 'var(--on-gate)'
const GATE = 'var(--gate)'
const GATE_FILL = 'var(--gate-fill)'
const PINK = 'var(--p-action)'
const ONE = 'var(--w1)'
const ZERO = 'var(--w0)'
const PIN = '#e9e6f5'

const ink = { stroke: INK, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const line = { ...ink, fill: 'none' } as const
const loop = (duration: number, delay = 0) => ({ duration, delay, repeat: Infinity, ease: 'easeInOut' }) as const
const pop = { type: 'spring', stiffness: 260, damping: 18 } as const

/* ------------------------------------------------------------------ */
/* Peças                                                                */
/* ------------------------------------------------------------------ */

function Sheet({ x, y, rot = 0, w = 56 }: { x: number; y: number; rot?: number; w?: number }) {
  const rows = [PINK, ONE, ZERO, '#7a4fd0']
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect width={w} height={w * 1.25} rx="7" fill="#fff" strokeWidth="4.5" {...ink} />
      {rows.map((c, i) => (
        <path key={c} d={`M10 ${16 + i * 12}h${[w - 22, w - 30, w - 20, w - 36][i]}`} stroke={c} strokeWidth="5" strokeLinecap="round" />
      ))}
    </g>
  )
}

function Folder({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 14a8 8 0 0 1 8-8h26l10 10h58a8 8 0 0 1 8 8v54a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8z" fill={GATE} strokeWidth="5" {...ink} />
      <path d="M55 20v30" stroke={INK} strokeWidth="5" strokeDasharray="3 5.5" strokeLinecap="round" />
      <rect x="48.5" y="46" width="13" height="21" rx="6" fill={PINK} strokeWidth="3.5" {...ink} />
    </g>
  )
}

function UpArrow({ x, y }: { x: number; y: number }) {
  return (
    <motion.g animate={{ y: [0, -7, 0] }} transition={loop(1.6)}>
      <path transform={`translate(${x} ${y})`} d="M0 22L19 0l19 22H26v22H12V22z" fill={PINK} strokeWidth="4.5" {...ink} />
    </motion.g>
  )
}

const AND = 'M0 0h16a16 16 0 0 1 0 32H0z'
const OR = 'M0 0q9 16 0 32q22 0 34-16Q22 0 0 0z'
const NOT = 'M0 0l28 16L0 32z'

function Gate({ d, x, y, s = 1, delay = 0, children }: { d: string; x: number; y: number; s?: number; delay?: number; children?: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <motion.g initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ ...pop, delay }}>
        <path d={d} fill={GATE_FILL} strokeWidth={4.5 / s} {...ink} />
        {children}
      </motion.g>
    </g>
  )
}

function Bulb({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <motion.g animate={{ opacity: [0.25, 1, 0.25], scale: [0.85, 1.1, 0.85] }} transition={loop(1.4)}>
        <path d="M-22-20l-7-7M0-28v-10M22-20l7-7" stroke={PINK} strokeWidth="5" strokeLinecap="round" />
      </motion.g>
      <rect x="-7" y="13" width="14" height="11" rx="3" fill={PIN} strokeWidth="4" {...ink} />
      <circle r="16" fill={GATE} strokeWidth="4.5" {...ink} />
      <motion.circle r="9" fill="#fff" animate={{ opacity: [0, 0.75, 0] }} transition={loop(1.4)} />
    </g>
  )
}

function Scene({ viewBox, className, children }: { viewBox: string; className?: string; children: ReactNode }) {
  return (
    <svg className={`ill${className ? ` ${className}` : ''}`} viewBox={viewBox} aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Cenas do caminho                                                     */
/* ------------------------------------------------------------------ */

/** Envie o projeto: a pasta zipada com as folhas de código. */
export function StepCode() {
  return (
    <Scene viewBox="0 0 200 140">
      <motion.g initial={{ y: 22 }} whileInView={{ y: 0 }} viewport={{ once: true }} transition={pop}>
        <Sheet x={48} y={8} rot={-9} w={50} />
        <Sheet x={98} y={4} rot={8} w={50} />
      </motion.g>
      <Folder x={30} y={46} />
      <UpArrow x={130} y={84} />
    </Scene>
  )
}

/** Sintetize: as linhas do código viram portas. */
export function StepGates() {
  return (
    <Scene viewBox="0 0 200 140">
      <motion.path
        d="M78 70h22M100 30v80M100 30h30M100 70h30M100 110h30"
        strokeWidth="4.5"
        {...line}
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      <Sheet x={16} y={32} rot={-4} w={60} />
      <Gate d={AND} x={130} y={14} delay={0.35} />
      <Gate d={OR} x={128} y={54} delay={0.5} />
      <Gate d={NOT} x={130} y={94} delay={0.65}>
        <circle cx="34" cy="16" r="5" fill={GATE_FILL} strokeWidth="4" {...ink} />
      </Gate>
    </Scene>
  )
}

/** Veja o circuito: portas ligadas por fios e uma lupa que passeia. */
export function StepCircuit() {
  return (
    <Scene viewBox="0 0 200 140">
      <path d="M14 30h30M14 30v84M14 104h30M76 34h22v20h20M78 104h20V82h20M150 68h30" strokeWidth="4.5" {...line} />
      {[
        [14, 30],
        [14, 104],
        [180, 68],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5.5" fill="#fff" strokeWidth="4" {...ink} />
      ))}
      <Gate d={AND} x={44} y={18} />
      <Gate d={OR} x={44} y={88} delay={0.12} />
      <Gate d={AND} x={118} y={52} delay={0.24} />
      <motion.g animate={{ x: [0, -74, -74, 0], y: [0, -34, 36, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', times: [0, 0.33, 0.66, 1] }}>
        <path d="M152 88l22 24" stroke={INK} strokeWidth="13" strokeLinecap="round" />
        <path d="M152 88l22 24" stroke={PINK} strokeWidth="7" strokeLinecap="round" />
        <circle cx="134" cy="68" r="27" fill="rgba(255,255,255,0.55)" stroke={INK} strokeWidth="13" />
        <circle cx="134" cy="68" r="27" fill="none" stroke={PINK} strokeWidth="7" />
      </motion.g>
    </Scene>
  )
}

/** Simule: os fios ganham valor e a onda se desenha. */
export function StepSignals() {
  return (
    <Scene viewBox="0 0 200 140">
      <motion.path
        d="M16 38h18V16h22v22h22V16h22v22h22V16h22v22h18"
        stroke={ONE}
        strokeWidth="7"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
        animate={{ pathLength: [0, 1, 1] }}
        transition={{ duration: 3.2, times: [0, 0.7, 1], repeat: Infinity, ease: 'easeInOut' }}
      />
      <path d="M22 78h46" stroke={ONE} strokeWidth="7" strokeLinecap="round" />
      <path d="M22 104h46" stroke={ZERO} strokeWidth="7" strokeLinecap="round" />
      <path d="M116 91h46" stroke={ONE} strokeWidth="7" strokeLinecap="round" />
      {[22, 116].map((x, i) => (
        <motion.circle key={x} r="4.5" cy={i ? 91 : 78} fill="#fff" stroke={ONE} strokeWidth="3" animate={{ cx: [x, x + 44] }} transition={{ duration: 1.1, delay: i * 0.55, repeat: Infinity, ease: 'linear' }} />
      ))}
      <circle cx="20" cy="78" r="6" fill="#fff" strokeWidth="4" {...ink} />
      <circle cx="20" cy="104" r="6" fill="#fff" strokeWidth="4" {...ink} />
      <Gate d={AND} x={68} y={62} s={1.8} />
      <Bulb x={172} y={88} />
    </Scene>
  )
}

/** Área de envio: a pasta zipada com a seta. */
export function UploadArt() {
  return (
    <Scene viewBox="0 0 124 104">
      <Folder x={4} y={6} />
      <UpArrow x={80} y={52} />
    </Scene>
  )
}

/** Fechamento: do código, pela porta, até a lâmpada acesa. */
export function ClosingArt() {
  const top = 'M96 78H200M286 96h40V62h34v34h34V62h34v34h46'
  return (
    <Scene viewBox="0 0 520 190">
      <path d="M96 126h104M286 126h170" stroke={ZERO} strokeWidth="9" strokeLinecap="round" />
      <path id="ill-closing-wire" d={top} stroke={ONE} strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {[0, 1, 2].map((i) => (
        <circle key={i} r="6.5" fill="#fff" stroke={ONE} strokeWidth="4">
          <animateMotion dur="3.6s" begin={`${i * 1.2}s`} repeatCount="indefinite">
            <mpath href="#ill-closing-wire" />
          </animateMotion>
        </circle>
      ))}
      <Sheet x={22} y={46} rot={-8} w={76} />
      <Gate d={AND} x={196} y={54} s={3} />
      <Bulb x={474} y={96} />
    </Scene>
  )
}

/* ------------------------------------------------------------------ */
/* Bit, o mascote                                                       */
/* ------------------------------------------------------------------ */

export type BitPose = 'acenando' | 'apontando' | 'lupa' | 'pensando' | 'comemorando' | 'confuso'

const arm = { ...line, strokeWidth: 5.5 } as const
const Hand = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r="5.5" fill={INK} />

const LEFT_DOWN = (
  <g>
    <path d="M40 74Q24 82 30 98" {...arm} />
    <Hand x={30} y={98} />
  </g>
)
const RIGHT_DOWN = (
  <g>
    <path d="M100 74q16 8 10 24" {...arm} />
    <Hand x={110} y={98} />
  </g>
)

function ArmUp({ side, wave }: { side: 'left' | 'right'; wave?: boolean }) {
  const left = side === 'left'
  return (
    <motion.g
      style={{ originX: left ? 1 : 0, originY: 1 }}
      animate={{ rotate: wave ? [-10, 14, -10] : left ? [-6, 6, -6] : [6, -6, 6] }}
      transition={loop(wave ? 0.9 : 0.7)}
    >
      <path d={left ? 'M40 68Q22 58 20 36' : 'M100 68q18-10 20-32'} {...arm} />
      <Hand x={left ? 20 : 120} y={36} />
    </motion.g>
  )
}

function Eyes({ left = 'open', right = 'open' }: { left?: 'open' | 'happy' | 'wink' | 'x'; right?: 'open' | 'happy' | 'wink' | 'x' }) {
  const eye = (kind: string, cx: number) => {
    if (kind === 'happy') return <path d={`M${cx - 7} 65q7-10 14 0`} {...line} strokeWidth="4.5" />
    if (kind === 'wink') return <path d={`M${cx - 7} 61q7 7 14 0`} {...line} strokeWidth="4.5" />
    if (kind === 'x') return <path d={`M${cx - 6} 56l12 12M${cx + 6} 56l-12 12`} {...line} strokeWidth="4.5" />
    return (
      <g>
        <circle cx={cx} cy="62" r="7.5" fill={INK} />
        <circle cx={cx - 2.5} cy="59.5" r="2.4" fill="#fff" />
      </g>
    )
  }
  return (
    <motion.g animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 4.2, times: [0, 0.93, 0.965, 1], repeat: Infinity }}>
      {eye(left, 57)}
      {eye(right, 83)}
    </motion.g>
  )
}

const MOUTH_OPEN = <path d="M61 78q9 13 18 0z" fill={PINK} strokeWidth="3.5" {...ink} />
const MOUTH_SMILE = <path d="M62 79q8 8 16 0" {...line} strokeWidth="4.5" />
const MOUTH_O = <circle cx="70" cy="83" r="4.5" fill={INK} />

export function Bit({ pose = 'acenando', className }: { pose?: BitPose; className?: string }) {
  let face: ReactNode
  let arms: ReactNode
  let extra: ReactNode = null

  switch (pose) {
    case 'apontando':
      face = (
        <>
          <Eyes />
          {MOUTH_OPEN}
        </>
      )
      arms = (
        <>
          {LEFT_DOWN}
          <motion.g animate={{ x: [0, 5, 0] }} transition={loop(1.2)}>
            <path d="M100 72l26-6" {...arm} />
            <path d="M124 66h13" {...line} strokeWidth="7" />
            <Hand x={125} y={66} />
          </motion.g>
        </>
      )
      break
    case 'lupa':
      face = (
        <>
          <Eyes left="wink" />
          {MOUTH_SMILE}
        </>
      )
      arms = LEFT_DOWN
      extra = (
        <motion.g style={{ originX: 1, originY: 1 }} animate={{ rotate: [-5, 5, -5] }} transition={loop(2.4)}>
          <path d="M100 82q14-2 10-12" {...arm} />
          <path d="M96 72l13 13" stroke={INK} strokeWidth="11" strokeLinecap="round" />
          <path d="M96 72l13 13" stroke={PINK} strokeWidth="6" strokeLinecap="round" />
          <circle cx="85" cy="60" r="16" fill="rgba(255,255,255,0.7)" stroke={INK} strokeWidth="11" />
          <circle cx="85" cy="60" r="16" fill="none" stroke={PINK} strokeWidth="6" />
          <circle cx="84" cy="61" r="8" fill={INK} />
          <circle cx="81" cy="58" r="2.8" fill="#fff" />
        </motion.g>
      )
      break
    case 'pensando':
      face = (
        <>
          <Eyes />
          <path d="M64 81q6-4 12 0" {...line} strokeWidth="4.5" />
        </>
      )
      arms = (
        <>
          {LEFT_DOWN}
          <path d="M100 76q14 22-16 12" {...arm} />
          <Hand x={84} y={88} />
        </>
      )
      extra = (
        <motion.g animate={{ y: [0, -5, 0], rotate: [-6, 6, -6] }} transition={loop(2)}>
          <path d="M108 20q0-11 10-11t10 10q0 7-10 10v5" {...line} strokeWidth="5.5" />
          <circle cx="118" cy="44" r="3.6" fill={INK} />
        </motion.g>
      )
      break
    case 'comemorando':
      face = (
        <>
          <Eyes left="happy" right="happy" />
          {MOUTH_OPEN}
        </>
      )
      arms = (
        <>
          <ArmUp side="left" />
          <ArmUp side="right" />
        </>
      )
      extra = (
        <motion.g animate={{ scale: [0.7, 1.15, 0.7], opacity: [0.4, 1, 0.4] }} transition={loop(0.9)}>
          <path d="M48 16l-5-10M70 12V1M92 16l5-10" stroke={PINK} strokeWidth="5.5" strokeLinecap="round" />
        </motion.g>
      )
      break
    case 'confuso':
      face = (
        <>
          <Eyes left="x" />
          {MOUTH_O}
        </>
      )
      arms = (
        <>
          {LEFT_DOWN}
          <ArmUp side="right" />
        </>
      )
      extra = (
        <>
          <path d="M88 26q4-14 16-10" {...line} strokeWidth="4.5" />
          <motion.path d="M112 2l-9 13h7l-4 11 13-15h-7z" fill="#f58220" animate={{ opacity: [1, 0.2, 1, 1], scale: [1, 0.9, 1.15, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
        </>
      )
      break
    default:
      face = (
        <>
          <Eyes />
          {MOUTH_OPEN}
        </>
      )
      arms = (
        <>
          <ArmUp side="left" wave />
          {RIGHT_DOWN}
        </>
      )
      extra = (
        <motion.g animate={{ opacity: [0, 1, 0] }} transition={loop(0.9)}>
          <path d="M8 30l-6-4M10 20l-4-8M20 16l-1-9" stroke={PINK} strokeWidth="4.5" strokeLinecap="round" />
        </motion.g>
      )
  }

  return (
    <svg className={`ill bit${className ? ` ${className}` : ''}`} viewBox="0 0 140 146" aria-hidden="true" focusable="false">
      <motion.g
        key={pose}
        initial={{ scale: 0.5, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={pop}
        style={{ originX: 0.5, originY: 1 }}
      >
        <motion.g animate={{ y: [0, -3.5, 0] }} transition={loop(2.6)}>
          <path d="M58 104l-4 28M82 104l5 28" {...arm} />
          <ellipse cx="50" cy="135" rx="9.5" ry="5.5" fill={INK} />
          <ellipse cx="91" cy="135" rx="9.5" ry="5.5" fill={INK} />
          <g transform="rotate(-5 70 68)">
            {[40, 56, 72, 88].map((y) => (
              <g key={y}>
                <rect x="29" y={y} width="13" height="9" rx="2.5" fill={PIN} strokeWidth="3.5" {...ink} />
                <rect x="98" y={y} width="13" height="9" rx="2.5" fill={PIN} strokeWidth="3.5" {...ink} />
              </g>
            ))}
            <rect x="40" y="28" width="60" height="78" rx="11" fill={GATE} strokeWidth="5" {...ink} />
            <path d="M61 28a9 9 0 0 0 18 0z" fill={INK} />
            {face}
          </g>
          {arms}
          {extra}
        </motion.g>
      </motion.g>
    </svg>
  )
}
