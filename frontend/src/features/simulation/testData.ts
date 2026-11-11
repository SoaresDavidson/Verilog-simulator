/** Dados de teste da tela 4 (usados só pelos testes desta feature). */
import type { SimLog, SimulationResponse } from '../../api/types'
import { synthesizedState } from '../../test/fixtures'
import type { SessionState } from '../../state/session'

/**
 * Hierarquia `tb` -> `tb.uut`. `clk` é alias (mesma referência em dois
 * escopos), `data` é barramento de 8 bits com X inicial e valor comprimido
 * (`1010` = `00001010`), `nosamp` nunca aparece na timeline.
 */
export const cpuLog: SimLog = {
  metadata: { timescale: '1ns', begintime: 0, endtime: 40 },
  modules: {
    tb: {
      name: 'tb',
      variables: {
        clk: { size: 1, var_type: 'reg', references: ['tb.clk', 'tb.uut.clk'] },
        rst: { size: 1, var_type: 'reg', references: ['tb.rst'] },
      },
      child_scopes: ['tb.uut'],
    },
    'tb.uut': {
      name: 'uut',
      variables: {
        clk: { size: 1, var_type: 'wire', references: ['tb.clk', 'tb.uut.clk'] },
        'data[7:0]': { size: 8, var_type: 'wire', references: ['tb.uut.data[7:0]'] },
        nosamp: { size: 1, var_type: 'wire', references: ['tb.uut.nosamp'] },
      },
      child_scopes: [],
    },
  },
  timeline: {
    '0': { 'tb.clk': '0', 'tb.uut.clk': '0', 'tb.rst': '1', 'tb.uut.data[7:0]': 'x' },
    '10': { 'tb.clk': '1', 'tb.uut.clk': '1', 'tb.uut.data[7:0]': '1010' },
    '20': { 'tb.clk': '0', 'tb.uut.clk': '0', 'tb.rst': '0' },
    '30': { 'tb.clk': '1', 'tb.uut.clk': '1', 'tb.uut.data[7:0]': '11111111' },
    '40': { 'tb.clk': '0', 'tb.uut.clk': '0', 'tb.rst': 'z' },
  },
}

export function simResponse(log: SimLog | null = cpuLog, extra: Partial<SimulationResponse> = {}): SimulationResponse {
  return { success: true, stdout: 'VCD info: dumpfile', stderr: '', simulation_log: log, ...extra }
}

/** Estado na etapa 4, sem simulação executada. */
export function readyState(overrides: Partial<SessionState> = {}): SessionState {
  return synthesizedState({ step: 4, selectedSignals: ['clk'], ...overrides })
}

/** Estado na etapa 4 com simulação concluída. */
export function simulatedState(log: SimLog | null = cpuLog, overrides: Partial<SessionState> = {}): SessionState {
  return readyState({
    simulation: { status: 'success', result: simResponse(log), error: null },
    timelineCursor: log?.metadata.begintime ?? null,
    ...overrides,
  })
}
