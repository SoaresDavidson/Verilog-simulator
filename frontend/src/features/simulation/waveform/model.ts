/**
 * Modelo do waveform (#33): séries por sinal derivadas da timeline, sem
 * depender de renderer. O modelo é somente leitura; zoom/ajuste mexem só no
 * viewport.
 */
import type { SimLog } from '../../../api/types'
import { indexSimLog, trackValueAt, type Timescale } from '../simlog'
import { extendValue, formatValue, logicState, type LogicState, type SignalInfo } from '../signals'

export interface WaveSegment {
  /** Início (timestamp real). */
  start: number
  /** Fim exclusivo (próxima mudança ou `end`). */
  end: number
  /** Valor bruto ou `null` antes da primeira amostra. */
  value: string | null
  /** Texto para exibição (hex em barramentos). */
  text: string
  state: LogicState
}

export interface WaveRow {
  id: string
  label: string
  path: string
  width: number
  kind: 'scalar' | 'bus'
  segments: WaveSegment[]
  /** Timestamps reais em que o valor muda (exclui o início). */
  transitions: number[]
}

export interface WaveTruncation {
  reason: string | null
  totalTimestamps: number | null
}

export interface WaveformModel {
  begin: number
  end: number
  timescale: Timescale
  /** Timestamps existentes (para ticks do eixo e snapping). */
  timestamps: readonly number[]
  rows: WaveRow[]
  /** Timestamp real do cursor, ou `null`. */
  cursor: number | null
  /** Sinais visíveis além do limite de desenho. */
  omittedRows: number
  truncation: WaveTruncation | null
}

function normalize(value: string | null, width: number): string | null {
  return value === null ? null : extendValue(value, width)
}

/** Série de um sinal em `[begin, end]`: segmentos contíguos de valor constante. */
export function buildRow(log: SimLog, signal: SignalInfo): WaveRow {
  const { tracks, begin, end } = indexSimLog(log)
  const track = tracks.get(signal.ref)
  const segment = (start: number, value: string | null): WaveSegment => ({
    start,
    end,
    value,
    text: formatValue(value, signal.width, signal.varType),
    state: logicState(value, signal.width, signal.varType),
  })

  const segments: WaveSegment[] = [segment(begin, trackValueAt(track, begin))]
  const transitions: number[] = []
  if (track) {
    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i]
      if (t <= begin) continue
      if (t > end) break
      const last = segments[segments.length - 1]
      if (normalize(track.values[i], signal.width) === normalize(last.value, signal.width)) continue
      last.end = t
      segments.push(segment(t, track.values[i]))
      transitions.push(t)
    }
  }
  return {
    id: signal.id,
    label: signal.name,
    path: signal.path,
    width: signal.width,
    kind: signal.width > 1 || signal.varType === 'real' ? 'bus' : 'scalar',
    segments,
    transitions,
  }
}

const rowCache = new WeakMap<SimLog, Map<string, WaveRow>>()

function cachedRow(log: SimLog, signal: SignalInfo): WaveRow {
  let rows = rowCache.get(log)
  if (!rows) {
    rows = new Map()
    rowCache.set(log, rows)
  }
  let row = rows.get(signal.id)
  if (!row) {
    row = buildRow(log, signal)
    rows.set(signal.id, row)
  }
  return row
}

/**
 * Monta o modelo para os sinais visíveis (em ordem), limitado a `maxRows`
 * séries desenhadas. Séries ficam em cache por log e sinal.
 */
export function buildWaveformModel(
  log: SimLog,
  visible: readonly SignalInfo[],
  cursor: number | null,
  maxRows: number,
): WaveformModel {
  const index = indexSimLog(log)
  const drawn = visible.slice(0, Math.max(0, maxRows))
  const meta = log.metadata ?? {}
  return {
    begin: index.begin,
    end: index.end,
    timescale: index.timescale,
    timestamps: index.timestamps,
    rows: drawn.map((signal) => cachedRow(log, signal)),
    cursor,
    omittedRows: visible.length - drawn.length,
    truncation: meta.truncated
      ? {
          reason: typeof meta.truncation_reason === 'string' ? meta.truncation_reason : null,
          totalTimestamps: typeof meta.total_timestamps === 'number' ? meta.total_timestamps : null,
        }
      : null,
  }
}
