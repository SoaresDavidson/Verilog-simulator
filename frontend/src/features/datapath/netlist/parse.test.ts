import { describe, expect, it } from 'vitest'
import { buildNetlistModel } from './model'
import { edgesOfNet, edgesOfNode, parseNetlist } from './parse'
import { emptyNetlist, hierNetlist, simpleNetlist } from '../test/netlists'

describe('parseNetlist', () => {
  it('módulo simples: portas viram nós e a célula liga entradas à saída', () => {
    const g = parseNetlist(simpleNetlist)!
    expect(g.module).toBe('and2')
    expect(g.isTop).toBe(true)
    expect(g.nodes.map((n) => [n.id, n.kind])).toEqual([
      ['in:a', 'input'],
      ['in:b', 'input'],
      ['out:y', 'output'],
      ['cell:$and$and2.v:3$1', 'cell'],
    ])
    expect(g.edges.map((e) => `${e.from.node}.${e.from.pin}->${e.to.node}.${e.to.pin}:${e.label}`).sort()).toEqual([
      'cell:$and$and2.v:3$1.Y->out:y.y:y',
      'in:a.a->cell:$and$and2.v:3$1.A:a',
      'in:b.b->cell:$and$and2.v:3$1.B:b',
    ])
  })

  it('usa o top por padrão e aceita módulo explícito ou modelo pronto', () => {
    expect(parseNetlist(hierNetlist)!.module).toBe('cpu')
    expect(parseNetlist(hierNetlist, { module: 'alu' })!.module).toBe('alu')
    expect(parseNetlist(buildNetlistModel(hierNetlist), { module: 'idle' })!.module).toBe('idle')
    expect(parseNetlist(hierNetlist, { module: 'nao-existe' })).toBeNull()
  })

  it('barramentos viram uma aresta com largura e nome do fio', () => {
    const g = parseNetlist(hierNetlist)!
    const e = g.edges.find((x) => x.from.node === 'cell:u_alu' && x.to.node === 'cell:$procdff$3')!
    expect(e).toMatchObject({ width: 8, label: 'alu_out', net: 'net:alu_out', constant: false })
    expect(g.nodeById.get('in:a')!.width).toBe(8)
  })

  it('submódulo vira nó de instância', () => {
    const node = parseNetlist(hierNetlist)!.nodeById.get('cell:u_alu')!
    expect(node).toMatchObject({ kind: 'instance', submodule: 'alu', type: 'alu' })
    expect(node.inputs.map((p) => p.name)).toEqual(['A', 'B'])
    expect(node.outputs.map((p) => p.name)).toEqual(['Y'])
  })

  it('constantes 0/1/x/z viram nós próprios com valor', () => {
    const g = parseNetlist(hierNetlist)!
    const consts = g.nodes.filter((n) => n.kind === 'const').map((n) => n.name)
    expect(consts.sort()).toEqual(['1', "8'b00000000", 'x', 'z'])
    const eqB = g.edges.find((e) => e.to.node === 'cell:$eq$cpu.v:9$2' && e.to.pin === 'B')!
    expect(eqB).toMatchObject({ constant: true, width: 8, net: null })
  })

  it('registrador realimentado e fios: consultas por nó e por fio', () => {
    const g = parseNetlist(hierNetlist)!
    const { incoming, outgoing } = edgesOfNode(g, 'cell:$procdff$3')
    expect(incoming.map((e) => e.to.pin).sort()).toEqual(['CLK', 'D'])
    expect(outgoing.map((e) => e.to.node).sort()).toEqual(['cell:$eq$cpu.v:9$2', 'out:y'])
    expect(edgesOfNet(g, 'net:y')).toHaveLength(2)
  })

  it('fatias de barramento recebem rótulo com índices', () => {
    const n = structuredClone(simpleNetlist)
    const m = n.modules.and2
    m.ports.a = { direction: 'input', bits: [2, 5], width: 2 }
    m.netnames.a = { hide_name: 0, bits: [2, 5], attributes: {}, width: 2 }
    const g = parseNetlist(n)!
    expect(g.edges.find((e) => e.to.pin === 'A')!.label).toBe('a[0]')
  })

  it('netlist vazio não gera grafo; módulo sem células gera só portas', () => {
    expect(parseNetlist(emptyNetlist)).toBeNull()
    expect(parseNetlist(null)).toBeNull()
    const idle = parseNetlist(hierNetlist, { module: 'idle' })!
    expect(idle.nodes.map((n) => n.id)).toEqual(['in:en'])
    expect(idle.edges).toEqual([])
  })
})
