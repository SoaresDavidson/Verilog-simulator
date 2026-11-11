import { useId } from 'react'
import { formatTime, type Timescale } from './simlog'
import { PLAYBACK_INTERVALS, PLAYBACK_SPEEDS, type Playback } from './usePlayback'

export interface TimelineControlsProps {
  playback: Playback
  timescale: Timescale
  /** Último timestamp existente (exibição). */
  lastTime: number | null
}

/** Linha de controles da timeline (#34): play/pause, passo, reset, slider, velocidade e intervalo. */
export function TimelineControls({ playback, timescale, lastTime }: TimelineControlsProps) {
  const speedId = useId()
  const intervalId = useId()
  const disabled = !playback.enabled
  const current = playback.time === null ? '—' : formatTime(playback.time, timescale)
  const total = lastTime === null ? '—' : formatTime(lastTime, timescale)

  return (
    <div className="sim-tl" role="group" aria-label="Controles da timeline">
      <div className="sim-tl__buttons">
        <button
          type="button"
          className="btn bs bi"
          onClick={playback.togglePlay}
          disabled={disabled}
          aria-label={playback.playing ? 'Pausar' : 'Reproduzir'}
          aria-pressed={playback.playing}
          title={playback.playing ? 'Pausar' : 'Reproduzir'}
        >
          <span aria-hidden="true">{playback.playing ? '❚❚' : '▶'}</span>
        </button>
        <button type="button" className="btn bs bi" onClick={playback.prev} disabled={disabled || playback.index <= 0} aria-label="Passo anterior" title="Passo anterior">
          <span aria-hidden="true">◀◀</span>
        </button>
        <button
          type="button"
          className="btn bs bi"
          onClick={playback.next}
          disabled={disabled || playback.index >= playback.count - 1}
          aria-label="Próximo passo"
          title="Próximo passo"
        >
          <span aria-hidden="true">▶▶</span>
        </button>
        <button type="button" className="btn bs bi" onClick={playback.reset} disabled={disabled} aria-label="Reiniciar" title="Reiniciar">
          <span aria-hidden="true">↺</span>
        </button>
      </div>

      <input
        className="sim-tl__range"
        type="range"
        min={0}
        max={Math.max(0, playback.count - 1)}
        step={1}
        value={Math.max(0, playback.index)}
        onChange={(event) => playback.seek(Number(event.target.value))}
        disabled={disabled}
        aria-label="Timeline"
        aria-valuetext={current}
      />
      <output className="sim-tl__time" aria-live="off">
        {current} / {total}
      </output>

      <div className="sim-tl__opts">
        <label htmlFor={speedId}>Velocidade</label>
        <select id={speedId} value={playback.speed} onChange={(e) => playback.setSpeed(Number(e.target.value))} disabled={disabled}>
          {PLAYBACK_SPEEDS.map((s) => (
            <option key={s} value={s}>
              {String(s).replace('.', ',')}x
            </option>
          ))}
        </select>
        <label htmlFor={intervalId}>Intervalo</label>
        <select id={intervalId} value={playback.interval} onChange={(e) => playback.setInterval(Number(e.target.value))} disabled={disabled}>
          {PLAYBACK_INTERVALS.map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'amostra' : 'amostras'}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
