import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SimLog } from '../../../api/types'
import { listSignals } from '../signals'
import { cpuLog } from '../testData'
import { createCanvasRenderer } from './canvasRenderer'
import { buildRow, buildWaveformModel, type WaveformModel } from './model'
import type { WaveformRenderer } from './renderer'
import { fitWindow, gridTicks, LAYOUT, segmentSpans, timestampMarks, timeToX, visibleTransitions, zoomWindow, type WaveformViewport } from './viewport'
import { Waveform } from './Waveform'

const signals = listSignals(cpuLog)
const byName = (name: string) => signals.find((s) => s.name === name)!

function vp(start: number, end: number, width = LAYOUT.labelWidth + 400): WaveformViewport {
  return { start, end, width, height: 100, pixelRatio: 1 }
}

describe('modelo do waveform (#33)', () => {
  it('escalar: segmentos por mudança real e transições nos timestamps', () => {
    const row = buildRow(cpuLog, byName('rst'))
    expect(row.kind).toBe('scalar')
    expect(row.segments.map((s) => [s.start, s.end, s.state])).toEqual([
      [0, 20, '1'],
      [20, 40, '0'],
      [40, 40, 'z'],
    ])
    expect(row.transitions).toEqual([20, 40])
  })

  it('barramento: hexadecimal, X inicial e valores iguais após extensão não geram transição', () => {
    const log: SimLog = {
      ...cpuLog,
      timeline: { ...cpuLog.timeline, '15': { 'tb.uut.data[7:0]': '00001010' } },
    }
    const row = buildRow(log, listSignals(log).find((s) => s.name === 'data')!)
    expect(row.kind).toBe('bus')
    expect(row.segments.map((s) => [s.start, s.text, s.state])).toEqual([
      [0, '0xXX', 'x'],
      [10, '0x0A', 'bus'],
      [30, '0xFF', 'bus'],
    ])
    expect(row.transitions).toEqual([10, 30])
  })

  it('respeita begintime/endtime: valor anterior ao início vira valor inicial, fora do fim é ignorado', () => {
    const log: SimLog = { ...cpuLog, metadata: { timescale: '1ns', begintime: 15, endtime: 30 } }
    const row = buildRow(log, listSignals(log).find((s) => s.name === 'clk')!)
    expect(row.segments.map((s) => [s.start, s.end, s.text])).toEqual([
      [15, 20, '1'],
      [20, 30, '0'],
      [30, 30, '1'],
    ])
  })

  it('sinal sem amostra e timeline vazia não quebram o modelo', () => {
    expect(buildRow(cpuLog, byName('nosamp')).segments).toEqual([{ start: 0, end: 40, value: null, text: '—', state: 'none' }])
    const empty: SimLog = { metadata: { timescale: '1ns', begintime: 0, endtime: 0 }, modules: {}, timeline: {} }
    const model = buildWaveformModel(empty, [], null, 10)
    expect(model.rows).toEqual([])
    expect(model.timestamps).toEqual([])
    expect(fitWindow(model)).toEqual({ start: 0, end: 1 })
  })

  it('limita sinais desenhados e sinaliza truncagem do backend', () => {
    const log: SimLog = { ...cpuLog, metadata: { ...cpuLog.metadata, truncated: true, truncation_reason: 'max_timestamps', total_timestamps: 812340 } }
    const model = buildWaveformModel(log, listSignals(log), 10, 2)
    expect(model.rows).toHaveLength(2)
    expect(model.omittedRows).toBe(3)
    expect(model.truncation).toEqual({ reason: 'max_timestamps', totalTimestamps: 812340 })
  })
})

describe('viewport e geometria (#33)', () => {
  const model = buildWaveformModel(cpuLog, signals, 20, 64)

  it('zoom/ajuste só produzem janelas; o modelo e o log não mudam', () => {
    const before = structuredClone(cpuLog)
    expect(fitWindow(model)).toEqual({ start: 0, end: 40 })
    expect(zoomWindow(model, 1, 20)).toEqual({ start: 10, end: 30 })
    expect(zoomWindow(model, 2, 0)).toEqual({ start: 0, end: 10 })
    expect(zoomWindow(model, 2, 40)).toEqual({ start: 30, end: 40 })
    expect(cpuLog).toEqual(before)
  })

  it('grade, marcas de timestamps e transições estão em tempos reais', () => {
    expect(gridTicks(vp(0, 40))).toEqual([0, 10, 20, 30, 40])
    expect(timestampMarks(model.timestamps, vp(5, 35))).toEqual([10, 20, 30])
    expect(visibleTransitions(buildRow(cpuLog, byName('clk')), vp(5, 35))).toEqual([10, 20, 30])
    expect(timeToX(20, vp(0, 40))).toBe(LAYOUT.labelWidth + 200)
  })

  it('agrega segmentos menores que 1px sem percorrer todas as transições', () => {
    const timeline: SimLog['timeline'] = {}
    for (let t = 0; t <= 100_000; t++) timeline[String(t)] = { s: t % 2 ? '1' : '0' }
    const log: SimLog = { metadata: { timescale: '1ns', begintime: 0, endtime: 100_000 }, modules: {}, timeline }
    const row = buildRow(log, listSignals(log)[0])
    const spans = segmentSpans(row, vp(0, 100_000))
    expect(spans.length).toBeLessThanOrEqual(410)
    expect(spans.some((s) => s.dense)).toBe(true)
    expect(segmentSpans(row, vp(10, 12)).map((s) => s.segment.start)).toEqual([10, 11, 12])
  })
})

