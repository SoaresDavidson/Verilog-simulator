import { useId, useMemo } from 'react'
import { useSessionState } from '../../state/hooks'
import { isSynthesisConfirmed } from '../../state/session'
import { moduleCandidates } from './netlist'

/**
 * Tela 2b (#27) — módulos candidatos da netlist recebida. O top é o
 * `top_module` devolvido pelo backend (`hierarchy -auto-top`); a API atual
 * não aceita seleção explícita, então o cliente não escolhe nem inventa top.
 */
export function TopModulePanel() {
  const headingId = useId()
  const state = useSessionState()
  const confirmed = isSynthesisConfirmed(state)
  const netlist = confirmed ? state.synthesis.result?.netlist_content ?? null : null
  const candidates = useMemo(() => (netlist ? moduleCandidates(netlist) : []), [netlist])
  const top = state.topModule

  let body
  if (state.synthesis.status === 'running') {
    body = <p className="muted syn-note">Aguardando a síntese…</p>
  } else if (!netlist) {
    body = (
      <p className="muted syn-note">
        {state.synthesis.status === 'error'
          ? 'Netlist indisponível: a síntese não foi concluída.'
          : 'Execute a síntese para listar os módulos encontrados.'}
      </p>
    )
  } else if (candidates.length === 0) {
    body = (
      <p role="alert" className="state-error">
        A netlist recebida não contém módulos candidatos a top.
      </p>
    )
  } else if (!top || !candidates.includes(top)) {
    body = (
      <p role="alert" className="state-error">
        Módulo top inválido ou ausente na netlist. Sintetize novamente.
      </p>
    )
  } else {
    body = (
      <>
        <ul className="syn-modules" aria-label="Módulos encontrados na netlist">
          {candidates.map((name) => (
            <li key={name} aria-current={name === top ? 'true' : undefined} data-top={name === top || undefined}>
              <span aria-hidden="true" className="muted">
                {name === top ? '◉' : '○'}
              </span>
              <span className="nm">{name}</span>
              {name === top && <span className="syn-tag syn-tag--top">top</span>}
            </li>
          ))}
        </ul>
        <p className="muted syn-note">
          Top definido pela síntese (<code>hierarchy -auto-top</code>). A API ainda não aceita escolher outro módulo.
        </p>
      </>
    )
  }

  return (
    <section className="card syn-top" aria-labelledby={headingId}>
      <div className="ch">
        <h2 id={headingId}>Módulo Top</h2>
        {netlist && top && candidates.includes(top) && (
          <span className="muted syn-meta">
            {candidates.length} módulo{candidates.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {body}
    </section>
  )
}
