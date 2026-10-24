/**
 * Layout em camadas (#30), sem dependências: suficiente para datapaths de
 * aula e previsível em testes.
 *
 * 1. Quebra ciclos (registradores realimentados) por DFS; arestas de retorno
 *    são roteadas por cima do diagrama.
 * 2. Camada = caminho mais longo a partir das entradas. Portas de entrada
 *    ficam na coluna 0, de saída na última; constantes logo antes de quem
 *    as consome.
 * 3. Ordem dentro da camada por baricentro (algumas varreduras).
 * 4. Arestas ortogonais: saem do pino, descem/sobem num canal vertical na
 *    folga após a coluna de origem e entram no pino de destino.
 */
import type { GraphNode, NetlistGraph } from './parse'

export interface Point {
  x: number
  y: number
}

export interface NodeBox {
  id: string
  x: number
  y: number
  w: number
  h: number
  layer: number
  /** Posição absoluta dos pinos: `in:<pino>` (lado esquerdo) e `out:<pino>` (direito). */
  pins: Record<string, Point>
}

export interface EdgeRoute {
  id: string
  points: Point[]
  /** Aresta de realimentação (destino numa camada anterior ou igual). */
  back: boolean
}

export interface DiagramLayout {
  width: number
  height: number
  nodes: NodeBox[]
  edges: EdgeRoute[]
  nodeBox: ReadonlyMap<string, NodeBox>
  edgeRoute: ReadonlyMap<string, EdgeRoute>
}

export interface LayoutOptions {
  layerGap?: number
  rowGap?: number
  padding?: number
}

export const PIN_PITCH = 16
const HEADER = 30
const CELL_W = 150
const PORT_W = 112
const CONST_W = 76
const BACK_LANE = 6

function nodeSize(node: GraphNode): { w: number; h: number } {
  switch (node.kind) {
    case 'input':
    case 'output':
    case 'inout':
      return { w: PORT_W, h: 30 }
    case 'const':
      return { w: CONST_W, h: 24 }
    default: {
      const pins = Math.max(node.inputs.length, node.outputs.length, 1)
      return { w: CELL_W, h: Math.max(44, HEADER + pins * PIN_PITCH) }
    }
  }
}

function pinOffsets(node: GraphNode, h: number, count: number): number[] {
  if (node.kind === 'cell' || node.kind === 'instance') {
    return Array.from({ length: count }, (_, i) => HEADER + i * PIN_PITCH + PIN_PITCH / 2 - 4)
  }
  return Array.from({ length: count }, () => h / 2)
}

