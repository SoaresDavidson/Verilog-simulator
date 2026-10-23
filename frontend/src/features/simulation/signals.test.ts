import { describe, expect, it } from 'vitest'
import type { SimLog } from '../../api/types'
import { defaultVisibleIds, extendValue, formatValue, listScopes, listSignals, logicState, selectionMatcher } from './signals'
import { cpuLog } from './testData'

describe('listSignals (#31)', () => {
  it('deriva sinais da hierarquia de modules com largura, tipo, caminho e referência', () => {
    const signals = listSignals(cpuLog)
    expect(signals.map((s) => s.id)).toEqual(['tb.clk', 'tb.rst', 'tb.uut.clk', 'tb.uut.data[7:0]', 'tb.uut.nosamp'])
    const data = signals.find((s) => s.name === 'data')!
    expect(data).toMatchObject({ ref: 'tb.uut.data[7:0]', scope: 'tb.uut', path: 'tb.uut.data', width: 8, varType: 'wire', depth: 1, hasSamples: true })
    expect(signals.find((s) => s.name === 'nosamp')!.hasSamples).toBe(false)
    expect(listScopes(signals)).toEqual(['tb', 'tb.uut'])
  })

  it('aceita child_scopes relativos, size em string e referências só na timeline', () => {
    const log: SimLog = {
      metadata: { timescale: '1ns', begintime: 0, endtime: 1 },
      modules: {
        top: { name: 'top', variables: {}, child_scopes: ['core'] },
        'top.core': { name: 'core', variables: { 'pc[3:0]': { size: '4' as unknown as number, var_type: 'reg', references: ['x.pc'] } }, child_scopes: [] },
      },
      timeline: { '0': { 'x.pc': '0011', 'top.extra': '1' } },
    }
    const signals = listSignals(log)
    expect(signals.map((s) => [s.id, s.ref, s.width, s.depth])).toEqual([
      ['top.core.pc[3:0]', 'x.pc', 4, 1],
      ['top.extra', 'top.extra', 1, 0],
    ])
  })
})

describe('selectionMatcher (#31) — seleção da tela 2', () => {
  const signals = listSignals(cpuLog)
  const ids = (selected: string[]) => signals.filter(selectionMatcher(selected, signals)).map((s) => s.id)

  it('casa pelo nome base (sem faixa de bits nem escape)', () => {
    expect(ids(['clk'])).toEqual(['tb.clk', 'tb.uut.clk'])
    expect(ids(['\\data[7:0]'])).toEqual(['tb.uut.data[7:0]'])
  })

  it('caminho casa como sufixo; se nenhum sinal casar, cai no nome base', () => {
    expect(ids(['uut.clk'])).toEqual(['tb.uut.clk'])
    expect(ids(['cpu/clk'])).toEqual(['tb.clk', 'tb.uut.clk'])
    expect(ids([])).toEqual([])
  })

  it('visibilidade padrão: seleção da tela 2, senão primeiros sinais com amostra', () => {
    expect([...defaultVisibleIds(signals, ['rst'])]).toEqual(['tb.rst'])
    expect([...defaultVisibleIds(signals, ['nada'])]).toEqual(['tb.clk', 'tb.rst', 'tb.uut.clk', 'tb.uut.data[7:0]'])
  })
})

describe('formatação de valores', () => {
  it('estados 0/1/X/Z para escalares e barramento', () => {
    expect(logicState('0', 1)).toBe('0')
    expect(logicState('z', 1)).toBe('z')
    expect(logicState('1010', 8)).toBe('bus')
    expect(logicState('x', 8)).toBe('x')
    expect(logicState('zzzz', 4)).toBe('z')
    expect(logicState(null, 1)).toBe('none')
    expect(logicState('1.5', 64, 'real')).toBe('real')
  })

  it('barramento em hexadecimal com extensão do VCD e nibbles X/Z', () => {
    expect(extendValue('1010', 8)).toBe('00001010')
    expect(extendValue('x1', 4)).toBe('xxx1')
    expect(formatValue('1010', 8)).toBe('0x0A')
    expect(formatValue('11111111', 8)).toBe('0xFF')
    expect(formatValue('x', 8)).toBe('0xXX')
    expect(formatValue('zzzz0001', 8)).toBe('0xZ1')
    expect(formatValue('101', 3)).toBe('0x5')
    expect(formatValue('1', 1)).toBe('1')
    expect(formatValue('x', 1)).toBe('X')
    expect(formatValue(null, 8)).toBe('—')
  })
})