function fakeRenderer() {
  const calls: Array<{ model: WaveformModel; viewport: WaveformViewport }> = []
  const destroy = vi.fn()
  const factory = vi.fn((): WaveformRenderer => ({ draw: (model, viewport) => calls.push({ model, viewport }), destroy }))
  return { calls, factory, destroy }
}

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  })
}

describe('<Waveform> (#33)', () => {
  it('desenha via renderer substituível; zoom e ajuste mudam só o viewport', async () => {
    const { calls, factory, destroy } = fakeRenderer()
    const model = buildWaveformModel(cpuLog, signals.slice(0, 2), 20, 64)
    const { unmount } = render(<Waveform model={model} rendererFactory={factory} />)
    await flushFrames()

    expect(factory).toHaveBeenCalledTimes(1)
    expect(calls.at(-1)!.model).toBe(model)
    expect(calls.at(-1)!.viewport).toMatchObject({ start: 0, end: 40 })
    expect(screen.getByRole('img')).toHaveAccessibleName(/2 sinais, de 0 ns a 40 ns, cursor em 20 ns/)

    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '1' } })
    await flushFrames()
    expect(calls.at(-1)!.model).toBe(model)
    expect(calls.at(-1)!.viewport).toMatchObject({ start: 10, end: 30 })

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar' }))
    await flushFrames()
    expect(calls.at(-1)!.viewport).toMatchObject({ start: 0, end: 40 })

    unmount()
    expect(destroy).toHaveBeenCalled()
  })

  it('clique no gráfico pede o tempo correspondente', async () => {
    const { factory } = fakeRenderer()
    const onSeekTime = vi.fn()
    render(<Waveform model={buildWaveformModel(cpuLog, signals.slice(0, 1), 0, 64)} rendererFactory={factory} onSeekTime={onSeekTime} />)
    fireEvent.click(screen.getByRole('img'), { clientX: LAYOUT.labelWidth + 254 })
    expect(onSeekTime).toHaveBeenCalledTimes(1)
    expect(onSeekTime.mock.calls[0][0]).toBeCloseTo(20, 0)
  })

  it('avisa truncagem e sinais omitidos; sem sinais mostra estado vazio', () => {
    const { factory } = fakeRenderer()
    const log: SimLog = { ...cpuLog, metadata: { ...cpuLog.metadata, truncated: true, truncation_reason: 'max_timestamps', total_timestamps: 900 } }
    const { rerender } = render(<Waveform model={buildWaveformModel(log, listSignals(log), 0, 2)} rendererFactory={factory} />)
    expect(screen.getByText(/truncada pelo servidor.*max_timestamps.*900 timestamps no total, 5 recebidos/)).toBeInTheDocument()
    expect(screen.getByText(/Exibindo 2 de 5 sinais marcados/)).toBeInTheDocument()

    rerender(<Waveform model={buildWaveformModel(cpuLog, [], 0, 2)} rendererFactory={factory} />)
    expect(screen.getByText(/Nenhum sinal visível/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('renderer Canvas', () => {
  it('desenha grade, séries, hex de barramento e cursor num contexto 2D', () => {
    const texts: string[] = []
    const ctx = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'measureText') return (s: string) => ({ width: s.length * 6 })
          if (prop === 'fillText') return (s: string) => texts.push(s)
          return () => {}
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(ctx)
    const renderer = createCanvasRenderer(canvas)
    renderer.draw(buildWaveformModel(cpuLog, signals, 10, 64), vp(0, 40, 800))
    expect(texts).toEqual(expect.arrayContaining(['0 ns', '40 ns', '0x0A', 'clk = 1', 'data = 0x0A']))
    expect(canvas.width).toBe(800)
    renderer.destroy()
  })
})
