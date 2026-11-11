/**
 * Netlist -> grafo de um módulo (#30). Sem posições: ver `layout.ts`.
 *
 * Nós: portas do módulo (entrada/saída/bidirecional), células, instâncias de
 * submódulos e constantes. Arestas: uma por par (pino que dirige, pino que
 * recebe), agregando os bits de um barramento numa única aresta com largura.
 * Reutilizado pela tela 4 (#32) para aplicar valores da simulação.
 */
import type { NetBit, Netlist, PortDirection } from '../../../api/types'
import {
  buildNetlistModel,
  constantLabel,
  isConstBit,
  type ModuleInfo,
  type NetlistModel,
} from './model'

export type GraphNodeKind = 'input' | 'output' | 'inout' | 'cell' | 'instance' | 'const'

export interface GraphPin {
  name: string
  direction: PortDirection
  bits: NetBit[]
  width: number
}

export interface GraphNode {
  /** Único no grafo: `in:a`, `out:y`, `io:p`, `cell:<nome>`, `const:<n>`. */
  id: string
  kind: GraphNodeKind
  name: string
  /** Tipo Yosys da célula (`$and`, nome do submódulo) ou direção da porta. */
  type: string
  module: string
  /** Largura em bits: da porta, da constante ou o maior pino da célula. */
  width: number
  /** Pinos de entrada (lado esquerdo do bloco). */
  inputs: GraphPin[]
  /** Pinos de saída (lado direito do bloco). */
  outputs: GraphPin[]
  parameters: Array<[string, string]>
  /** Módulo instanciado quando `kind === 'instance'`. */
  submodule: string | null
  /** Nome gerado pelo Yosys (`hide_name`). */
  hidden: boolean
  /** Valor da constante MSB-first (`kind === 'const'`). */
  constValue?: string
}

export interface GraphNet {
  /** `net:<nome>`. */
  id: string
  name: string
  /** Referência hierárquica `<módulo>.<fio>` (mesma convenção dos sinais da tela 2). */
  ref: string
  bits: NetBit[]
  width: number
  hidden: boolean
}

export interface GraphEndpoint {
  node: string
  pin: string
}

export interface GraphEdge {
  id: string
  from: GraphEndpoint
  to: GraphEndpoint
  /** Bits transportados, na ordem do pino de destino (LSB primeiro). */
  bits: NetBit[]
  width: number
  /** Fio que melhor nomeia os bits (`GraphNet.id`), se houver. */
  net: string | null
  /** Rótulo: nome do fio com fatia (`y[3:0]`) ou valor constante. */
  label: string
  constant: boolean
}

export interface NetlistGraph {
  module: string
  isTop: boolean
  nodes: GraphNode[]
  edges: GraphEdge[]
  nets: GraphNet[]
  nodeById: ReadonlyMap<string, GraphNode>
  netById: ReadonlyMap<string, GraphNet>
  edgeById: ReadonlyMap<string, GraphEdge>
}

interface PinRef {
  node: string
  pin: string
}

function portNodeId(direction: PortDirection, name: string): string {
  return `${direction === 'input' ? 'in' : direction === 'output' ? 'out' : 'io'}:${name}`
}

function sliceLabel(net: GraphNet, bits: readonly NetBit[]): string {
  if (bits.length === net.width) return net.name
  const idx = bits.map((b) => net.bits.indexOf(b))
  const contiguous = idx.every((v, i) => v >= 0 && (i === 0 || v === idx[i - 1] + 1))
  if (!contiguous) return net.name
  return idx.length === 1 ? `${net.name}[${idx[0]}]` : `${net.name}[${idx[idx.length - 1]}:${idx[0]}]`
}

