import type { SimulationResponse, SynthesisResponse } from '../api/types'
import { initialSessionState, type SessionState } from '../state/session'

export const PROJECT_ID = 'runs/run_0123456789abcdef0123456789abcdef'
export const SESSION_TOKEN = 'tok-test-123'

export const synthesisOk: SynthesisResponse = {
  success: true,
  stdout: 'ok',
  stderr: '',
  top_module: 'top',
  netlist_content: {
    creator: 'Yosys',
    modules: {
      top: {
        attributes: { top: '00000000000000000000000000000001' },
        ports: { clk: { direction: 'input', bits: [2], width: 1 } },
        cells: {},
        netnames: { clk: { hide_name: 0, bits: [2], attributes: {}, width: 1 } },
      },
    },
  },
  stat_report: null,
}

export const simulationOk: SimulationResponse = {
  success: true,
  stdout: '',
  stderr: '',
  simulation_log: {
    metadata: { timescale: '1ns', begintime: 0, endtime: 10 },
    modules: {},
    timeline: { '0': { 'top.clk': '0' }, '10': { 'top.clk': '1' } },
  },
}

/** Estado com sessão criada (após upload). */
export function uploadedState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    ...initialSessionState,
    session: { projectId: PROJECT_ID, sessionToken: SESSION_TOKEN, fileName: 'cpu.zip' },
    files: { origin: 'client-preview', items: [{ path: 'src/top.v', size: 120, kind: 'source' }] },
    ...overrides,
  }
}

/** Estado com síntese confirmada. */
export function synthesizedState(overrides: Partial<SessionState> = {}): SessionState {
  return uploadedState({
    synthesis: { status: 'success', result: synthesisOk, error: null },
    topModule: 'top',
    ...overrides,
  })
}
