/**
 * Índice e consultas sobre o `simulation_log` (puro, sem React).
 *
 * O backend envia `timeline[timestamp][referência] = valor` só com as
 * MUDANÇAS de cada instante. Aqui o log é indexado uma vez (cache por objeto)
 * em trilhas ordenadas por referência; o valor de um sinal num instante é o
 * da última amostra com tempo `<=` instante. Nada é interpolado nem inventado:
 * o playback anda apenas pelos timestamps presentes na timeline.
 */
import type { SimLog, SimLogMetadata, SignalValue } from '../../api/types'

/** Mudanças de um sinal, ordenadas por tempo. */
export interface SignalTrack {
  times: number[]
  values: SignalValue[]
}

export interface Timescale {
  /** Multiplicador da unidade (ex.: `10` em `10ps`). */
  magnitude: number
  /** Unidade (`s`, `ms`, `us`, `ns`, `ps`, `fs`) ou `''` se desconhecida. */
  unit: string
}

export interface SimIndex {
  /** Timestamps existentes dentro de `[begin, end]`, ordenados e únicos. */
  timestamps: number[]
  /** Trilha por referência de sinal (chave da timeline). */
  tracks: Map<string, SignalTrack>
  begin: number
  end: number
  timescale: Timescale
  /** `true` quando há ao menos um timestamp: só então o playback é habilitado. */
  usable: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

const TIMESCALE_PATTERN = /^\s*(\d+(?:\.\d+)?)?\s*(s|ms|us|µs|ns|ps|fs)\s*$/i

/** Aceita `"1ns"`, `"10 ps"` ou o objeto do vcdvcd (`{magnitude, unit, ...}`). */
export function parseTimescale(raw: SimLogMetadata['timescale'] | undefined): Timescale {
  if (typeof raw === 'string') {
    const match = TIMESCALE_PATTERN.exec(raw)
    if (match) return { magnitude: match[1] ? Number(match[1]) : 1, unit: match[2].toLowerCase().replace('µ', 'u') }
    return { magnitude: 1, unit: '' }
  }
  if (isRecord(raw)) {
    const magnitude = finiteNumber(raw.magnitude) ?? 1
    const unit = typeof raw.unit === 'string' ? raw.unit.toLowerCase() : ''
    return { magnitude, unit }
  }
  return { magnitude: 1, unit: '' }
}

/** Formata um timestamp da timeline na unidade do timescale (ex.: `20 ns`). */
export function formatTime(time: number, timescale: Timescale): string {
  const value = Number((time * timescale.magnitude).toPrecision(12))
  const text = value.toLocaleString('pt-BR', { maximumFractionDigits: 6 })
  return timescale.unit ? `${text} ${timescale.unit}` : text
}

const cache = new WeakMap<SimLog, SimIndex>()

function buildIndex(log: SimLog): SimIndex {
  const timeline = isRecord(log.timeline) ? log.timeline : {}
  const entries: Array<[number, Record<string, unknown>]> = []
  for (const [key, changes] of Object.entries(timeline)) {
    const time = finiteNumber(key)
    if (time !== null && isRecord(changes)) entries.push([time, changes])
  }
  entries.sort((a, b) => a[0] - b[0])

  const tracks = new Map<string, SignalTrack>()
  const all: number[] = []
  for (const [time, changes] of entries) {
    if (all[all.length - 1] !== time) all.push(time)
    for (const [ref, value] of Object.entries(changes)) {
      if (typeof value !== 'string') continue
      let track = tracks.get(ref)
      if (!track) {
        track = { times: [], values: [] }
        tracks.set(ref, track)
      }
      track.times.push(time)
      track.values.push(value)
    }
  }

  const metadata: Partial<SimLogMetadata> = isRecord(log.metadata) ? log.metadata : {}
  const first = all[0] ?? 0
  const last = all[all.length - 1] ?? 0
  const begin = finiteNumber(metadata.begintime) ?? first
  const endRaw = finiteNumber(metadata.endtime)
  const end = Math.max(endRaw ?? last, begin)
  const inRange = all.filter((t) => t >= begin && t <= end)
  // Metadata inconsistente com a timeline: prefere os timestamps reais.
  const timestamps = inRange.length > 0 ? inRange : all

  return {
    timestamps,
    tracks,
    begin: inRange.length > 0 ? begin : first,
    end: inRange.length > 0 ? end : Math.max(last, first),
    timescale: parseTimescale(metadata.timescale),
    usable: timestamps.length > 0,
  }
}

/** Índice do log (memoizado por identidade do objeto). */
export function indexSimLog(log: SimLog): SimIndex {
  let index = cache.get(log)
  if (!index) {
    index = buildIndex(log)
    cache.set(log, index)
  }
  return index
}

/** Log presente e com pelo menos um timestamp válido. */
export function isUsableSimLog(log: SimLog | null | undefined): log is SimLog {
  return log != null && isRecord(log) && indexSimLog(log).usable
}

/** Maior índice `i` com `sorted[i] <= value`, ou `-1`. */
export function floorIndex(sorted: readonly number[], value: number): number {
  let lo = 0
  let hi = sorted.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= value) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** Valor da trilha no instante (última amostra `<=` instante) ou `null` se ainda não há amostra. */
export function trackValueAt(track: SignalTrack | undefined, time: number): SignalValue | null {
  if (!track) return null
  const i = floorIndex(track.times, time)
  return i < 0 ? null : track.values[i]
}

/** Valor de uma referência no instante `cursor`, ou `null` (sem amostra até ali). */
export function valueAt(log: SimLog, ref: string, cursor: number): SignalValue | null {
  return trackValueAt(indexSimLog(log).tracks.get(ref), cursor)
}

/**
 * Valores de todos os sinais no instante `cursor` (última amostra `<=`
 * cursor). Referências sem amostra até o cursor ficam de fora.
 * Pensado para o diagrama ao vivo (#32).
 */
export function valuesAt(log: SimLog, cursor: number): Map<string, SignalValue> {
  const out = new Map<string, SignalValue>()
  for (const [ref, track] of indexSimLog(log).tracks) {
    const value = trackValueAt(track, cursor)
    if (value !== null) out.set(ref, value)
  }
  return out
}

/** Timestamp real em vigor para um cursor (o maior `<=` cursor; o primeiro se antes do início). */
export function snapCursor(index: SimIndex, cursor: number | null): number | null {
  if (!index.usable) return null
  if (cursor === null) return index.timestamps[0]
  const i = floorIndex(index.timestamps, cursor)
  return index.timestamps[Math.max(0, i)]
}
