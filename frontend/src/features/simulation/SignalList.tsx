import { useId, useMemo, useState } from 'react'
import { MAX_LIST_ROWS } from './limits'
import type { SimIndex } from './simlog'
import { trackValueAt } from './simlog'
import { formatValue, listScopes, logicState, selectionMatcher, type LogicState, type SignalInfo } from './signals'


export interface SignalListProps {
  signals: readonly SignalInfo[]
  sim: SimIndex
  /** Timestamp real em vigor. */
  time: number | null
  visibleIds: ReadonlySet<string>
  onToggle: (id: string) => void
  /** Sinais escolhidos na tela 2 (`state.selectedSignals`). */
  selectedSignals: readonly string[]
}

const STATE_CLASS: Partial<Record<LogicState, string>> = { '0': 's0', '1': 's1', x: 'sx', z: 'sz' }

function ValueBadge({ signal, value }: { signal: SignalInfo; value: string | null }) {
  if (!signal.hasSamples) return <span className="sim-sig__nosample">sem amostra</span>
  const state = logicState(value, signal.width, signal.varType)
  const text = formatValue(value, signal.width, signal.varType)
  const cls = STATE_CLASS[state]
  return (
    <span className={cls ? `b0 ${cls}` : 'sim-sig__val'} data-state={state} title={value === null ? 'Sem amostra até este instante' : `Valor bruto: ${value}`}>
      {text}
    </span>
  )
}

/** Lista de sinais (#31): hierarquia, filtros e visibilidade sincronizada com o waveform. */
export function SignalList({ signals, sim, time, visibleIds, onToggle, selectedSignals }: SignalListProps) {
  const moduleId = useId()
  const nameId = useId()
  const [scope, setScope] = useState('')
  const [query, setQuery] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)

  const scopes = useMemo(() => listScopes(signals), [signals])
  const isSelected = useMemo(() => selectionMatcher(selectedSignals, signals), [selectedSignals, signals])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return signals.filter(
      (s) =>
        (!scope || s.scope === scope || s.scope.startsWith(`${scope}.`)) &&
        (!q || s.path.toLowerCase().includes(q)) &&
        (!onlySelected || isSelected(s)),
    )
  }, [signals, scope, query, onlySelected, isSelected])
  const rows = filtered.slice(0, MAX_LIST_ROWS)

  return (
    <div className="card sim-sigs">
      <div className="ch">
        <h2 className="sim-h">Sinais</h2>
        <span className="muted sim-sigs__count" aria-live="polite">
          {filtered.length} de {signals.length}
        </span>
      </div>
      <div className="sim-sigs__filters">
        <label htmlFor={moduleId}>Módulo</label>
        <select id={moduleId} value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">Todos</option>
          {scopes.map((s) => (
            <option key={s} value={s}>
              {s || '(sem escopo)'}
            </option>
          ))}
        </select>
        <label htmlFor={nameId}>Nome</label>
        <input id={nameId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por nome" />
        <label className="sim-sigs__only">
          <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />
          Somente sinais escolhidos na Seleção
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="muted sim-sigs__empty">Nenhum sinal corresponde aos filtros.</p>
      ) : (
        <ul className="sim-sigs__list" aria-label="Sinais da simulação">
          {rows.map((signal) => {
            const value = time === null ? null : trackValueAt(sim.tracks.get(signal.ref), time)
            const visible = visibleIds.has(signal.id)
            return (
              <li key={signal.id} className={`sim-sig${visible ? ' sel' : ''}`} data-signal={signal.id}>
                <label className="sim-sig__main">
                  <input type="checkbox" checked={visible} onChange={() => onToggle(signal.id)} aria-label={`Exibir ${signal.path}`} />
                  <span className="sim-sig__name">{signal.name}</span>
                  {isSelected(signal) && (
                    <span className="sim-sig__mark" title="Escolhido na Seleção">
                      ★<span className="sr-only"> escolhido na Seleção</span>
                    </span>
                  )}
                </label>
                <ValueBadge signal={signal} value={value} />
                <span className="sim-sig__meta">
                  <span className="sim-sig__path">{signal.path}</span>
                  <span>
                    {signal.width} {signal.width === 1 ? 'bit' : 'bits'}
                    {signal.varType && ` · ${signal.varType}`}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {filtered.length > rows.length && (
        <p className="muted sim-sigs__more">
          Mostrando {rows.length} de {filtered.length}. Refine os filtros para ver os demais.
        </p>
      )}
      <div className="lg" aria-label="Legenda de estados">
        <span className="b0 s0">0</span>
        <span className="b0 s1">1</span>
        <span className="b0 sx">X</span>
        <span className="b0 sz">Z</span>
      </div>
    </div>
  )
}
