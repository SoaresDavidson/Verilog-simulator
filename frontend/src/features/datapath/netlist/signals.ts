/**
 * Correlação entre referências de sinal (tela 2 / `simulation_log`) e fios do
 * grafo, e aplicação de valores lógicos. Usado pelo diagrama estático (#30) e
 * pelo diagrama ao vivo (#32).
 *
 * Uma referência é `a.b.c.fio` (opcionalmente com `[msb:lsb]`). Casamento, em
 * ordem: igual a `GraphNet.ref` (`<módulo>.<fio>`); senão, último segmento
 * igual ao nome do fio (o VCD usa o caminho de instância do testbench, ex.:
 * `tb.dut.clk`, que não contém o nome do módulo).
 */
import type { SimTimeline } from '../../../api/types'
import type { GraphEdge, GraphNet, NetlistGraph } from './parse'

export type LogicState = '0' | '1' | 'x' | 'z'

/** `signalRef -> valor` (string binária MSB-first com `x`/`z`). */
export type SignalValues = Readonly<Record<string, string>>

function stripRange(ref: string): string {
  return ref.trim().replace(/\s*\[[^\]]*\]$/, '')
}

function lastSegment(ref: string): string {
  const clean = stripRange(ref)
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot + 1) : clean
}

/** Fio do grafo correspondente a uma referência, ou `null`. */
export function findNetByRef(graph: NetlistGraph, ref: string): GraphNet | null {
  const clean = stripRange(ref)
  const exact = graph.nets.find((n) => n.ref === clean)
  if (exact) return exact
  const tail = lastSegment(clean)
  const byName = graph.nets.filter((n) => n.name === tail)
  return byName.find((n) => !n.hidden) ?? byName[0] ?? null
}

/** Conjunto de ids de fios (`GraphNet.id`) que casam com as referências. */
export function resolveSignalRefs(graph: NetlistGraph, refs: readonly string[] | undefined): Set<string> {
  const out = new Set<string>()
  for (const ref of refs ?? []) {
    const net = findNetByRef(graph, ref)
    if (net) out.add(net.id)
  }
  return out
}

/**
 * Valores por fio (`GraphNet.id -> valor`). Em empates, a referência exata
 * (`<módulo>.<fio>`) vence a casada só pelo nome.
 */
export function resolveValues(graph: NetlistGraph, values: SignalValues | undefined): Map<string, string> {
  const out = new Map<string, string>()
  if (!values) return out
  const exact = new Set<string>()
  for (const [ref, value] of Object.entries(values)) {
    const net = findNetByRef(graph, ref)
    if (!net || typeof value !== 'string') continue
    const isExact = net.ref === stripRange(ref)
    if (exact.has(net.id) && !isExact) continue
    out.set(net.id, value)
    if (isExact) exact.add(net.id)
  }
  return out
}

/** Valor de cada índice de net, a partir dos valores por fio. */
export function bitValues(graph: NetlistGraph, netValues: ReadonlyMap<string, string>): Map<number, LogicState> {
  const out = new Map<number, LogicState>()
  for (const [netId, raw] of netValues) {
    const net = graph.netById.get(netId)
    if (!net) continue
    const value = normalizeValue(raw, net.width)
    net.bits.forEach((bit, i) => {
      if (typeof bit === 'number') out.set(bit, value[net.width - 1 - i] as LogicState)
    })
  }
  return out
}

/**
 * Normaliza para `width` caracteres `0/1/x/z` (MSB primeiro). Estende à
 * esquerda como o VCD: com `x`/`z` se o bit mais alto for `x`/`z`, senão `0`.
 */
export function normalizeValue(raw: string, width: number): string {
  const clean = raw.trim().toLowerCase().replace(/^b/, '').replace(/[^01xz]/g, 'x')
  if (width <= 0) return clean
  if (clean.length >= width) return clean.slice(clean.length - width)
  const pad = clean[0] === 'x' || clean[0] === 'z' ? clean[0] : '0'
  return pad.repeat(width - clean.length) + clean
}

/** Valor de uma aresta (MSB primeiro), ou `undefined` se faltar algum bit. */
export function edgeValue(edge: GraphEdge, bits: ReadonlyMap<number, LogicState>): string | undefined {
  let out = ''
  for (let i = edge.bits.length - 1; i >= 0; i--) {
    const b = edge.bits[i]
    const v = typeof b === 'number' ? bits.get(b) : b
    if (v === undefined) return undefined
    out += v
  }
  return out
}

/** Estado dominante para colorir: qualquer `x` (ou `z` parcial) -> `x`; tudo `z` -> `z`. */
export function logicStateOf(value: string): LogicState {
  const v = value.toLowerCase()
  if (v.length === 0) return 'x'
  if (/^z+$/.test(v)) return 'z'
  if (/[xz]/.test(v)) return 'x'
  return /1/.test(v) ? '1' : '0'
}

/** Formata para exibição: 1 bit cru; barramento em hex se não tiver `x`/`z`. */
export function formatValue(value: string, width = value.length): string {
  const v = normalizeValue(value, width)
  if (v.length <= 1) return v.toUpperCase()
  if (/[xz]/.test(v)) return `${v.length}'b${v}`
  return `0x${BigInt(`0b${v}`).toString(16).toUpperCase()}`
}

/**
 * Valores vigentes no instante `t`: a timeline do VCD só registra mudanças,
 * então cada sinal assume o último valor em `timestamp <= t`.
 */
export function valuesAt(timeline: SimTimeline | null | undefined, t: number | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!timeline || t === null || t === undefined) return out
  const stamps = Object.keys(timeline)
    .map(Number)
    .filter((s) => Number.isFinite(s) && s <= t)
    .sort((a, b) => a - b)
  for (const s of stamps) Object.assign(out, timeline[String(s)])
  return out
}
