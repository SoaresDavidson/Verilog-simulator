/**
 * Leitura defensiva da netlist do Yosys (#20). A forma segue o JSON do Yosys,
 * mas nada aqui assume nomes, larguras ou hierarquia do exemplo CPU 8-bit:
 * campos ausentes contam como vazios e valores inesperados são ignorados.
 */
import type { Netlist } from '../../api/types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Registro (`ports`, `cells`, `netnames`...) ou `{}` quando ausente/inválido. */
export function recordOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

/** Largura de um sinal: `width` do backend, senão `len(bits)`, senão 1. */
export function signalWidth(entry: unknown): number {
  if (!isRecord(entry)) return 1
  if (typeof entry.width === 'number' && Number.isInteger(entry.width) && entry.width > 0) return entry.width
  if (Array.isArray(entry.bits) && entry.bits.length > 0) return entry.bits.length
  return 1
}

export type NetlistCheck = { ok: true; netlist: Netlist } | { ok: false; message: string }

export const NETLIST_MESSAGES = {
  missing: 'A síntese terminou sem gerar a netlist (estrutura.json). Verifique o log e tente novamente.',
  invalid: 'A netlist recebida não segue o formato esperado. Tente sintetizar novamente.',
  empty: 'A netlist recebida não contém módulos. Verifique se o projeto tem um módulo sintetizável.',
} as const

/** Valida a netlist recebida contra o contrato tipado (forma mínima utilizável). */
export function checkNetlist(value: unknown): NetlistCheck {
  if (value === null || value === undefined) return { ok: false, message: NETLIST_MESSAGES.missing }
  if (!isRecord(value) || !isRecord(value.modules)) return { ok: false, message: NETLIST_MESSAGES.invalid }
  const modules = Object.entries(value.modules)
  if (modules.length === 0) return { ok: false, message: NETLIST_MESSAGES.empty }
  if (!modules.every(([, mod]) => isRecord(mod))) return { ok: false, message: NETLIST_MESSAGES.invalid }
  return { ok: true, netlist: value as unknown as Netlist }
}

export interface NetlistStat {
  key: string
  label: string
  value: number
}

/**
 * Estatísticas derivadas só dos campos presentes (#28): módulos, células,
 * portas, fios e, quando houver, bits de fio e tipos de célula.
 */
export function netlistStats(netlist: Netlist): NetlistStat[] {
  const modules = Object.values(recordOf(netlist.modules))
  let cells = 0
  let ports = 0
  let wires = 0
  let wireBits = 0
  const cellTypes = new Set<string>()

  for (const mod of modules) {
    const m = recordOf(mod)
    const modCells = Object.values(recordOf(m.cells))
    cells += modCells.length
    for (const cell of modCells) {
      if (isRecord(cell) && typeof cell.type === 'string') cellTypes.add(cell.type)
    }
    ports += Object.keys(recordOf(m.ports)).length
    const nets = Object.values(recordOf(m.netnames))
    wires += nets.length
    for (const net of nets) wireBits += signalWidth(net)
  }

  const stats: NetlistStat[] = [
    { key: 'modules', label: 'Módulos', value: modules.length },
    { key: 'cells', label: 'Células', value: cells },
    { key: 'ports', label: 'Portas', value: ports },
    { key: 'wires', label: 'Fios', value: wires },
  ]
  if (wireBits > 0) stats.push({ key: 'wireBits', label: 'Bits de fio', value: wireBits })
  if (cellTypes.size > 0) stats.push({ key: 'cellTypes', label: 'Tipos de célula', value: cellTypes.size })
  return stats
}

/** Valor de atributo do Yosys ligado (`1`, `"1"`, `"000…01"`). */
export function isAttributeSet(value: unknown): boolean {
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return /^[01]+$/.test(value) ? /1/.test(value) : value !== ''
  return false
}

/** Módulos da netlist que podem ser top (exclui caixas-pretas), em ordem determinística. */
export function moduleCandidates(netlist: Netlist): string[] {
  return Object.entries(recordOf(netlist.modules))
    .filter(([, mod]) => !isAttributeSet(recordOf(recordOf(mod).attributes).blackbox))
    .map(([name]) => name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export const TOP_MESSAGES = {
  missing: 'O backend não informou o módulo top da síntese. Verifique o log e tente novamente.',
  invalid: 'O módulo top informado pelo backend não existe na netlist recebida. Tente sintetizar novamente.',
} as const

export type TopCheck = { ok: true; top: string } | { ok: false; message: string }

/**
 * Valida o `top_module` devolvido pelo backend (`hierarchy -auto-top`) contra
 * os candidatos da netlist. O cliente nunca escolhe um top por conta própria.
 */
export function checkTopModule(netlist: Netlist, topModule: string | null | undefined): TopCheck {
  if (typeof topModule !== 'string' || topModule === '') return { ok: false, message: TOP_MESSAGES.missing }
  if (!moduleCandidates(netlist).includes(topModule)) return { ok: false, message: TOP_MESSAGES.invalid }
  return { ok: true, top: topModule }
}
