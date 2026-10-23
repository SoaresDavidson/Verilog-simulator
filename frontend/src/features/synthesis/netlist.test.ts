import { describe, expect, it } from 'vitest'
import type { Netlist } from '../../api/types'
import {
  checkNetlist,
  checkTopModule,
  isAttributeSet,
  moduleCandidates,
  NETLIST_MESSAGES,
  netlistStats,
  signalWidth,
  TOP_MESSAGES,
} from './netlist'

const statMap = (netlist: Netlist) => Object.fromEntries(netlistStats(netlist).map((s) => [s.key, s.value]))

describe('checkNetlist', () => {
  it('rejeita ausente, malformada e sem módulos', () => {
    expect(checkNetlist(null)).toEqual({ ok: false, message: NETLIST_MESSAGES.missing })
    expect(checkNetlist(undefined)).toEqual({ ok: false, message: NETLIST_MESSAGES.missing })
    expect(checkNetlist({ creator: 'x' })).toEqual({ ok: false, message: NETLIST_MESSAGES.invalid })
    expect(checkNetlist({ modules: [] })).toEqual({ ok: false, message: NETLIST_MESSAGES.invalid })
    expect(checkNetlist({ modules: { a: 3 } })).toEqual({ ok: false, message: NETLIST_MESSAGES.invalid })
    expect(checkNetlist({ modules: {} })).toEqual({ ok: false, message: NETLIST_MESSAGES.empty })
  })

  it('aceita módulos com campos ausentes', () => {
    expect(checkNetlist({ modules: { m: {} } }).ok).toBe(true)
  })
})

describe('netlistStats', () => {
  it('soma módulos, células, portas e fios de todos os módulos', () => {
    const netlist = {
      creator: 'Yosys',
      modules: {
        top: {
          attributes: {},
          ports: { a: { direction: 'input', bits: [2, 3], width: 2 }, y: { direction: 'output', bits: [4], width: 1 } },
          cells: {
            u0: { hide_name: 0, type: 'sub', parameters: {}, attributes: {}, port_directions: {}, connections: {} },
            $and$1: { hide_name: 1, type: '$and', parameters: {}, attributes: {}, port_directions: {}, connections: {} },
          },
          netnames: {
            a: { hide_name: 0, bits: [2, 3], attributes: {}, width: 2 },
            y: { hide_name: 0, bits: [4], attributes: {}, width: 1 },
          },
        },
        sub: {
          attributes: {},
          ports: { i: { direction: 'input', bits: [2], width: 1 } },
          cells: { $not$2: { hide_name: 1, type: '$not', parameters: {}, attributes: {}, port_directions: {}, connections: {} } },
          netnames: { i: { hide_name: 0, bits: [2], attributes: {}, width: 1 } },
        },
      },
    } satisfies Netlist
    expect(statMap(netlist)).toEqual({ modules: 2, cells: 3, ports: 3, wires: 3, wireBits: 4, cellTypes: 3 })
  })

  it('não quebra com campos ausentes ou malformados', () => {
    const netlist = { creator: '', modules: { m: { cells: null, ports: 'x', netnames: { n: { bits: [1, 2, 3] } } } } } as unknown as Netlist
    expect(statMap(netlist)).toEqual({ modules: 1, cells: 0, ports: 0, wires: 1, wireBits: 3 })
  })

  it('omite estatísticas opcionais sem dados', () => {
    const netlist = { creator: '', modules: { m: {} } } as unknown as Netlist
    expect(netlistStats(netlist).map((s) => s.key)).toEqual(['modules', 'cells', 'ports', 'wires'])
  })
})

describe('signalWidth', () => {
  it('usa width, depois len(bits), depois 1', () => {
    expect(signalWidth({ width: 32, bits: [1] })).toBe(32)
    expect(signalWidth({ bits: [1, 2, 3, 4] })).toBe(4)
    expect(signalWidth({ width: -1 })).toBe(1)
    expect(signalWidth(null)).toBe(1)
  })
})

describe('moduleCandidates / checkTopModule (#27)', () => {
  const mod = (attributes: Record<string, string | number> = {}) => ({ attributes, ports: {}, cells: {}, netnames: {} })
  const netlist: Netlist = {
    creator: 'Yosys',
    modules: { zeta: mod(), alpha: mod({ top: '00000000000000000000000000000001' }), bb: mod({ blackbox: 1 }), Beta: mod() },
  }

  it('lista só módulos presentes, sem caixas-pretas, em ordem determinística', () => {
    expect(moduleCandidates(netlist)).toEqual(['Beta', 'alpha', 'zeta'])
    expect(moduleCandidates({ creator: '', modules: {} })).toEqual([])
  })

  it('aceita o top do backend somente se estiver na netlist', () => {
    expect(checkTopModule(netlist, 'zeta')).toEqual({ ok: true, top: 'zeta' })
    expect(checkTopModule(netlist, null)).toEqual({ ok: false, message: TOP_MESSAGES.missing })
    expect(checkTopModule(netlist, '')).toEqual({ ok: false, message: TOP_MESSAGES.missing })
    expect(checkTopModule(netlist, 'cpu')).toEqual({ ok: false, message: TOP_MESSAGES.invalid })
    expect(checkTopModule(netlist, 'bb')).toEqual({ ok: false, message: TOP_MESSAGES.invalid })
  })

  it('isAttributeSet interpreta formatos do Yosys', () => {
    expect(isAttributeSet('00000000000000000000000000000001')).toBe(true)
    expect(isAttributeSet('00000000000000000000000000000000')).toBe(false)
    expect(isAttributeSet(1)).toBe(true)
    expect(isAttributeSet(0)).toBe(false)
    expect(isAttributeSet(undefined)).toBe(false)
  })
})
