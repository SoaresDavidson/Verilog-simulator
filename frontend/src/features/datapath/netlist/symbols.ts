/**
 * Classifica células do Yosys nos símbolos de livro-texto (IEEE/ANSI
 * "distinctive shape") e define o tamanho de cada nó para o layout.
 */
import type { GraphNode } from './parse'

export type GateShape = 'and' | 'or' | 'xor' | 'not' | 'buf' | 'mux' | 'dff' | 'arith' | 'compare' | 'box'

const TABLE: Array<[RegExp, GateShape]> = [
  [/^\$_?(n?and|reduce_and|logic_and)_?$/i, 'and'],
  [/^\$_?(n?or|reduce_or|reduce_bool|logic_or)_?$/i, 'or'],
  [/^\$_?(x?n?or|reduce_xn?or|xn?or)_?$/i, 'xor'],
  [/^\$_?(not|logic_not)_?$/i, 'not'],
  [/^\$_?(buf|pos|neg)_?$/i, 'buf'],
  [/^\$_?(p?mux|bmux|demux|MUX)_?/i, 'mux'],
  [/^\$_?(s?dffe?|adffe?|aldffe?|dffsre?|sdffc?e|dlatch|adlatch|ff|DFF\w*)/i, 'dff'],
  [/^\$(add|sub|mul|div|mod|divfloor|modfloor|pow|shl|shr|sshl|sshr|shift|shiftx|alu|macc|lcu|neg)$/i, 'arith'],
  [/^\$(eq|ne|eqx|nex|lt|le|gt|ge)$/i, 'compare'],
]

/** Símbolo da célula; `box` quando não há símbolo de livro (submódulos, células raras). */
export function gateShape(node: GraphNode): GateShape {
  if (node.kind !== 'cell') return 'box'
  const t = node.type
  // xor antes de or: `$xor` casaria com o padrão de or.
  if (/^\$_?(x?n?or|reduce_xn?or)_?$/i.test(t) && /x/i.test(t)) return 'xor'
  for (const [re, shape] of TABLE) if (re.test(t)) return shape
  return 'box'
}

/** Inversão na saída (`$nand`, `$nor`, `$xnor`, `$not`). */
export function isInverted(node: GraphNode): boolean {
  return /^\$_?(nand|nor|xnor|not|logic_not|reduce_xnor)_?$/i.test(node.type)
}

/** Símbolo curto escrito dentro de blocos aritméticos e comparadores. */
export function opGlyph(node: GraphNode): string {
  const t = node.type.replace(/^\$_?|_$/g, '').toLowerCase()
  const map: Record<string, string> = {
    add: '+', sub: '−', mul: '×', div: '÷', mod: '%', divfloor: '÷', modfloor: '%', pow: '^', neg: '−',
    shl: '≪', sshl: '≪', shr: '≫', sshr: '≫', shift: '≫', shiftx: '≫', alu: 'ALU', macc: 'MAC', lcu: 'LCU',
    eq: '=', eqx: '=', ne: '≠', nex: '≠', lt: '<', le: '≤', gt: '>', ge: '≥',
  }
  return map[t] ?? ''
}

/** Faixa reservada abaixo do símbolo para o rótulo do tipo. */
export const LABEL_H = 16
const PITCH = 18

/** Tamanho do nó (incluindo a faixa do rótulo nos símbolos). */
export function symbolSize(node: GraphNode): { w: number; h: number } {
  const pins = Math.max(node.inputs.length, node.outputs.length, 1)
  switch (node.kind) {
    case 'input':
    case 'output':
    case 'inout':
      return { w: Math.min(150, Math.max(72, 26 + node.name.length * 7.4 + (node.width > 1 ? 30 : 0))), h: 28 }
    case 'const':
      return { w: Math.min(120, Math.max(40, 18 + (node.constValue?.length ?? node.name.length) * 6.6)), h: 22 }
    case 'instance':
      return { w: 168, h: Math.max(52, 32 + pins * PITCH) }
    default: {
      const shape = gateShape(node)
      const body = Math.max(36, pins * PITCH + 8)
      switch (shape) {
        case 'and':
        case 'or':
        case 'xor':
          return { w: 76, h: body + LABEL_H }
        case 'not':
        case 'buf':
          return { w: 64, h: 32 + LABEL_H }
        case 'mux':
          return { w: 48, h: Math.max(64, pins * PITCH + 18) + LABEL_H }
        case 'dff':
          return { w: 76, h: Math.max(64, pins * PITCH + 16) + LABEL_H }
        case 'arith':
        case 'compare':
          return { w: 64, h: Math.max(52, pins * PITCH + 12) + LABEL_H }
        default:
          return { w: 150, h: Math.max(44, 30 + pins * 16) }
      }
    }
  }
}

/**
 * Posição vertical dos pinos dentro do nó (relativa ao topo). Símbolos espalham
 * os pinos na área do corpo; caixas seguem a régua do cabeçalho.
 */
export function pinYs(node: GraphNode, h: number, count: number): number[] {
  if (count === 0) return []
  if (node.kind === 'input' || node.kind === 'output' || node.kind === 'inout' || node.kind === 'const') {
    return Array.from({ length: count }, () => h / 2)
  }
  const shape = gateShape(node)
  if (shape === 'box') {
    const header = node.kind === 'instance' ? 32 : 30
    return Array.from({ length: count }, (_, i) => header + i * 16 + 4)
  }
  const body = h - LABEL_H
  if (shape === 'dff' || shape === 'mux') {
    const top = 14
    const span = body - 28
    return Array.from({ length: count }, (_, i) => (count === 1 ? body / 2 : top + (span * i) / (count - 1)))
  }
  return Array.from({ length: count }, (_, i) => (body * (i + 1)) / (count + 1))
}
