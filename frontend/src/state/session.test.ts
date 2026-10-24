import { describe, expect, it } from 'vitest'
import { simulationOk, synthesisOk, synthesizedState, uploadedState } from '../test/fixtures'
import { initialSessionState, sessionReducer, stepBlockReason } from './session'

describe('sessionReducer', () => {
  it('libera etapas progressivamente conforme confirmações da API', () => {
    let state = initialSessionState
    expect(stepBlockReason(state, 2)).toMatch(/upload/i)

    state = uploadedState()
    expect(stepBlockReason(state, 2)).toBeNull()
    expect(stepBlockReason(state, 3)).toMatch(/síntese/i)

    state = sessionReducer(state, { type: 'SYNTHESIS_STARTED' })
    expect(stepBlockReason(state, 3)).not.toBeNull()
    state = sessionReducer(state, { type: 'SYNTHESIS_SUCCEEDED', result: synthesisOk })
    expect(state.topModule).toBe('top')
    expect(stepBlockReason(state, 3)).toMatch(/sinal/i)
    expect(stepBlockReason(state, 4)).toMatch(/sinal/i)

    state = sessionReducer(state, { type: 'SIGNALS_SELECTED', signals: ['top.clk', 'top.clk'] })
    expect(state.selectedSignals).toEqual(['top.clk'])
    expect(stepBlockReason(state, 3)).toBeNull()
    expect(stepBlockReason(state, 4)).toBeNull()
  })

  it('síntese com success=false não libera a etapa 3', () => {
    const state = sessionReducer(uploadedState(), {
      type: 'SYNTHESIS_SUCCEEDED',
      result: { ...synthesisOk, success: false },
    })
    expect(stepBlockReason(state, 3)).not.toBeNull()
  })

  it('STEP_CHANGED ignora etapa bloqueada', () => {
    const state = sessionReducer(uploadedState(), { type: 'STEP_CHANGED', step: 3 })
    expect(state.step).toBe(1)
    expect(sessionReducer(uploadedState(), { type: 'STEP_CHANGED', step: 2 }).step).toBe(2)
  })

  it('nova síntese invalida sinais e simulação', () => {
    let state = synthesizedState({ selectedSignals: ['top.clk'] })
    state = sessionReducer(state, { type: 'SIMULATION_SUCCEEDED', result: simulationOk })
    expect(state.timelineCursor).toBe(0)
    state = sessionReducer(state, { type: 'SYNTHESIS_STARTED' })
    expect(state.selectedSignals).toEqual([])
    expect(state.simulation.status).toBe('idle')
    expect(state.timelineCursor).toBeNull()
  })

  it('ações sobre o run são ignoradas sem sessão', () => {
    expect(sessionReducer(initialSessionState, { type: 'SYNTHESIS_STARTED' })).toBe(initialSessionState)
  })

  it('SESSION_CLEARED limpa todo o estado', () => {
    const state = sessionReducer(
      synthesizedState({ selectedSignals: ['top.clk'], step: 3, timelineCursor: 5 }),
      { type: 'SESSION_CLEARED' },
    )
    expect(state).toEqual(initialSessionState)
  })
})
