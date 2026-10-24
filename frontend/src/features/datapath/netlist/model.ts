/**
 * Leitura defensiva do netlist Yosys (#20) para uma forma navegável.
 *
 * Fonte única de verdade para o visualizador estrutural (#21) e para o parser
 * do diagrama (#30, reutilizado pela #32). Campos ausentes ou malformados
 * viram coleções vazias: o backend ainda pode evoluir o contrato.
 */
import type { NetBit, Netlist, NetlistModule, PortDirection, YosysAttributes } from '../../../api/types'

export type ConstBit = '0' | '1' | 'x' | 'z'

const CONST_BITS: ReadonlySet<string> = new Set(['0', '1', 'x', 'z'])

export function isConstBit(bit: unknown): bit is ConstBit {
  return typeof bit === 'string' && CONST_BITS.has(bit)
}

/**
 * Índice de net (número) ou `null`. No JSON do Yosys strings são sempre
 * constantes (`"0"`, `"1"`, `"x"`, `"z"`), nunca índices.
 */
export function netIndex(bit: unknown): number | null {
  return typeof bit === 'number' && Number.isInteger(bit) ? bit : null
}

/** Normaliza um bit vindo da API; valores desconhecidos viram `x`. */
export function normalizeBit(bit: unknown): NetBit {
  const idx = netIndex(bit)
  if (idx !== null) return idx
  if (typeof bit === 'string') {
    const lower = bit.toLowerCase()
    if (isConstBit(lower)) return lower
  }
  return 'x'
}

function normalizeBits(bits: unknown): NetBit[] {
  return Array.isArray(bits) ? bits.map(normalizeBit) : []
}

/** Valor de atributo Yosys (`1`, `"1"`, `"000..01"`) como inteiro, se possível. */
function attrAsInt(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^[01]+$/.test(value)) return parseInt(value, 2)
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return null
}

export function isTopAttribute(attrs: YosysAttributes | undefined): boolean {
  return attrs !== undefined && attrs !== null && attrAsInt(attrs.top) === 1
}

/**
 * Formata parâmetro Yosys. Strings binárias puras viram decimal (parâmetros
 * inteiros chegam como `"000...1000"`); o resto é exibido como veio.
 */
export function formatParameter(value: unknown): string {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return JSON.stringify(value) ?? ''
  if (/^[01]+$/.test(value) && value.length > 1) {
    try {
      return BigInt(`0b${value}`).toString(10)
    } catch {
      return value
    }
  }
  return value
}

export function directionLabel(direction: PortDirection | 'unknown'): string {
  switch (direction) {
    case 'input':
      return 'entrada'
    case 'output':
      return 'saída'
    case 'inout':
      return 'bidirecional'
    default:
      return 'desconhecida'
  }
}

export interface PortInfo {
  name: string
  direction: PortDirection
  bits: NetBit[]
  width: number
}

export interface CellConnection {
  port: string
  direction: PortDirection | 'unknown'
  bits: NetBit[]
  width: number
}

export interface CellInfo {
  name: string
  type: string
  /** Nome gerado pelo Yosys (`hide_name = 1`, ex.: `$and$top.v:3$1`). */
  hidden: boolean
  parameters: Array<[string, string]>
  connections: CellConnection[]
  /** Nome do módulo instanciado quando `type` é um módulo do próprio netlist. */
  submodule: string | null
}

export interface NetInfo {
  name: string
  bits: NetBit[]
  width: number
  hidden: boolean
}

export interface ModuleInfo {
  name: string
  isTop: boolean
  ports: PortInfo[]
  cells: CellInfo[]
  nets: NetInfo[]
  /** Submódulos instanciados (sem repetição). */
  submodules: string[]
}

export interface ModuleTreeEntry {
  name: string
  /** Profundidade na hierarquia a partir do top (0 = raiz). */
  depth: number
}

export interface NetlistModel {
  modules: ModuleInfo[]
  byName: ReadonlyMap<string, ModuleInfo>
  top: string | null
  /** Ordem de exibição: árvore a partir do top, depois módulos não alcançados. */
  tree: ModuleTreeEntry[]
}

const DIRECTIONS: ReadonlySet<string> = new Set(['input', 'output', 'inout'])

function asRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, T>) : {}
}

/** Heurística para células sem `port_directions` (saídas comuns do Yosys). */
export function guessPinDirection(port: string): PortDirection | 'unknown' {
  return /^(Y|Q|O|OUT|X)$/i.test(port) ? 'output' : 'unknown'
}

