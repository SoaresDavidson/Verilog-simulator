import { describe, expect, it } from 'vitest'
import type { Netlist } from '../../../api/types'
import { DEFAULT_MAX_NODES } from '../render/DatapathDiagram'
import rawMultArray from '../test/multArray.json'
import { layoutGraph } from './layout'
import { parseNetlist } from './parse'

/**
 * Netlist real do mult_array (multiplicador 16x16 da aula 6), gerada pela
 * imagem do Yosys do projeto — a mesma de backend/tests/fixtures/netlist/multiplicadores.
 */
const multArray = rawMultArray as unknown as Netlist

describe('netlist real do mult_array', () => {
  const graph = parseNetlist(multArray)!
  const layout = layoutGraph(graph)

  it('identifica o top e as portas 16x16 -> 32', () => {
    expect(graph.module).toBe('mult_array')
    expect(graph.isTop).toBe(true)
    const width = (id: string) => graph.nodeById.get(id)?.width
    expect([width('in:a'), width('in:b'), width('out:produto')]).toEqual([16, 16, 32])
  })

  it('desenha todas as células sem cair no fallback de estrutura grande', () => {
    expect(graph.nodes.filter((n) => n.kind === 'cell').length).toBe(Object.keys(multArray.modules.mult_array.cells).length)
    expect(graph.nodes.length).toBeLessThanOrEqual(DEFAULT_MAX_NODES)
  })

  it('posiciona cada nó com coordenadas finitas e roteia todas as arestas', () => {
    expect(layout.nodes).toHaveLength(graph.nodes.length)
    for (const box of layout.nodes) {
      expect([box.x, box.y, box.w, box.h].every(Number.isFinite)).toBe(true)
    }
    expect(layout.edges).toHaveLength(graph.edges.length)
    expect(Number.isFinite(layout.width) && Number.isFinite(layout.height)).toBe(true)
  })
})
