import { useId, useMemo } from 'react'
import { useSessionState } from '../../state/hooks'
import { isSynthesisConfirmed } from '../../state/session'
import { moduleCandidates, selectableTops } from './netlist'
import type { UseSynthesis } from './useSynthesis'

/**
 * Tela 2b (#27) — módulo top. Por padrão o top é o que o backend devolveu
 * (`hierarchy -auto-top`). O usuário pode escolher outro módulo da netlist;
 * a escolha dispara nova síntese com `hierarchy -top` e o top exibido continua
 * sendo o confirmado pelo backend.
 */
export function TopModulePanel({ synthesis }: { synthesis: UseSynthesis }) {
  const headingId = useId()
  const groupName = useId()
  const state = useSessionState()
  const confirmed = isSynthesisConfirmed(state)
  const netlist = confirmed ? (state.synthesis.result?.netlist_content ?? null) : null
  const candidates = useMemo(() => selectableTops(state.topCandidates, netlist), [state.topCandidates, netlist])
  const top = state.topModule
  const topValid = netlist !== null && top !== null && moduleCandidates(netlist).includes(top)
  const automatic = state.topRequest === null

  let body
  if (state.synthesis.status === 'running') {
    body = <p className="muted syn-note">Aguardando a síntese…</p>
  } else if (candidates.length === 0) {
    body = netlist ? (
      <p role="alert" className="state-error">
        A netlist recebida não contém módulos candidatos a top.
      </p>
    ) : (
      <p className="muted syn-note">
        {state.synthesis.status === 'error'
          ? 'Netlist indisponível: a síntese não foi concluída.'
          : 'Execute a síntese para listar os módulos encontrados.'}
      </p>
    )
  } else if (netlist && !topValid) {
    body = (
      <p role="alert" className="state-error">
        Módulo top inválido ou ausente na netlist. Sintetize novamente.
      </p>
    )
  } else {
    body = (
      <>
        <ul className="syn-modules" aria-label="Módulos encontrados na netlist">
          {candidates.map((name) => {
            const isTop = topValid && name === top
            return (
              <li key={name} aria-current={isTop ? 'true' : undefined} data-top={isTop || undefined}>
                <label>
                  <input
                    type="radio"
                    name={groupName}
                    value={name}
                    checked={isTop}
                    disabled={!synthesis.canStart}
                    onChange={() => void synthesis.start(name)}
                  />
                  <span className="nm">{name}</span>
                </label>
                {isTop && <span className="syn-tag syn-tag--top">top</span>}
              </li>
            )
          })}
        </ul>
        {!netlist && <p className="muted syn-note">Netlist indisponível: a síntese não foi concluída.</p>}
        <p className="muted syn-note">
          {automatic ? (
            <>
              Top definido pela síntese (<code>hierarchy -auto-top</code>).
            </>
          ) : (
            <>
              Top escolhido por você (<code>hierarchy -top {state.topRequest}</code>).
            </>
          )}{' '}
          Escolher outro módulo sintetiza de novo a partir dele; módulos fora da hierarquia dele saem do diagrama.
        </p>
        {!automatic && (
          <button
            type="button"
            className="btn bs bsm syn-top__auto"
            disabled={!synthesis.canStart}
            onClick={() => void synthesis.start(null)}
          >
            Usar top automático
          </button>
        )}
      </>
    )
  }

  return (
    <section className="card syn-top" aria-labelledby={headingId}>
      <div className="ch">
        <h2 id={headingId}>Módulo Top</h2>
        {candidates.length > 0 && (
          <span className="muted syn-meta">
            {candidates.length} módulo{candidates.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {body}
    </section>
  )
}