function readModule(name: string, raw: NetlistModule, moduleNames: ReadonlySet<string>): ModuleInfo {
  const ports: PortInfo[] = Object.entries(asRecord<NetlistModule['ports'][string]>(raw?.ports)).map(([portName, p]) => {
    const bits = normalizeBits(p?.bits)
    const direction = DIRECTIONS.has(p?.direction) ? p.direction : 'inout'
    return { name: portName, direction, bits, width: bits.length || Number(p?.width) || 0 }
  })

  const submodules = new Set<string>()
  const cells: CellInfo[] = Object.entries(asRecord<NetlistModule['cells'][string]>(raw?.cells)).map(([cellName, c]) => {
    const dirs = asRecord<PortDirection>(c?.port_directions)
    const connections = Object.entries(asRecord<unknown>(c?.connections)).map(([port, bitsRaw]) => {
      const bits = normalizeBits(bitsRaw)
      const dir = DIRECTIONS.has(dirs[port]) ? dirs[port] : guessPinDirection(port)
      return { port, direction: dir, bits, width: bits.length }
    })
    const type = typeof c?.type === 'string' ? c.type : '?'
    const submodule = moduleNames.has(type) ? type : null
    if (submodule) submodules.add(submodule)
    return {
      name: cellName,
      type,
      hidden: Number(c?.hide_name) === 1,
      parameters: Object.entries(asRecord<unknown>(c?.parameters)).map(([k, v]) => [k, formatParameter(v)]),
      connections,
      submodule,
    }
  })

  const nets: NetInfo[] = Object.entries(asRecord<NetlistModule['netnames'][string]>(raw?.netnames))
    .map(([netName, n]) => {
      const bits = normalizeBits(n?.bits)
      return { name: netName, bits, width: bits.length || Number(n?.width) || 0, hidden: Number(n?.hide_name) === 1 }
    })
    // Fios com nome do usuário primeiro; os gerados (`$auto...`) depois.
    .sort((a, b) => Number(a.hidden) - Number(b.hidden))

  return {
    name,
    isTop: isTopAttribute(asRecord<string | number>(raw?.attributes)),
    ports,
    cells,
    nets,
    submodules: [...submodules],
  }
}

function buildTree(modules: ModuleInfo[], byName: ReadonlyMap<string, ModuleInfo>, top: string | null): ModuleTreeEntry[] {
  const tree: ModuleTreeEntry[] = []
  const seen = new Set<string>()
  const visit = (name: string, depth: number) => {
    if (seen.has(name)) return
    seen.add(name)
    tree.push({ name, depth })
    for (const child of byName.get(name)?.submodules ?? []) visit(child, depth + 1)
  }
  if (top && byName.has(top)) visit(top, 0)
  // Raízes restantes (módulos não instanciados por ninguém) e depois o resto.
  const instantiated = new Set(modules.flatMap((m) => m.submodules))
  for (const m of modules) if (!instantiated.has(m.name)) visit(m.name, 0)
  for (const m of modules) visit(m.name, 0)
  return tree
}

/**
 * Converte o netlist da API em modelo navegável.
 * @param topHint `top_module` da resposta de síntese (prevalece sobre o atributo).
 */
export function buildNetlistModel(netlist: Netlist | null | undefined, topHint?: string | null): NetlistModel {
  const rawModules = asRecord<NetlistModule>(netlist?.modules)
  const names = new Set(Object.keys(rawModules))
  const modules = Object.entries(rawModules).map(([name, raw]) => readModule(name, raw, names))
  const byName = new Map(modules.map((m) => [m.name, m]))

  let top: string | null = topHint && byName.has(topHint) ? topHint : null
  top ??= modules.find((m) => m.isTop)?.name ?? null
  if (top === null && modules.length === 1) top = modules[0].name
  for (const m of modules) m.isTop = m.name === top

  return { modules, byName, top, tree: buildTree(modules, byName, top) }
}

/** Onde um índice de net aparece dentro de um módulo. */
export interface BitUse {
  kind: 'port' | 'net' | 'cell'
  /** Nome da porta do módulo, do fio ou da célula. */
  name: string
  /** Porta da célula (só `kind === 'cell'`). */
  pin?: string
  /** Posição do bit no vetor (0 = LSB). */
  index: number
}

/** Índice de correlação bit -> portas/fios/conexões de células. */
export function indexBitUses(module: ModuleInfo): Map<number, BitUse[]> {
  const uses = new Map<number, BitUse[]>()
  const add = (bit: NetBit, use: BitUse) => {
    if (typeof bit !== 'number') return
    const list = uses.get(bit)
    if (list) list.push(use)
    else uses.set(bit, [use])
  }
  for (const p of module.ports) p.bits.forEach((b, index) => add(b, { kind: 'port', name: p.name, index }))
  for (const n of module.nets) n.bits.forEach((b, index) => add(b, { kind: 'net', name: n.name, index }))
  for (const c of module.cells) {
    for (const conn of c.connections) conn.bits.forEach((b, index) => add(b, { kind: 'cell', name: c.name, pin: conn.port, index }))
  }
  return uses
}

/**
 * Rótulo de constante MSB-first (ex.: bits LSB-first `['1','0','0']` -> `3'b001`).
 * Retorna `null` se algum bit não for constante.
 */
export function constantLabel(bits: readonly NetBit[]): string | null {
  if (bits.length === 0 || !bits.every(isConstBit)) return null
  const msbFirst = [...bits].reverse().join('')
  return bits.length === 1 ? msbFirst : `${bits.length}'b${msbFirst}`
}

/** `"8 bits"` / `"1 bit"`. */
export function widthLabel(width: number): string {
  return `${width} ${width === 1 ? 'bit' : 'bits'}`
}
