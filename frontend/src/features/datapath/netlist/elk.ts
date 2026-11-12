/**
 * Layout com o ELK Layered (algoritmo de Sugiyama com restrições de porta,
 * o mesmo motor usado pelo netlistsvg). Devolve o mesmo `DiagramLayout` do
 * layout próprio (`layout.ts`), que continua sendo o fallback síncrono.
 *
 * Heurísticas aplicadas:
 * - camadas por network simplex (encurta fios longos), entradas fixas na
 *   primeira camada e saídas na última;
 * - minimização de cruzamentos por varredura de camadas com baricentro,
 *   respeitando a posição fixa dos pinos de cada símbolo;
 * - fios ortogonais com espaçamento mínimo entre fios paralelos e entre fio
 *   e bloco (nada passa por cima de um bloco);
 * - realimentações (registradores) tratadas como arestas de retorno.
 */
import type { ElkExtendedEdge, ElkNode, ElkPort } from 'elkjs/lib/elk-api'
import type { DiagramLayout, EdgeRoute, NetFlag, NodeBox, Point } from './layout'
import type { NetlistGraph } from './parse'
import { gateShape, pinYs, symbolSize } from './symbols'

const PAD = 28

const LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.thoroughness': '12',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.cycleBreaking.strategy': 'GREEDY',
  'elk.layered.feedbackEdges': 'true',
  'elk.layered.mergeEdges': 'true',
  'elk.layered.unnecessaryBendpoints': 'false',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.spacing.nodeNode': '30',
  'elk.layered.spacing.nodeNodeBetweenLayers': '64',
  'elk.spacing.edgeEdge': '9',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '9',
  'elk.spacing.edgeNode': '16',
  'elk.layered.spacing.edgeNodeBetweenLayers': '20',
  'elk.spacing.portPort': '12',
  'elk.padding': `[top=${PAD},left=${PAD},bottom=${PAD},right=${PAD}]`,
}

type Elk = { layout: (graph: ElkNode) => Promise<ElkNode> }
let elkPromise: Promise<Elk> | null = null

async function getElk(): Promise<Elk> {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js').then((m) => {
      const ELK = (m as unknown as { default: new () => Elk }).default
      return new ELK()
    })
  }
  return elkPromise
}

const portId = (node: string, side: 'in' | 'out', pin: string) => `${node}\u0001${side}\u0001${pin}`

/** `16'b0000000000000000` → `0`; `8'b10100000` → `8'hA0`; valores com x/z ficam como estão. */
export function shortConst(label: string): string {
  const m = /^(\d+)'b([01]+)$/.exec(label)
  if (!m) return label
  const width = Number(m[1])
  const bits = m[2]
  if (/^0+$/.test(bits)) return '0'
  if (width <= 4) return bits.replace(/^0+(?=.)/, '') === '1' ? '1' : `${width}'b${bits}`
  const hex = BigInt(`0b${bits}`).toString(16).toUpperCase()
  return `${width}'h${hex}`
}

const GLOBAL_NET = /^(clk|clock|ck|rst|rst_n|rstn|reset|reset_n|nreset|arst|srst)$/i
const STUB = 22

/**
 * Ligações que viram etiqueta de rede em vez de fio:
 * - toda saída de constante (o valor fica escrito no pino);
 * - redes globais de entrada (clock e reset) quando chegam a registradores.
 */
function flaggedEdges(graph: NetlistGraph): Set<string> {
  const fanout = new Map<string, number>()
  for (const e of graph.edges) fanout.set(`${e.from.node}|${e.from.pin}`, (fanout.get(`${e.from.node}|${e.from.pin}`) ?? 0) + 1)
  const out = new Set<string>()
  for (const e of graph.edges) {
    const src = graph.nodeById.get(e.from.node)
    if (!src) continue
    if (src.kind === 'const') out.add(e.id)
    else if (src.kind === 'input' && GLOBAL_NET.test(src.name) && (fanout.get(`${e.from.node}|${e.from.pin}`) ?? 0) >= 2) {
      const dst = graph.nodeById.get(e.to.node)
      if (dst && gateShape(dst) === 'dff') out.add(e.id)
    }
  }
  return out
}

