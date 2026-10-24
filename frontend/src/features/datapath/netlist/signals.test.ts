import { describe, expect, it } from 'vitest'
import { parseNetlist } from './parse'
import {
  bitValues,
  edgeValue,
  findNetByRef,
  formatValue,
  logicStateOf,
  normalizeValue,
  resolveSignalRefs,
  resolveValues,
  valuesAt,
} from './signals'
import { hierNetlist } from '../test/netlists'

const g = parseNetlist(hierNetlist)!

describe('referências de sinal', () => {
  it('casa ref exata, caminho de instância do VCD e faixa [msb:lsb]', () => {
    expect(findNetByRef(g, 'cpu.clk')!.id).toBe('net:clk')
    expect(findNetByRef(g, 'tb.dut.alu_out')!.id).toBe('net:alu_out')
    expect(findNetByRef(g, 'tb.dut.y [7:0]')!.id).toBe('net:y')
    expect(findNetByRef(g, 'tb.nada')).toBeNull()
    expect([...resolveSignalRefs(g, ['cpu.clk', 'x.y', 'zzz'])].sort()).toEqual(['net:clk', 'net:y'])
  })

  it('valor exato vence casamento só por nome', () => {
    const v = resolveValues(g, { 'cpu.a': '00000001', 'tb.a': '11111111' })
    expect(v.get('net:a')).toBe('00000001')
  })
})

describe('valores', () => {
  it('aplica valores por bit e extrai o valor de cada aresta', () => {
    const nv = resolveValues(g, { 'cpu.alu_out': '00000101', 'cpu.clk': '1' })
    const bits = bitValues(g, nv)
    const e = g.edges.find((x) => x.net === 'net:alu_out')!
    expect(edgeValue(e, bits)).toBe('00000101')
    const clk = g.edges.find((x) => x.net === 'net:clk')!
    expect(edgeValue(clk, bits)).toBe('1')
    const y = g.edges.find((x) => x.net === 'net:y')!
    expect(edgeValue(y, bits)).toBeUndefined()
  })

  it('normaliza e classifica estados 0/1/X/Z', () => {
    expect(normalizeValue('101', 8)).toBe('00000101')
    expect(normalizeValue('x1', 4)).toBe('xxx1')
    expect(normalizeValue('b11', 1)).toBe('1')
    expect(logicStateOf('0000')).toBe('0')
    expect(logicStateOf('0100')).toBe('1')
    expect(logicStateOf('01x0')).toBe('x')
    expect(logicStateOf('zzzz')).toBe('z')
    expect(logicStateOf('0z')).toBe('x')
    expect(formatValue('1')).toBe('1')
    expect(formatValue('00101111')).toBe('0x2F')
    expect(formatValue('0x01')).toBe("4'b0x01")
  })

  it('valuesAt usa o último valor até o instante (timeline esparsa)', () => {
    const tl = { '0': { 'top.clk': '0', 'top.q': '0' }, '5': { 'top.clk': '1' }, '10': { 'top.clk': '0', 'top.q': '1' } }
    expect(valuesAt(tl, 7)).toEqual({ 'top.clk': '1', 'top.q': '0' })
    expect(valuesAt(tl, 10)).toEqual({ 'top.clk': '0', 'top.q': '1' })
    expect(valuesAt(tl, null)).toEqual({})
    expect(valuesAt(null, 3)).toEqual({})
  })
})