/** Monta o grafo de um módulo já lido por `buildNetlistModel`. */
export function buildModuleGraph(module: ModuleInfo): NetlistGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const drivers = new Map<number, PinRef[]>()
  const sinks: Array<PinRef & { bits: NetBit[] }> = []

  const addDriver = (bit: NetBit, ref: PinRef) => {
    if (typeof bit !== 'number') return
    const list = drivers.get(bit)
    if (list) list.push(ref)
    else drivers.set(bit, [ref])
  }

  for (const p of module.ports) {
    const id = portNodeId(p.direction, p.name)
    const pin: GraphPin = { name: p.name, direction: p.direction, bits: p.bits, width: p.width }
    nodes.push({
      id,
      kind: p.direction,
      name: p.name,
      type: p.direction,
      module: module.name,
      width: p.width,
      // Porta de entrada do módulo dirige o circuito interno (pino de saída do nó).
      inputs: p.direction === 'input' ? [] : [pin],
      outputs: p.direction === 'output' ? [] : [pin],
      parameters: [],
      submodule: null,
      hidden: false,
    })
    if (p.direction !== 'output') p.bits.forEach((b) => addDriver(b, { node: id, pin: p.name }))
    if (p.direction !== 'input') sinks.push({ node: id, pin: p.name, bits: p.bits })
  }

  for (const c of module.cells) {
    const id = `cell:${c.name}`
    const inputs: GraphPin[] = []
    const outputs: GraphPin[] = []
    for (const conn of c.connections) {
      const dir: PortDirection = conn.direction === 'unknown' ? 'input' : conn.direction
      const pin: GraphPin = { name: conn.port, direction: dir, bits: conn.bits, width: conn.width }
      if (dir !== 'output') {
        inputs.push(pin)
        sinks.push({ node: id, pin: conn.port, bits: conn.bits })
      }
      if (dir !== 'input') {
        outputs.push(pin)
        conn.bits.forEach((b) => addDriver(b, { node: id, pin: conn.port }))
      }
    }
    nodes.push({
      id,
      kind: c.submodule ? 'instance' : 'cell',
      name: c.name,
      type: c.type,
      module: module.name,
      width: Math.max(0, ...c.connections.map((x) => x.width)),
      inputs,
      outputs,
      parameters: c.parameters,
      submodule: c.submodule,
      hidden: c.hidden,
    })
  }

  const nets: GraphNet[] = module.nets.map((n) => ({
    id: `net:${n.name}`,
    name: n.name,
    ref: `${module.name}.${n.name}`,
    bits: n.bits,
    width: n.width,
    hidden: n.hidden,
  }))
  const netsByBit = new Map<number, GraphNet[]>()
  for (const net of nets) {
    for (const b of net.bits) {
      if (typeof b !== 'number') continue
      const list = netsByBit.get(b)
      if (list) list.push(net)
      else netsByBit.set(b, [net])
    }
  }
  const pickNet = (bits: readonly NetBit[]): GraphNet | null => {
    const first = bits.find((b): b is number => typeof b === 'number')
    if (first === undefined) return null
    const candidates = (netsByBit.get(first) ?? []).filter((n) => bits.every((b) => n.bits.includes(b)))
    candidates.sort((a, b) => Number(a.hidden) - Number(b.hidden) || Math.abs(a.width - bits.length) - Math.abs(b.width - bits.length))
    return candidates[0] ?? null
  }

  const edgeIds = new Set<string>()
  let constCount = 0
  for (const sink of sinks) {
    // Agrupa os bits do pino de destino por quem os dirige.
    const groups = new Map<string, { from: PinRef; bits: NetBit[] }>()
    const constBits: NetBit[] = []
    for (const bit of sink.bits) {
      if (isConstBit(bit)) {
        constBits.push(bit)
        continue
      }
      for (const from of drivers.get(bit) ?? []) {
        if (from.node === sink.node) continue
        const key = `${from.node}\u0000${from.pin}`
        const g = groups.get(key)
        if (g) g.bits.push(bit)
        else groups.set(key, { from, bits: [bit] })
      }
    }

    if (constBits.length > 0) {
      const value = constantLabel(constBits) ?? ''
      const id = `const:${constCount++}`
      nodes.push({
        id,
        kind: 'const',
        name: value,
        type: 'constante',
        module: module.name,
        width: constBits.length,
        inputs: [],
        outputs: [{ name: 'Y', direction: 'output', bits: constBits, width: constBits.length }],
        parameters: [],
        submodule: null,
        hidden: false,
        constValue: [...constBits].reverse().join(''),
      })
      edges.push({
        id: `${id}->${sink.node}.${sink.pin}`,
        from: { node: id, pin: 'Y' },
        to: { node: sink.node, pin: sink.pin },
        bits: constBits,
        width: constBits.length,
        net: null,
        label: value,
        constant: true,
      })
    }

    for (const { from, bits } of groups.values()) {
      const id = `${from.node}.${from.pin}->${sink.node}.${sink.pin}`
      if (edgeIds.has(id)) continue
      edgeIds.add(id)
      const net = pickNet(bits)
      edges.push({
        id,
        from,
        to: { node: sink.node, pin: sink.pin },
        bits,
        width: bits.length,
        net: net?.id ?? null,
        label: net ? sliceLabel(net, bits) : `bits ${bits.join(',')}`,
        constant: false,
      })
    }
  }

  return {
    module: module.name,
    isTop: module.isTop,
    nodes,
    edges,
    nets,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
    netById: new Map(nets.map((n) => [n.id, n])),
    edgeById: new Map(edges.map((e) => [e.id, e])),
  }
}

export interface ParseOptions {
  /** Módulo a montar; padrão: o top. */
  module?: string | null
  /** `top_module` da resposta de síntese. */
  top?: string | null
}

/**
 * Atalho: netlist da API -> grafo do módulo pedido (ou do top).
 * Retorna `null` se não houver módulo correspondente.
 */
export function parseNetlist(netlist: Netlist | NetlistModel | null | undefined, options: ParseOptions = {}): NetlistGraph | null {
  const model = netlist && 'byName' in netlist ? netlist : buildNetlistModel(netlist, options.top)
  const name = options.module ?? model.top ?? model.tree[0]?.name
  const mod = name ? model.byName.get(name) : undefined
  return mod ? buildModuleGraph(mod) : null
}

/** Arestas que chegam/saem de um nó. */
export function edgesOfNode(graph: NetlistGraph, nodeId: string): { incoming: GraphEdge[]; outgoing: GraphEdge[] } {
  return {
    incoming: graph.edges.filter((e) => e.to.node === nodeId),
    outgoing: graph.edges.filter((e) => e.from.node === nodeId),
  }
}

/** Arestas que transportam bits de um fio. */
export function edgesOfNet(graph: NetlistGraph, netId: string): GraphEdge[] {
  const net = graph.netById.get(netId)
  if (!net) return []
  const bits = new Set<NetBit>(net.bits.filter((b) => typeof b === 'number'))
  return graph.edges.filter((e) => e.net === netId || e.bits.some((b) => typeof b === 'number' && bits.has(b)))
}
