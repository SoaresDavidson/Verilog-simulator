import { useId, useState } from 'react'
import { useHealth } from './context'
import { healthIssues, healthLevel } from './health'

const LABEL = {
  checking: 'Verificando serviços…',
  ok: 'Serviços disponíveis',
  degraded: 'Serviços com limitações',
  error: 'Serviços indisponíveis',
} as const

/**
 * Indicador de disponibilidade de API/Docker/Yosys/Icarus no cabeçalho,
 * baseado em `GET /api/v1/status/` (#36). Disclosure com detalhes acionáveis.
 */
export function HealthIndicator() {
  const { state, refresh } = useHealth()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const level = healthLevel(state)
  const issues = healthIssues(state)

  return (
    <div className={`health health--${level}`}>
      <button
        type="button"
        className="health__pill"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="health__dot" aria-hidden="true" />
        <span className="health__label">{LABEL[level]}</span>
      </button>
      {/* Anuncia mudanças relevantes sem exigir abrir o painel. */}
      <span role="status" className="sr-only">
        {level === 'error' || level === 'degraded' ? `${LABEL[level]}. ${issues.map((i) => i.message).join(' ')}` : ''}
      </span>
      <div id={panelId} className="health__panel card" hidden={!open}>
        {issues.length === 0 ? (
          <p className="muted">{level === 'checking' ? 'Consultando o servidor…' : 'API, Docker, Yosys e Icarus disponíveis.'}</p>
        ) : (
          <ul className="health__issues">
            {issues.map((issue) => (
              <li key={issue.name} className={issue.level === 'error' ? 'state-error' : 'state-warn'}>
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn bs bsm" onClick={refresh}>
          Verificar novamente
        </button>
      </div>
    </div>
  )
}
