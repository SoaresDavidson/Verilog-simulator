import { describe, expect, it } from 'vitest'
import { layoutGraph, routePath, type NodeBox } from './layout'
import { parseNetlist } from './parse'
import { chainNetlist, hierNetlist, simpleNetlist } from '../test/netlists'

function overlaps(a: NodeBox, b: NodeBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

describe('layoutGraph', () => {
  it('entradas à esquerda, saídas à direita, células no meio', () => {
    const g = parseNetlist(simpleNetlist)!
    const l = layoutGraph(g)
    const box = (id: string) => l.nodeBox.get(id)!
    expect(box('in:a').layer).toBe(0)
    expect(box('cell:$and$and2.v:3$1').layer).toBe(1)
    expect(box('out:y').layer).toBe(2)
    expect(box('in:a').x).toBeLessThan(box('cell:$and$and2.v:3$1').x)
    expect(box('cell:$and$and2.v:3$1').x).toBeLessThan(box('out:y').x)
  })

  it('todo nó e aresta tem posição; nós não se sobrepõem e cabem na área', () => {
    const g = parseNetlist(hierNetlist)!
    const l = layoutGraph(g)
    expect(l.nodes).toHaveLength(g.nodes.length)
    expect(l.edges).toHaveLength(g.edges.length)
    for (const n of l.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.x + n.w).toBeLessThanOrEqual(l.width)
      expect(n.y + n.h).toBeLessThanOrEqual(l.height)
    }
    for (let i = 0; i < l.nodes.length; i++)
      for (let j = i + 1; j < l.nodes.length; j++) expect(overlaps(l.nodes[i], l.nodes[j])).toBe(false)
  })

  it('arestas começam no pino de saída e terminam no pino de entrada', () => {
    const g = parseNetlist(hierNetlist)!
    const l = layoutGraph(g)
    for (const e of g.edges) {
      const r = l.edgeRoute.get(e.id)!
      expect(r.points[0]).toEqual(l.nodeBox.get(e.from.node)!.pins[`out:${e.from.pin}`])
      expect(r.points[r.points.length - 1]).toEqual(l.nodeBox.get(e.to.node)!.pins[`in:${e.to.pin}`])
      // Segmentos ortogonais.
      for (let i = 1; i < r.points.length; i++) {
        const [a, b] = [r.points[i - 1], r.points[i]]
        expect(a.x === b.x || a.y === b.y).toBe(true)
      }
    }
  })

  it('constantes ficam na camada anterior a quem consomem', () => {
    const g = parseNetlist(hierNetlist)!
    const l = layoutGraph(g)
    for (const n of g.nodes.filter((x) => x.kind === 'const')) {
      const target = g.edges.find((e) => e.from.node === n.id)!.to.node
      expect(l.nodeBox.get(n.id)!.layer).toBe(l.nodeBox.get(target)!.layer - 1)
    }
  })

  it('ciclos não travam e viram arestas de retorno', () => {
    const n = structuredClone(simpleNetlist)
    // y realimenta a entrada B da própria porta AND.
    n.modules.and2.cells['$and$and2.v:3$1'].connections.B = [4]
    const g = parseNetlist(n)!
    const l = layoutGraph(g)
    expect(l.edges.some((e) => e.back)).toBe(false) // auto-laço ignorado no parser
    const loop = chainNetlist(3)
    loop.modules.chain.cells.inv0.connections.A = [5] // saída de inv2 volta para inv0
    const lg = parseNetlist(loop)!
    const ll = layoutGraph(lg)
    const back = ll.edges.filter((e) => e.back)
    expect(back).toHaveLength(1)
    // Rota de retorno passa por cima de todos os nós.
    const topY = Math.min(...ll.nodes.map((b) => b.y))
    expect(Math.min(...back[0].points.map((p) => p.y))).toBeLessThan(topY)
    const chain = layoutGraph(parseNetlist(chainNetlist(50))!)
    expect(chain.nodes).toHaveLength(52)
    expect(new Set(chain.nodes.map((b) => b.layer)).size).toBe(52)
  })

  it('é determinístico e gera caminho SVG válido', () => {
    const g = parseNetlist(hierNetlist)!
    expect(layoutGraph(g)).toEqual(layoutGraph(g))
    expect(routePath([{ x: 0, y: 0 }, { x: 10.04, y: 0 }])).toBe('M0,0 L10,0')
  })

  it('grafo só com portas', () => {
    const l = layoutGraph(parseNetlist(hierNetlist, { module: 'idle' })!)
    expect(l.nodes).toHaveLength(1)
    expect(l.width).toBeGreaterThan(0)
  })
})
