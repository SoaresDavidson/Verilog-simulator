/**
 * Netlists de teste no formato do Yosys (#20). Cobrem módulo simples,
 * hierarquia, barramentos, constantes 0/1/x/z, módulo sem células e vazio.
 */
import type { Netlist, SynthesisResponse } from '../../../api/types'

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i)
const P8 = '00000000000000000000000000001000'

/** Um AND de duas entradas, módulo único. */
export const simpleNetlist: Netlist = {
  creator: 'Yosys 0.40',
  modules: {
    and2: {
      attributes: { top: '00000000000000000000000000000001' },
      ports: {
        a: { direction: 'input', bits: [2], width: 1 },
        b: { direction: 'input', bits: [3], width: 1 },
        y: { direction: 'output', bits: [4], width: 1 },
      },
      cells: {
        '$and$and2.v:3$1': {
          hide_name: 1,
          type: '$and',
          parameters: { A_WIDTH: '00000000000000000000000000000001', Y_WIDTH: '00000000000000000000000000000001' },
          attributes: {},
          port_directions: { A: 'input', B: 'input', Y: 'output' },
          connections: { A: [2], B: [3], Y: [4] },
        },
      },
      netnames: {
        a: { hide_name: 0, bits: [2], attributes: {}, width: 1 },
        b: { hide_name: 0, bits: [3], attributes: {}, width: 1 },
        y: { hide_name: 0, bits: [4], attributes: {}, width: 1 },
      },
    },
  },
}

/**
 * `cpu` (top) instancia `alu`; barramentos de 8 bits, registrador, comparação
 * com constante e um mux com `x`/`z`/`1`. `idle` não tem células.
 */
export const hierNetlist: Netlist = {
  creator: 'Yosys 0.40',
  modules: {
    alu: {
      attributes: {},
      ports: {
        A: { direction: 'input', bits: range(2, 8), width: 8 },
        B: { direction: 'input', bits: range(10, 8), width: 8 },
        Y: { direction: 'output', bits: range(18, 8), width: 8 },
      },
      cells: {
        '$add$alu.v:3$1': {
          hide_name: 1,
          type: '$add',
          parameters: { A_WIDTH: P8, B_WIDTH: P8, Y_WIDTH: P8 },
          attributes: {},
          port_directions: { A: 'input', B: 'input', Y: 'output' },
          connections: { A: range(2, 8), B: range(10, 8), Y: range(18, 8) },
        },
      },
      netnames: {
        A: { hide_name: 0, bits: range(2, 8), attributes: {}, width: 8 },
        B: { hide_name: 0, bits: range(10, 8), attributes: {}, width: 8 },
        Y: { hide_name: 0, bits: range(18, 8), attributes: {}, width: 8 },
      },
    },
    cpu: {
      attributes: { top: '00000000000000000000000000000001' },
      ports: {
        clk: { direction: 'input', bits: [2], width: 1 },
        a: { direction: 'input', bits: range(3, 8), width: 8 },
        b: { direction: 'input', bits: range(11, 8), width: 8 },
        y: { direction: 'output', bits: range(19, 8), width: 8 },
        zero: { direction: 'output', bits: [27], width: 1 },
        dbg: { direction: 'output', bits: [36], width: 1 },
      },
      cells: {
        u_alu: {
          hide_name: 0,
          type: 'alu',
          parameters: {},
          attributes: {},
          port_directions: { A: 'input', B: 'input', Y: 'output' },
          connections: { A: range(3, 8), B: range(11, 8), Y: range(28, 8) },
        },
        '$procdff$3': {
          hide_name: 1,
          type: '$dff',
          parameters: { WIDTH: P8, CLK_POLARITY: '1' },
          attributes: {},
          port_directions: { CLK: 'input', D: 'input', Q: 'output' },
          connections: { CLK: [2], D: range(28, 8), Q: range(19, 8) },
        },
        '$eq$cpu.v:9$2': {
          hide_name: 1,
          type: '$eq',
          parameters: { A_WIDTH: P8, B_WIDTH: P8 },
          attributes: {},
          port_directions: { A: 'input', B: 'input', Y: 'output' },
          connections: { A: range(19, 8), B: ['0', '0', '0', '0', '0', '0', '0', '0'], Y: [27] },
        },
        '$mux$cpu.v:10$4': {
          hide_name: 1,
          type: '$mux',
          parameters: { WIDTH: '00000000000000000000000000000001' },
          attributes: {},
          port_directions: { A: 'input', B: 'input', S: 'input', Y: 'output' },
          connections: { A: ['x'], B: ['z'], S: ['1'], Y: [36] },
        },
      },
      netnames: {
        clk: { hide_name: 0, bits: [2], attributes: {}, width: 1 },
        a: { hide_name: 0, bits: range(3, 8), attributes: {}, width: 8 },
        b: { hide_name: 0, bits: range(11, 8), attributes: {}, width: 8 },
        y: { hide_name: 0, bits: range(19, 8), attributes: {}, width: 8 },
        zero: { hide_name: 0, bits: [27], attributes: {}, width: 1 },
        alu_out: { hide_name: 0, bits: range(28, 8), attributes: {}, width: 8 },
        dbg: { hide_name: 0, bits: [36], attributes: {}, width: 1 },
      },
    },
    idle: {
      attributes: {},
      ports: { en: { direction: 'input', bits: [2], width: 1 } },
      cells: {},
      netnames: { en: { hide_name: 0, bits: [2], attributes: {}, width: 1 } },
    },
  },
}

export const emptyNetlist: Netlist = { creator: 'Yosys 0.40', modules: {} }

/** Netlist sintético grande: cadeia de `count` inversores. */
export function chainNetlist(count: number): Netlist {
  const cells: Netlist['modules'][string]['cells'] = {}
  for (let i = 0; i < count; i++) {
    cells[`inv${i}`] = {
      hide_name: 0,
      type: '$not',
      parameters: {},
      attributes: {},
      port_directions: { A: 'input', Y: 'output' },
      connections: { A: [2 + i], Y: [3 + i] },
    }
  }
  return {
    creator: 'Yosys',
    modules: {
      chain: {
        attributes: { top: 1 },
        ports: {
          i: { direction: 'input', bits: [2], width: 1 },
          o: { direction: 'output', bits: [2 + count], width: 1 },
        },
        cells,
        netnames: {},
      },
    },
  }
}

export function synthesisWith(netlist: Netlist | null, top: string | null): SynthesisResponse {
  return { success: true, stdout: '', stderr: '', top_module: top, netlist_content: netlist, stat_report: null }
}
