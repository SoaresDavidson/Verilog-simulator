import { useId, useMemo, useState } from 'react'
import { useSession } from '../../state/hooks'
import { isTopConfirmed } from './advance'
import { filterSignals, signalOptions, widthLabel, type SignalDirection } from './netlist'

/** Itens renderizados por página (listas longas usam "Mostrar mais"). */
export const SIGNAL_PAGE_SIZE = 200

const DIRECTION_LABEL: Record<SignalDirection, string> = {
  input: 'entrada',
  output: 'saída',
  inout: 'bidirecional',
  internal: 'interno',
}

/**
 * Tela 2d (#29) — checklist de portas e fios da netlist. A seleção vive no
 * estado global (`SIGNALS_SELECTED`) e alimenta diagrama, lista e waveform.
 */
export function SignalSelector() {
  const headingId = useId()
  const searchId = useId()
  const warnId = useId()
  const { state, dispatch } = useSession()
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(SIGNAL_PAGE_SIZE)

  const ready = isTopConfirmed(state)
  const netlist = ready ? state.synthesis.result?.netlist_content ?? null : null
  const top = state.topModule
  const options = useMemo(() => (netlist && top ? signalOptions(netlist, top) : []), [netlist, top])
  const filtered = useMemo(() => filterSignals(options, query), [options, query])
  const selected = useMemo(() => new Set(state.selectedSignals), [state.selectedSignals])
  const selectedCount = useMemo(() => options.filter((o) => selected.has(o.ref)).length, [options, selected])

  if (!ready) {
    return (
      <section className="card syn-sig" aria-labelledby={headingId}>
        <div className="ch">
          <h2 id={headingId}>Fios para visualizar</h2>
        </div>
        <p className="muted syn-note">Conclua a síntese para escolher os sinais.</p>
      </section>
    )
  }

  /** Persiste mantendo a ordem da netlist. */
  const commit = (next: Set<string>) => {
    dispatch({ type: 'SIGNALS_SELECTED', signals: options.filter((o) => next.has(o.ref)).map((o) => o.ref) })
  }
  const toggle = (ref: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(ref)
    else next.delete(ref)
    commit(next)
  }
  const selectAll = () => commit(new Set([...selected, ...filtered.map((o) => o.ref)]))
  const clear = () => {
    const next = new Set(selected)
    for (const option of filtered) next.delete(option.ref)
    commit(next)
  }

  const searching = query.trim() !== ''
  const visible = filtered.slice(0, limit)
  const remaining = filtered.length - visible.length

  return (
    <section className="card syn-sig" aria-labelledby={headingId}>
      <div className="ch">
        <h2 id={headingId}>Fios para visualizar</h2>
        <span role="status" className="muted syn-sig__count">
          {selectedCount} de {options.length} selecionado{selectedCount === 1 ? '' : 's'}
        </span>
      </div>

      {options.length === 0 ? (
        <p role="alert" className="state-error">
          A netlist não tem portas nem fios visíveis no módulo top. Verifique o projeto e sintetize novamente.
        </p>
      ) : (
        <>
          <div className="syn-sig__tools">
            <label htmlFor={searchId} className="sr-only">
              Buscar sinal
            </label>
            <input
              id={searchId}
              type="search"
              className="syn-sig__search"
              placeholder="Buscar por nome…"
              value={query}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.target.value)
                setLimit(SIGNAL_PAGE_SIZE)
              }}
            />
            <button type="button" className="btn bs bsm" onClick={selectAll} disabled={filtered.length === 0}>
              Selecionar todos
            </button>
            <button type="button" className="btn bs bsm" onClick={clear} disabled={selectedCount === 0}>
              Limpar
            </button>
          </div>
          {searching && (
            <p className="muted syn-note" aria-live="polite">
              {filtered.length} resultado{filtered.length === 1 ? '' : 's'}; “Selecionar todos” e “Limpar” valem para a busca.
            </p>
          )}

          <fieldset className="syn-sig__fieldset" aria-describedby={selectedCount === 0 ? warnId : undefined}>
            <legend className="sr-only">Sinais da netlist</legend>
            {filtered.length === 0 ? (
              <p className="muted syn-note">Nenhum sinal corresponde à busca.</p>
            ) : (
              <ul className="syn-sig__list">
                {visible.map((option) => (
                  <li key={option.ref} className="syn-sig__item">
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(option.ref)}
                        onChange={(event) => toggle(option.ref, event.target.checked)}
                      />
                      <span className="syn-sig__ref">{option.ref}</span>
                      <span className="syn-sig__meta">
                        {widthLabel(option.width)} · {DIRECTION_LABEL[option.direction]}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          {remaining > 0 && (
            <button
              type="button"
              className="btn bg bsm syn-sig__more"
              onClick={() => setLimit((current) => current + SIGNAL_PAGE_SIZE)}
            >
              Mostrar mais ({remaining} restante{remaining === 1 ? '' : 's'})
            </button>
          )}
          {selectedCount === 0 && (
            <p id={warnId} className="syn-sig__warn">
              Selecione pelo menos 1 sinal para continuar.
            </p>
          )}
        </>
      )}
    </section>
  )
}
