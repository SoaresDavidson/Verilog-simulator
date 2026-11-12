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

/** Explicação curta, em linguagem de aula, do que o bloco faz. */
export function describeNode(node: GraphNode): string | null {
  if (node.kind === 'input') return 'Entrada do módulo: o valor vem de fora (do testbench ou de quem instancia o módulo).'
  if (node.kind === 'output') return 'Saída do módulo: é o resultado que o circuito entrega para fora.'
  if (node.kind === 'inout') return 'Porta bidirecional: pode receber e enviar valores pelo mesmo fio.'
  if (node.kind === 'const') return 'Valor fixo, escrito direto no código.'
  if (node.kind === 'instance') return `Instância do módulo ${node.submodule ?? node.type}: uma "caixa" com outro circuito dentro. Abra para ver o interior.`
  const t = node.type.replace(/^\$_?|_$/g, '').toLowerCase()
  const text: Record<string, string> = {
    and: 'Porta AND: a saída é 1 só quando todas as entradas são 1.',
    nand: 'Porta NAND: o inverso da AND; a saída é 0 só quando todas as entradas são 1.',
    or: 'Porta OR: a saída é 1 quando pelo menos uma entrada é 1.',
    nor: 'Porta NOR: o inverso da OR; a saída é 1 só quando todas as entradas são 0.',
    xor: 'Porta XOR: a saída é 1 quando as entradas são diferentes.',
    xnor: 'Porta XNOR: a saída é 1 quando as entradas são iguais.',
    not: 'Inversor (NOT): troca 0 por 1 e 1 por 0.',
    logic_not: 'NOT lógico: a saída é 1 quando a entrada inteira vale zero.',
    logic_and: 'AND lógico (&&): 1 quando as duas entradas são diferentes de zero.',
    logic_or: 'OR lógico (||): 1 quando alguma entrada é diferente de zero.',
    reduce_and: 'Redução AND (&x): 1 se todos os bits da entrada forem 1.',
    reduce_or: 'Redução OR (|x): 1 se algum bit da entrada for 1.',
    reduce_bool: 'Teste de "diferente de zero": 1 se algum bit da entrada for 1.',
    reduce_xor: 'Redução XOR (^x): paridade, 1 se a quantidade de bits 1 for ímpar.',
    mux: 'Multiplexador: escolhe qual entrada passa para a saída. Com S = 0 passa A; com S = 1 passa B.',
    pmux: 'Multiplexador paralelo: vem de um case/if-else; a entrada escolhida é a do bit de S que estiver em 1.',
    dff: 'Flip-flop D: guarda o valor de D a cada borda de subida do clock. É a memória do circuito.',
    adff: 'Flip-flop D com reset assíncrono: guarda D a cada borda do clock e volta ao valor inicial assim que o reset é ativado.',
    sdff: 'Flip-flop D com reset síncrono: o reset só tem efeito na borda do clock.',
    dffe: 'Flip-flop D com enable: só guarda D quando EN = 1.',
    adffe: 'Flip-flop D com reset assíncrono e enable.',
    add: 'Somador: a saída é A + B.',
    sub: 'Subtrator: a saída é A − B.',
    mul: 'Multiplicador: a saída é A × B.',
    shl: 'Deslocamento à esquerda (<<): empurra os bits de A para a esquerda B posições.',
    shr: 'Deslocamento à direita (>>): empurra os bits de A para a direita B posições.',
    sshr: 'Deslocamento aritmético à direita (>>>): mantém o sinal.',
    eq: 'Comparador de igualdade (==): 1 quando A e B são iguais.',
    ne: 'Comparador de diferença (!=): 1 quando A e B são diferentes.',
    lt: 'Comparador (<): 1 quando A é menor que B.',
    le: 'Comparador (<=): 1 quando A é menor ou igual a B.',
    gt: 'Comparador (>): 1 quando A é maior que B.',
    ge: 'Comparador (>=): 1 quando A é maior ou igual a B.',
  }
  return text[t] ?? null
}
