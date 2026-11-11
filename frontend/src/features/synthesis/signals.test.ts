import { describe, expect, it } from 'vitest'
import type { Netlist } from '../../api/types'
import { filterSignals, MAX_SIGNAL_OPTIONS, signalOptions, widthLabel } from './netlist'

const cell = (type: string) => ({ hide_name: 0, type, parameters: {}, attributes: {}, port_directions: {}, connections: {} })
const net = (width: number, hide_name = 0) => ({ hide_name, bits: Array.from({ length: width }, (_, i) => i + 2), attributes: {}, width })

const hierarchical: Netlist = {
  creator: 'Yosys',
  modules: {
    soc: {
      attributes: { top: '1' },
      ports: {
        clk: { direction: 'input', bits: [2], width: 1 },
        'data\\out': { direction: 'output', bits: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], width: 16 },
        bus: { direction: 'inout', bits: [20, 21], width: 2 },
      },
      cells: { u_core: cell('core'), $and$x: cell('$and'), a_dbg: cell('dbg') },
      netnames: { clk: net(1), 'data\\out': net(16), bus: net(2), $auto$1: net(1, 1), 'state[3]': net(4), constructor: net(1) },
    },
    core: {
      attributes: {},
      ports: { i: { direction: 'input', bits: [2], width: 1 } },
      cells: { u_self: cell('core') },
      netnames: { i: net(1), acc: { hide_name: 0, bits: [1, 2, 3, 4, 5, 6, 7, 8], attributes: {} } as unknown as ReturnType<typeof net> },
    },
    dbg: { attributes: {}, ports: {}, cells: {}, netnames: { probe: net(64) } },
  },
}

describe('signalOptions (#29)', () => {
  it('deriva portas e fios visíveis do top e das instâncias, com hierarquia', () => {
    const refs = signalOptions(hierarchical, 'soc').map((s) => [s.ref, s.width, s.direction])
    expect(refs).toEqual([
      ['soc.clk', 1, 'input'],
      ['soc.data\\out', 16, 'output'],
      ['soc.bus', 2, 'inout'],
      ['soc.state[3]', 4, 'internal'],
      ['soc.constructor', 1, 'internal'],
      ['soc.a_dbg.probe', 64, 'internal'],
      ['soc.u_core.i', 1, 'input'],
      ['soc.u_core.acc', 8, 'internal'],
    ])
  })

  it('ignora nomes ocultos, células primitivas e recursão infinita', () => {
    const refs = signalOptions(hierarchical, 'soc').map((s) => s.ref)
    expect(refs.some((r) => r.includes('$'))).toBe(false)
    expect(refs.some((r) => r.includes('u_self'))).toBe(false)
  })

  it('top inexistente ou netlist vazia não gera sinais', () => {
    expect(signalOptions(hierarchical, 'toString')).toEqual([])
    expect(signalOptions({ creator: '', modules: {} }, 'x')).toEqual([])
  })

  it('tolera campos ausentes', () => {
    const netlist = { creator: '', modules: { m: { netnames: { a: { bits: [1, 2] }, $h: {} } } } } as unknown as Netlist
    expect(signalOptions(netlist, 'm')).toEqual([{ ref: 'm.a', name: 'a', scope: 'm', width: 2, direction: 'internal' }])
  })

  it('limita listas gigantes', () => {
    const netnames = Object.fromEntries(Array.from({ length: MAX_SIGNAL_OPTIONS + 10 }, (_, i) => [`n${i}`, net(1)]))
    const netlist = { creator: '', modules: { m: { attributes: {}, ports: {}, cells: {}, netnames } } } as Netlist
    expect(signalOptions(netlist, 'm')).toHaveLength(MAX_SIGNAL_OPTIONS)
  })
})

describe('filterSignals / widthLabel', () => {
  const options = signalOptions(hierarchical, 'soc')
  it('busca por nome sem diferenciar caixa', () => {
    expect(filterSignals(options, ' U_CORE ').map((s) => s.ref)).toEqual(['soc.u_core.i', 'soc.u_core.acc'])
    expect(filterSignals(options, '[3]').map((s) => s.ref)).toEqual(['soc.state[3]'])
    expect(filterSignals(options, '')).toHaveLength(options.length)
    expect(filterSignals(options, 'zzz')).toEqual([])
  })
  it('formata larguras', () => {
    expect(widthLabel(1)).toBe('1 bit')
    expect(widthLabel(16)).toBe('[15:0]')
  })
})