export async function layoutGraphElk(graph: NetlistGraph): Promise<DiagramLayout> {
  const elk = await getElk()
  const sizes = new Map(graph.nodes.map((n) => [n.id, symbolSize(n)]))
  const flagged = flaggedEdges(graph)
  // Constantes cujas ligações viraram etiqueta saem do desenho.
  const dropped = new Set(
    graph.nodes.filter((n) => n.kind === 'const' && graph.edges.every((e) => e.from.node !== n.id || flagged.has(e.id))).map((n) => n.id),
  )

  const children: ElkNode[] = graph.nodes.filter((n) => !dropped.has(n.id)).map((node) => {
    const { w, h } = sizes.get(node.id)!
    const inY = pinYs(node, h, node.inputs.length)
    const outY = pinYs(node, h, node.outputs.length)
    const ports: ElkPort[] = [
      ...node.inputs.map((p, i) => ({
        id: portId(node.id, 'in', p.name),
        x: 0,
        y: inY[i],
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': 'WEST', 'elk.port.index': String(node.inputs.length - i) },
      })),
      ...node.outputs.map((p, i) => ({
        id: portId(node.id, 'out', p.name),
        x: w,
        y: outY[i],
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': 'EAST', 'elk.port.index': String(i) },
      })),
    ]
    const layoutOptions: Record<string, string> = { 'elk.portConstraints': 'FIXED_POS' }
    if (node.kind === 'input') layoutOptions['elk.layered.layering.layerConstraint'] = 'FIRST'
    if (node.kind === 'output') layoutOptions['elk.layered.layering.layerConstraint'] = 'LAST'
    return { id: node.id, width: w, height: h, ports, layoutOptions }
  })

  const known = new Set(graph.nodes.map((n) => n.id))
  const edges: ElkExtendedEdge[] = graph.edges
    .filter((e) => known.has(e.from.node) && known.has(e.to.node) && !flagged.has(e.id))
    .map((e) => ({ id: e.id, sources: [portId(e.from.node, 'out', e.from.pin)], targets: [portId(e.to.node, 'in', e.to.pin)] }))

  const result = await elk.layout({ id: 'root', layoutOptions: LAYOUT_OPTIONS, children, edges })

  // Camada aproximada pela coordenada x (o ELK não a expõe diretamente).
  const xs = [...new Set((result.children ?? []).map((c) => Math.round(c.x ?? 0)))].sort((a, b) => a - b)
  const layerOfX = new Map(xs.map((x, i) => [x, i]))

  const boxes: NodeBox[] = (result.children ?? []).map((c) => {
    const node = graph.nodeById.get(c.id)!
    const x = c.x ?? 0
    const y = c.y ?? 0
    const pins: Record<string, Point> = {}
    for (const p of c.ports ?? []) {
      const [, side, pin] = p.id.split('\u0001')
      pins[`${side}:${pin}`] = { x: x + (p.x ?? 0), y: y + (p.y ?? 0) }
    }
    // Garante pinos mesmo se o ELK omitir alguma porta.
    const { w, h } = sizes.get(c.id)!
    node.inputs.forEach((p, i) => (pins[`in:${p.name}`] ??= { x, y: y + pinYs(node, h, node.inputs.length)[i] }))
    node.outputs.forEach((p, i) => (pins[`out:${p.name}`] ??= { x: x + w, y: y + pinYs(node, h, node.outputs.length)[i] }))
    return { id: c.id, x, y, w: c.width ?? w, h: c.height ?? h, layer: layerOfX.get(Math.round(x)) ?? 0, pins }
  })
  const nodeBox = new Map(boxes.map((b) => [b.id, b]))

  const routes: EdgeRoute[] = []
  for (const e of result.edges ?? []) {
    const section = (e as ElkExtendedEdge).sections?.[0]
    const src = graph.edgeById.get(e.id)
    if (!section || !src) continue
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({ x: p.x, y: p.y }))
    const a = nodeBox.get(src.from.node)
    const b = nodeBox.get(src.to.node)
    routes.push({ id: e.id, points, back: !!a && !!b && b.x <= a.x })
  }

  // Etiquetas: um toco em cada pino de destino; nas portas de entrada, um toco de saída.
  const flags: NetFlag[] = []
  const sourceStub = new Set<string>()
  for (const e of graph.edges) {
    if (!flagged.has(e.id)) continue
    const b = nodeBox.get(e.to.node)
    const p2 = b?.pins[`in:${e.to.pin}`]
    if (!b || !p2) continue
    const src = graph.nodeById.get(e.from.node)
    const label = src?.kind === 'const' ? shortConst(e.label || src.name) : (src?.name ?? e.label)
    routes.push({ id: e.id, points: [{ x: p2.x - STUB, y: p2.y }, p2], back: false, flag: true })
    flags.push({ id: `${e.id}#in`, x: p2.x - STUB, y: p2.y, side: 'in', label, edge: e.id })
    // A porta de origem (clk, rst) já mostra o nome; não ganha etiqueta própria.
    sourceStub.add(`${e.from.node}|${e.from.pin}`)
  }

  return {
    flags,
    width: Math.max(result.width ?? 0, PAD * 2),
    height: Math.max(result.height ?? 0, PAD * 2),
    nodes: boxes,
    edges: routes,
    nodeBox,
    edgeRoute: new Map(routes.map((r) => [r.id, r])),
  }
}
