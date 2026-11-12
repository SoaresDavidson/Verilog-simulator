/**
 * Símbolos de livro-texto (IEEE/ANSI "distinctive shape") desenhados no
 * retângulo do nó. Os pinos vêm do layout; aqui só se desenha o corpo e os
 * terminais curtos que ligam o pino ao corpo.
 */
import type { NodeBox } from '../netlist/layout'
import type { GraphNode } from '../netlist/parse'
import { LABEL_H, gateShape, isInverted, opGlyph } from '../netlist/symbols'

const STUB = 10
const BUBBLE = 4

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function GateSymbol({ node, box }: { node: GraphNode; box: NodeBox }) {
  const shape = gateShape(node)
  const w = box.w
  const hb = box.h - LABEL_H
  const inv = isInverted(node)
  const x0 = STUB
  const x1 = w - STUB - (inv ? BUBBLE * 2 : 0)
  const ins = node.inputs.map((p) => ({ name: p.name, y: (box.pins[`in:${p.name}`]?.y ?? box.y) - box.y }))
  const outs = node.outputs.map((p) => ({ name: p.name, y: (box.pins[`out:${p.name}`]?.y ?? box.y) - box.y }))

  let body: string
  let inEdge = x0
  switch (shape) {
    case 'and': {
      const r = hb / 2
      const mid = Math.max(x0 + 4, x1 - r)
      body = `M${x0} 0H${mid}A${r} ${r} 0 0 1 ${mid} ${hb}H${x0}Z`
      break
    }
    case 'or':
    case 'xor': {
      const s = shape === 'xor' ? 5 : 0
      const a = x0 + s
      const span = x1 - a
      body = `M${a} 0Q${a + 12} ${hb / 2} ${a} ${hb}Q${a + span * 0.62} ${hb} ${x1} ${hb / 2}Q${a + span * 0.62} 0 ${a} 0Z`
      inEdge = a + 8
      break
    }
    case 'not':
    case 'buf':
      body = `M${x0} 2L${x1} ${hb / 2}L${x0} ${hb - 2}Z`
      break
    case 'mux':
      body = `M${x0} 0L${x1} ${Math.min(12, hb / 5)}V${hb - Math.min(12, hb / 5)}L${x0} ${hb}Z`
      break
    case 'arith':
    case 'compare': {
      body = `M${x0 + 8} 0H${x1 - 8}Q${x1} 0 ${x1} 8V${hb - 8}Q${x1} ${hb} ${x1 - 8} ${hb}H${x0 + 8}Q${x0} ${hb} ${x0} ${hb - 8}V8Q${x0} 0 ${x0 + 8} 0Z`
      break
    }
    default:
      body = `M${x0 + 6} 0H${x1 - 6}Q${x1} 0 ${x1} 6V${hb - 6}Q${x1} ${hb} ${x1 - 6} ${hb}H${x0 + 6}Q${x0} ${hb} ${x0} ${hb - 6}V6Q${x0} 0 ${x0 + 6} 0Z`
  }

  const showPinNames = shape === 'dff' || shape === 'mux' || shape === 'arith' || shape === 'compare'
  const clockPin = shape === 'dff' ? ins.find((p) => /^(clk|c|clock|ck)$/i.test(p.name)) : undefined

  return (
    <g className={`gs gs--${shape}`}>
      {ins.map((p) => (
        <path key={`si${p.name}`} className="gs-stub" d={`M0 ${p.y}H${shape === 'or' || shape === 'xor' ? inEdge : x0}`} />
      ))}
      {outs.map((p) => (
        <path key={`so${p.name}`} className="gs-stub" d={`M${inv ? x1 + BUBBLE * 2 : x1} ${p.y}H${w}`} />
      ))}
      {shape === 'xor' && <path className="gs-line" d={`M${x0} 0Q${x0 + 12} ${hb / 2} ${x0} ${hb}`} />}
      <path className="dp-box gs-body" d={body} />
      {inv && <circle className="dp-box gs-bubble" cx={x1 + BUBBLE} cy={hb / 2} r={BUBBLE} />}
      {clockPin && <path className="gs-line" d={`M${x0} ${clockPin.y - 6}L${x0 + 8} ${clockPin.y}L${x0} ${clockPin.y + 6}`} />}
      {(shape === 'arith' || shape === 'compare') && (
        <text className="gs-op" x={(x0 + x1) / 2} y={hb / 2 + 6}>
          {opGlyph(node)}
        </text>
      )}
      {showPinNames &&
        ins
          .filter((p) => p !== clockPin)
          .map((p) => (
            <text key={`ti${p.name}`} className="dp-pin" x={x0 + 4} y={p.y + 3}>
              {truncate(p.name, 4)}
            </text>
          ))}
      {showPinNames &&
        outs.map((p) => (
          <text key={`to${p.name}`} className="dp-pin dp-pin--out" x={x1 - 4} y={p.y + 3}>
            {truncate(p.name, 4)}
          </text>
        ))}
      <text className="dp-type gs-label" x={w / 2} y={hb + 12}>
        {truncate(node.type.replace(/^\$_?/, '').replace(/_$/, ''), 12)}
      </text>
    </g>
  )
}