export function layoutGraph(graph: NetlistGraph, options: LayoutOptions = {}): DiagramLayout {
  const layerGap = options.layerGap ?? 72
  const rowGap = options.rowGap ?? 22
  const pad = options.padding ?? 24
  const ids = graph.nodes.map((n) => n.id)
  const index = new Map(ids.map((id, i) => [id, i]))

  const succ = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]))
  const pred = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]))
  for (const e of graph.edges) {
    if (e.from.node === e.to.node || !succ.has(e.from.node) || !succ.has(e.to.node)) continue
    succ.get(e.from.node)!.add(e.to.node)
    pred.get(e.to.node)!.add(e.from.node)
  }

  // 1. Arestas de retorno via DFS iterativo (começando pelas fontes).
  const back = new Set<string>()
  const state = new Map<string, 1 | 2>()
  const roots = [
    ...graph.nodes.filter((n) => n.kind === 'input' || n.kind === 'const' || pred.get(n.id)!.size === 0),
    ...graph.nodes,
  ]
  for (const root of roots) {
    if (state.has(root.id)) continue
    const stack: Array<[string, Iterator<string>]> = [[root.id, succ.get(root.id)!.values()]]
    state.set(root.id, 1)
    while (stack.length) {
      const [id, it] = stack[stack.length - 1]
      const next = it.next()
      if (next.done) {
        state.set(id, 2)
        stack.pop()
        continue
      }
      const to = next.value
      const s = state.get(to)
      if (s === 1) back.add(`${id}\u0000${to}`)
      else if (s === undefined) {
        state.set(to, 1)
        stack.push([to, succ.get(to)!.values()])
      }
    }
  }
  const isBack = (from: string, to: string) => back.has(`${from}\u0000${to}`)

  // 2. Camadas por caminho mais longo (Kahn sobre o DAG sem arestas de retorno).
  const kind = new Map(graph.nodes.map((n) => [n.id, n.kind]))
  // Coluna 0 é das entradas/constantes; o resto começa na 1 e é empurrado adiante.
  const layer = new Map<string, number>(graph.nodes.map((n) => [n.id, n.kind === 'input' || n.kind === 'const' ? 0 : 1]))
  const indeg = new Map(ids.map((id) => [id, [...pred.get(id)!].filter((p) => !isBack(p, id)).length]))
  const queue = ids.filter((id) => indeg.get(id) === 0)
  while (queue.length) {
    const id = queue.shift()!
    for (const to of succ.get(id)!) {
      if (isBack(id, to)) continue
      layer.set(to, Math.max(layer.get(to)!, layer.get(id)! + 1))
      indeg.set(to, indeg.get(to)! - 1)
      if (indeg.get(to) === 0) queue.push(to)
    }
  }
  let inner = 0
  for (const id of ids) {
    const k = kind.get(id)
    if (k === 'input') layer.set(id, 0)
    else if (k !== 'output' && k !== 'const') inner = Math.max(inner, layer.get(id)!)
  }
  const hasInner = graph.nodes.some((n) => n.kind !== 'input' && n.kind !== 'output' && n.kind !== 'const')
  const lastLayer = hasInner ? inner + 1 : 1
  for (const id of ids) {
    const k = kind.get(id)
    if (k === 'output') layer.set(id, lastLayer)
    else if (k === 'const') {
      const targets = [...succ.get(id)!].map((t) => layer.get(t)!)
      layer.set(id, Math.max(0, Math.min(lastLayer, ...targets) - 1))
    }
  }

  // 3. Ordem por baricentro.
  const layerCount = lastLayer + 1
  const columns: string[][] = Array.from({ length: layerCount }, () => [])
  for (const id of ids) columns[layer.get(id)!].push(id)
  const pos = new Map<string, number>()
  const refreshPos = () => columns.forEach((col) => col.forEach((id, i) => pos.set(id, i)))
  refreshPos()
  const sweep = (neighbours: Map<string, Set<string>>, order: number[]) => {
    for (const l of order) {
      const bary = new Map<string, number>()
      for (const id of columns[l]) {
        const ns = [...neighbours.get(id)!].filter((n) => layer.get(n) !== l)
        bary.set(id, ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(id)!)
      }
      columns[l].sort((a, b) => bary.get(a)! - bary.get(b)! || index.get(a)! - index.get(b)!)
      columns[l].forEach((id, i) => pos.set(id, i))
    }
  }
  const down = Array.from({ length: layerCount - 1 }, (_, i) => i + 1)
  const up = Array.from({ length: layerCount - 1 }, (_, i) => layerCount - 2 - i)
  for (let i = 0; i < 3; i++) {
    sweep(pred, down)
    sweep(succ, up)
  }

  // 4. Coordenadas.
  const nodeOf = new Map(graph.nodes.map((n) => [n.id, n]))
  const sizes = new Map(graph.nodes.map((n) => [n.id, nodeSize(n)]))
  const colW = columns.map((col) => Math.max(0, ...col.map((id) => sizes.get(id)!.w)))
  const colH = columns.map((col) => col.reduce((s, id) => s + sizes.get(id)!.h, 0) + Math.max(0, col.length - 1) * rowGap)
  const maxH = Math.max(0, ...colH)
  const backCount = graph.edges.filter((e) => isBack(e.from.node, e.to.node) || e.from.node === e.to.node).length
  const top = pad + (backCount > 0 ? Math.min(backCount, 12) * BACK_LANE + 12 : 0)

  const colX: number[] = []
  let x = pad
  for (let l = 0; l < layerCount; l++) {
    colX.push(x)
    x += colW[l] + layerGap
  }
  const width = Math.max(x - layerGap + pad, pad * 2)
  const height = top + maxH + pad

  const boxes: NodeBox[] = []
  columns.forEach((col, l) => {
    let y = top + (maxH - colH[l]) / 2
    for (const id of col) {
      const node = nodeOf.get(id)!
      const { w, h } = sizes.get(id)!
      const bx = colX[l] + (colW[l] - w) / 2
      const pins: Record<string, Point> = {}
      const inY = pinOffsets(node, h, node.inputs.length)
      node.inputs.forEach((p, i) => (pins[`in:${p.name}`] = { x: bx, y: y + inY[i] }))
      const outY = pinOffsets(node, h, node.outputs.length)
      node.outputs.forEach((p, i) => (pins[`out:${p.name}`] = { x: bx + w, y: y + outY[i] }))
      boxes.push({ id, x: bx, y, w, h, layer: l, pins })
      y += h + rowGap
    }
  })
  const nodeBox = new Map(boxes.map((b) => [b.id, b]))

  // Canais verticais: espalha as arestas que saem de cada coluna na folga.
  const perColumn = new Map<number, number>()
  const routes: EdgeRoute[] = []
  let backLane = 0
  for (const e of graph.edges) {
    const a = nodeBox.get(e.from.node)
    const b = nodeBox.get(e.to.node)
    if (!a || !b) continue
    const p1 = a.pins[`out:${e.from.pin}`] ?? { x: a.x + a.w, y: a.y + a.h / 2 }
    const p2 = b.pins[`in:${e.to.pin}`] ?? { x: b.x, y: b.y + b.h / 2 }
    if (b.layer > a.layer) {
      const n = perColumn.get(a.layer) ?? 0
      perColumn.set(a.layer, n + 1)
      const slack = colX[a.layer] + colW[a.layer]
      const lanes = Math.max(1, Math.floor((layerGap - 24) / 5))
      const cx = slack + 12 + (n % lanes) * 5
      routes.push({
        id: e.id,
        back: false,
        points: p1.y === p2.y ? [p1, p2] : [p1, { x: cx, y: p1.y }, { x: cx, y: p2.y }, p2],
      })
    } else {
      const lane = backLane++ % 12
      const ly = pad + lane * BACK_LANE
      const ox = p1.x + 10 + (lane % 4) * 3
      const ix = p2.x - 10 - (lane % 4) * 3
      routes.push({
        id: e.id,
        back: true,
        points: [p1, { x: ox, y: p1.y }, { x: ox, y: ly }, { x: ix, y: ly }, { x: ix, y: p2.y }, p2],
      })
    }
  }

  return {
    width,
    height,
    nodes: boxes,
    edges: routes,
    nodeBox,
    edgeRoute: new Map(routes.map((r) => [r.id, r])),
  }
}

/** Atributo `points`/`d` de uma rota. */
export function routePath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join(' ')
}

function round(v: number): number {
  return Math.round(v * 10) / 10
}
