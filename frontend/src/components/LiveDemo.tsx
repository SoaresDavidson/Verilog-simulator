import { useEffect, useState } from 'react'

/**
 * Demonstração viva da página de entrada: um meio-somador de exemplo em que o
 * mesmo sinal aparece no código, no fio e na onda. É conteúdo fixo, de
 * exemplo; o circuito real do aluno aparece nas etapas 3 e 4.
 */

type Sig = 'a' | 'b' | 'soma' | 'vai'
const SIGS: Sig[] = ['a', 'b', 'soma', 'vai']
const STATES = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
].map(([a, b]) => ({ a, b, soma: a ^ b, vai: a & b }) as Record<Sig, number>)

const SAY = [
  'a e b estão em 0. Nada chega nas portas, então as duas saídas ficam em 0.',
  'Só b vale 1. As entradas são diferentes: a XOR solta 1 em soma. A AND precisa das duas e fica em 0.',
  'Só a vale 1. De novo entradas diferentes: soma vale 1 e vai_um vale 0.',
  'a e b valem 1. A AND solta 1 em vai_um. A XOR vê entradas iguais e soma volta a 0.',
]

const WIRES: Array<[id: string, sig: Sig, d: string]> = [
  ['ld-a1', 'a', 'M96 105H372'],
  ['ld-a2', 'a', 'M210 105V275H360'],
  ['ld-b1', 'b', 'M96 305H360'],
  ['ld-b2', 'b', 'M150 305V135H372'],
  ['ld-s', 'soma', 'M456 120H640'],
  ['ld-v', 'vai', 'M440 290H640'],
]

const SLOTS = 8
const SLOT_W = 880 / SLOTS

function wavePath(sig: Sig, y: number): string {
  let d = ''
  for (let i = 0; i < SLOTS; i++) {
    const yy = y + (STATES[i % 4][sig] ? 0 : 16)
    d += `${i ? 'L' : 'M'}${110 + i * SLOT_W} ${yy}H${110 + (i + 1) * SLOT_W}`
  }
  return d
}

export function LiveDemo() {
  const [t, setT] = useState(3)
  const [playing, setPlaying] = useState(true)
  const [hot, setHot] = useState<Sig | null>(null)
  const now = STATES[t % 4]

  useEffect(() => {
    if (!playing || import.meta.env.MODE === 'test') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setT((v) => v + 1), 2600)
    return () => window.clearInterval(id)
  }, [playing])

  const cls = (sig: Sig, base: string) => `${base} v${now[sig]}${hot === sig ? ' is-hot' : ''}`
  const link = (sig: Sig) => ({ onMouseEnter: () => setHot(sig), onMouseLeave: () => setHot(null) })
  const tok = (sig: Sig, label: string = sig) => (
    <span className={cls(sig, 'ld-tok')} {...link(sig)}>
      {label}
    </span>
  )

  return (
    <figure className="ld" aria-label="Demonstração: um meio-somador simulado passo a passo">
      <div className="ld-code" aria-hidden="true">
        <span className="ld-ln">
          <i>module</i> meio_somador (
        </span>
        <span className="ld-ln">
          {'  '}
          <i>input</i> {tok('a')}, {tok('b')},
        </span>
        <span className="ld-ln">
          {'  '}
          <i>output</i> {tok('soma')}, {tok('vai', 'vai_um')}
        </span>
        <span className="ld-ln">);</span>
        <span className={`ld-ln${now.soma ? ' is-run' : ''}`}>
          {'  '}
          <i>assign</i> {tok('soma')} = {tok('a')} <b>^</b> {tok('b')};
        </span>
        <span className={`ld-ln${now.vai ? ' is-run' : ''}`}>
          {'  '}
          <i>assign</i> {tok('vai', 'vai_um')} = {tok('a')} <b>&amp;</b> {tok('b')};
        </span>
        <span className="ld-ln">
          <i>endmodule</i>
        </span>
      </div>

      <svg className="ld-ckt" viewBox="0 0 760 400" aria-hidden="true">
        {WIRES.map(([id, sig, d]) => (
          <path key={id} id={id} className={cls(sig, 'ld-w')} d={d} {...link(sig)} />
        ))}
        <circle className="ld-dot" cx="210" cy="105" r="9" />
        <circle className="ld-dot" cx="150" cy="305" r="9" />
        {WIRES.map(([id, sig], i) => (
          <circle key={id} r="7" className={cls(sig, 'ld-pulse')}>
            <animateMotion dur="1.3s" begin={`${i * 0.12}s`} repeatCount="indefinite">
              <mpath href={`#${id}`} />
            </animateMotion>
          </circle>
        ))}
        <path key={`x${now.soma}`} className="ld-gate" d="M356 80Q392 120 356 160Q420 160 456 120Q420 80 356 80Z" />
        <path className="ld-back" d="M342 80Q378 120 342 160" />
        <path key={`n${now.vai}`} className="ld-gate" d="M360 250H400A40 40 0 0 1 400 330H360Z" />
        <text className="ld-lbl" x="376" y="127">
          XOR
        </text>
        <text className="ld-lbl" x="370" y="297">
          AND
        </text>
        <text className="ld-io" x="30" y="72">
          a
        </text>
        <text className="ld-io" x="30" y="272">
          b
        </text>
        <text className="ld-io" x="610" y="78">
          soma
        </text>
        <text className="ld-io" x="596" y="248">
          vai_um
        </text>
        <rect className={cls('a', 'ld-bub')} x="30" y="84" width="62" height="42" rx="21" />
        <text className="ld-val" x="61" y="112">
          {now.a}
        </text>
        <rect className={cls('b', 'ld-bub')} x="30" y="284" width="62" height="42" rx="21" />
        <text className="ld-val" x="61" y="312">
          {now.b}
        </text>
        <circle key={`s${now.soma}`} className={cls('soma', 'ld-led')} cx="672" cy="120" r="30" />
        <text className="ld-val" x="672" y="127">
          {now.soma}
        </text>
        <circle key={`v${now.vai}`} className={cls('vai', 'ld-led')} cx="672" cy="290" r="30" />
        <text className="ld-val" x="672" y="297">
          {now.vai}
        </text>
      </svg>

      <figcaption className="ld-say">
        <span className="ld-say__t">t = {(t % SLOTS) * 10} ns</span>
        <span className="ld-say__txt" key={t % 4}>
          {SAY[t % 4]}
        </span>
      </figcaption>

      <div className="ld-time">
        <div className="ld-ctl">
          <button type="button" className="btn bp bsm" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pausar exemplo' : 'Tocar exemplo'}
          </button>
          <button type="button" className="btn bs bsm" onClick={() => setT((v) => v + 1)}>
            Avançar um passo
          </button>
        </div>
        <svg className="ld-wv" viewBox="0 0 1000 132" aria-hidden="true">
          {SIGS.map((sig, r) => (
            <g key={sig} {...link(sig)}>
              <text className="ld-wl" x="0" y={28 + r * 30}>
                {sig === 'vai' ? 'vai_um' : sig}
              </text>
              <path className={`ld-tr${hot === sig ? ' is-hot' : ''}`} d={wavePath(sig, 14 + r * 30)} />
            </g>
          ))}
          <g className="ld-head" style={{ transform: `translateX(${(t % SLOTS) * SLOT_W}px)` }}>
            <rect x="110" y="2" width={SLOT_W} height="128" rx="10" />
            <path d="M110 2v128" />
          </g>
        </svg>
      </div>
    </figure>
  )
}
