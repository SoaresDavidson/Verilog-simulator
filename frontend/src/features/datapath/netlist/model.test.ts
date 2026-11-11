import { describe, expect, it } from 'vitest'
import type { Netlist } from '../../../api/types'
import { emptyNetlist, hierNetlist, simpleNetlist } from '../test/netlists'
import { buildNetlistModel, constantLabel, formatParameter, indexBitUses, isTopAttribute } from './model'

describe('buildNetlistModel', () => {
  it('identifica o top pelo atributo e monta a hierarquia a partir dele', () => {
    const model = buildNetlistModel(hierNetlist)
    expect(model.top).toBe('cpu')
    expect(model.tree).toEqual([
      { name: 'cpu', depth: 0 },
      { name: 'alu', depth: 1 },
      { name: 'idle', depth: 0 },
    ])
    expect(model.byName.get('cpu')!.submodules).toEqual(['alu'])
    expect(model.byName.get('cpu')!.cells.find((c) => c.name === 'u_alu')!.submodule).toBe('alu')
  })

  it('top_module da resposta prevalece sobre o atributo', () => {
    const model = buildNetlistModel(hierNetlist, 'alu')
    expect(model.top).toBe('alu')
    expect(model.byName.get('alu')!.isTop).toBe(true)
    expect(model.byName.get('cpu')!.isTop).toBe(false)
  })

  it('larguras de barramento vêm de len(bits)', () => {
    const cpu = buildNetlistModel(hierNetlist).byName.get('cpu')!
    expect(cpu.ports.find((p) => p.name === 'a')!.width).toBe(8)
    expect(cpu.nets.find((n) => n.name === 'alu_out')!.width).toBe(8)
    const eq = cpu.cells.find((c) => c.type === '$eq')!
    expect(eq.connections.map((c) => [c.port, c.width, c.direction])).toEqual([
      ['A', 8, 'input'],
      ['B', 8, 'input'],
      ['Y', 1, 'output'],
    ])
  })

  it('netlist vazio ou nulo não quebra', () => {
    for (const n of [emptyNetlist, null, undefined, {} as Netlist]) {
      const model = buildNetlistModel(n)
      expect(model.modules).toEqual([])
      expect(model.top).toBeNull()
      expect(model.tree).toEqual([])
    }
  })

  it('tolera campos ausentes e bits malformados', () => {
    const raw = {
      creator: 'x',
      modules: { m: { attributes: {}, ports: { p: { direction: 'weird', bits: [7, 'Z', null, '1'] } } } },
    } as unknown as Netlist
    const m = buildNetlistModel(raw).byName.get('m')!
    expect(m.cells).toEqual([])
    expect(m.nets).toEqual([])
    expect(m.ports[0]).toMatchObject({ direction: 'inout', bits: [7, 'z', 'x', '1'], width: 4 })
  })

  it('módulo único sem atributo top vira top', () => {
    const n: Netlist = { creator: '', modules: { solo: { ...simpleNetlist.modules.and2, attributes: {} } } }
    expect(buildNetlistModel(n).top).toBe('solo')
  })
})

describe('helpers', () => {
  it('isTopAttribute aceita 1, "1" e binário', () => {
    expect(isTopAttribute({ top: 1 })).toBe(true)
    expect(isTopAttribute({ top: '00000000000000000000000000000001' })).toBe(true)
    expect(isTopAttribute({ top: 0 })).toBe(false)
    expect(isTopAttribute({})).toBe(false)
  })

  it('formatParameter converte binário em decimal', () => {
    expect(formatParameter('00000000000000000000000000001000')).toBe('8')
    expect(formatParameter('texto')).toBe('texto')
    expect(formatParameter(3)).toBe('3')
  })

  it('constantLabel escreve MSB primeiro', () => {
    expect(constantLabel(['1', '0', '0'])).toBe("3'b001")
    expect(constantLabel(['z'])).toBe('z')
    expect(constantLabel([1, '0'])).toBeNull()
  })

  it('indexBitUses correlaciona porta, fio e conexões de células', () => {
    const cpu = buildNetlistModel(hierNetlist).byName.get('cpu')!
    const uses = indexBitUses(cpu).get(2)!
    expect(uses).toEqual(
      expect.arrayContaining([
        { kind: 'port', name: 'clk', index: 0 },
        { kind: 'net', name: 'clk', index: 0 },
        { kind: 'cell', name: '$procdff$3', pin: 'CLK', index: 0 },
      ]),
    )
  })
})
