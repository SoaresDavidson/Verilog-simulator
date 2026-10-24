import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionDispatch } from '../../state/hooks'
import { floorIndex, type SimIndex } from './simlog'

/** Intervalo base entre passos do playback em 1x. */
export const PLAYBACK_BASE_MS = 500
export const PLAYBACK_SPEEDS = [0.5, 1, 2, 5] as const
/** Quantos timestamps existentes cada passo avança. */
export const PLAYBACK_INTERVALS = [1, 5, 10] as const

export interface Playback {
  enabled: boolean
  playing: boolean
  /** Posição do cursor na lista de timestamps existentes (`-1` sem log). */
  index: number
  count: number
  /** Timestamp real em vigor, ou `null`. */
  time: number | null
  speed: number
  interval: number
  togglePlay: () => void
  pause: () => void
  prev: () => void
  next: () => void
  reset: () => void
  seek: (index: number) => void
  /** Leva o cursor ao maior timestamp existente `<=` `time`. */
  seekTime: (time: number) => void
  setSpeed: (speed: number) => void
  setInterval: (interval: number) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Controles de timeline. Alteram SOMENTE o cursor (`TIMELINE_CURSOR_SET`) e
 * estado local (play, velocidade, intervalo); nunca os dados recebidos.
 * O cursor só assume timestamps presentes em `index.timestamps`.
 */
export function usePlayback(sim: SimIndex | null, cursor: number | null): Playback {
  const dispatch = useSessionDispatch()
  const [playingRaw, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [interval, setStepInterval] = useState(1)

  const timestamps = sim?.usable ? sim.timestamps : null
  const count = timestamps?.length ?? 0
  const enabled = count > 0
  const index = timestamps ? Math.max(0, cursor === null ? 0 : floorIndex(timestamps, cursor)) : -1
  const playing = playingRaw && enabled && index < count - 1

  const seek = useCallback(
    (target: number) => {
      if (!timestamps) return
      dispatch({ type: 'TIMELINE_CURSOR_SET', timestamp: timestamps[clamp(Math.round(target), 0, timestamps.length - 1)] })
    },
    [dispatch, timestamps],
  )

  const indexRef = useRef(index)
  useEffect(() => {
    indexRef.current = index
  })

  useEffect(() => {
    if (!playing || !timestamps) return
    const timer = window.setInterval(() => {
      const nextIndex = Math.min(indexRef.current + interval, timestamps.length - 1)
      // Avança o ref já aqui: vários ticks podem ocorrer antes do próximo render.
      indexRef.current = nextIndex
      seek(nextIndex)
      if (nextIndex >= timestamps.length - 1) setPlaying(false)
    }, PLAYBACK_BASE_MS / speed)
    return () => window.clearInterval(timer)
  }, [playing, timestamps, interval, speed, seek])

  return {
    enabled,
    playing,
    index,
    count,
    time: timestamps ? timestamps[index] : null,
    speed,
    interval,
    togglePlay: () => {
      if (!enabled) return
      if (playing) {
        setPlaying(false)
        return
      }
      if (index >= count - 1) seek(0)
      setPlaying(true)
    },
    pause: () => setPlaying(false),
    prev: () => seek(index - interval),
    next: () => seek(index + interval),
    reset: () => {
      setPlaying(false)
      seek(0)
    },
    seek,
    seekTime: (time: number) => {
      if (timestamps) seek(Math.max(0, floorIndex(timestamps, time)))
    },
    setSpeed,
    setInterval: setStepInterval,
  }
}
