import { describe, expect, it } from 'vitest'
import type { SimLog } from '../../api/types'
import { floorIndex, formatTime, indexSimLog, isUsableSimLog, parseTimescale, snapCursor, valueAt, valuesAt } from './simlog'
import { cpuLog } from './testData'
import { sanitizeToolOutput } from './toolOutput'

describe('simlog', () => {
  it('indexa timestamps reais ordenados numericamente e trilhas por referência', () => {
    const log: SimLog = {
      metadata: { timescale: '1ns', begintime: 0, endtime: 100 },
      modules: {},
      timeline: { '100': { a: '1' }, '5': { a: '0' }, '20': { b: '1' } },
    }
    const index = indexSimLog(log)
    expect(index.timestamps).toEqual([5, 20, 100])
    expect(index.tracks.get('a')).toEqual({ times: [5, 100], values: ['0', '1'] })
    expect(indexSimLog(log)).toBe(index)
  })

  it('valor no cursor é a última amostra <= cursor; sem amostra antes => null', () => {
    expect(valueAt(cpuLog, 'tb.rst', 0)).toBe('1')
    expect(valueAt(cpuLog, 'tb.rst', 19)).toBe('1')
    expect(valueAt(cpuLog, 'tb.rst', 20)).toBe('0')
    expect(valueAt(cpuLog, 'tb.uut.nosamp', 40)).toBeNull()
    const late: SimLog = { metadata: { timescale: '1ns', begintime: 0, endtime: 9 }, modules: {}, timeline: { '0': { a: '0' }, '5': { b: '1' } } }
    expect(valueAt(late, 'b', 3)).toBeNull()

    const at10 = valuesAt(cpuLog, 10)
    expect(at10.get('tb.clk')).toBe('1')
    expect(at10.get('tb.uut.data[7:0]')).toBe('1010')
    expect(at10.has('tb.uut.nosamp')).toBe(false)
  })

  it('respeita begintime/endtime do metadata', () => {
    const log: SimLog = {
      metadata: { timescale: '1ns', begintime: 10, endtime: 30 },
      modules: {},
      timeline: { '0': { a: '0' }, '10': { a: '1' }, '30': { a: '0' }, '50': { a: '1' } },
    }
    const index = indexSimLog(log)
    expect(index.timestamps).toEqual([10, 30])
    expect([index.begin, index.end]).toEqual([10, 30])
  })

  it('timeline vazia ou ausente não é utilizável', () => {
    expect(isUsableSimLog(null)).toBe(false)
    expect(isUsableSimLog({ metadata: { timescale: '1ns', begintime: 0, endtime: 0 }, modules: {}, timeline: {} })).toBe(false)
    expect(isUsableSimLog({ metadata: { timescale: '1ns', begintime: 0, endtime: 0 }, modules: {}, timeline: { abc: { a: '1' } } })).toBe(false)
    expect(isUsableSimLog(cpuLog)).toBe(true)
  })

  it('floorIndex e snapCursor só apontam para timestamps existentes', () => {
    expect(floorIndex([0, 10, 20], -1)).toBe(-1)
    expect(floorIndex([0, 10, 20], 15)).toBe(1)
    expect(floorIndex([0, 10, 20], 99)).toBe(2)
    const index = indexSimLog(cpuLog)
    expect(snapCursor(index, 25)).toBe(20)
    expect(snapCursor(index, -5)).toBe(0)
    expect(snapCursor(index, null)).toBe(0)
  })

  it('interpreta timescale em string e no formato do vcdvcd', () => {
    expect(parseTimescale('10ps')).toEqual({ magnitude: 10, unit: 'ps' })
    expect(parseTimescale({ timescale: 1e-12, magnitude: 1, unit: 'ps', factor: 1e-12 })).toEqual({ magnitude: 1, unit: 'ps' })
    expect(parseTimescale('???')).toEqual({ magnitude: 1, unit: '' })
    expect(formatTime(3, { magnitude: 10, unit: 'ps' })).toBe('30 ps')
  })
})

describe('sanitizeToolOutput', () => {
  it('remove ANSI/controle, oculta caminho do run e limita tamanho', () => {
    const raw = '\u001b[31m/verilog_code/runs/run_0123456789abcdef0123456789abcdef/src/top.v:3: erro\u001b[0m\u0007'
    expect(sanitizeToolOutput(raw).text).toBe('src/top.v:3: erro')
    const long = sanitizeToolOutput('a'.repeat(50), 10)
    expect(long).toEqual({ text: 'a'.repeat(10), truncated: true })
    expect(sanitizeToolOutput(undefined)).toEqual({ text: '', truncated: false })
  })
})
