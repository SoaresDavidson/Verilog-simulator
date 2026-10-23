import { useId, useMemo } from 'react'
import type { SynthesisResponse } from '../../api/types'
import { useSessionState } from '../../state/hooks'
import { isSynthesisConfirmed } from '../../state/session'
import { isToolAvailable, useHealth } from '../health'
import { netlistStats } from './netlist'
import { useSynthesis, type SynthesisFailureKind } from './useSynthesis'

/** Limite de caracteres exibidos por log (o fim é o mais útil). */
export const MAX_LOG_CHARS = 20_000

function tail(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_LOG_CHARS) return { text, truncated: false }
  return { text: text.slice(-MAX_LOG_CHARS), truncated: true }
}

/** Log como texto puro (React escapa; nada é interpretado como HTML). */
function LogBlock({ title, text, tone }: { title: string; text: string; tone?: 'e' }) {
  const id = useId()
  if (text.trim() === '') return null
  const shown = tail(text)
  return (
    <>
      <p id={id} className="syn-log__title">
        {title}
        {shown.truncated && ' (últimos trechos)'}
      </p>
      <pre className={`lb syn-log${tone ? ` syn-log--${tone}` : ''}`} aria-labelledby={id} tabIndex={0}>
        {shown.text}
      </pre>
    </>
  )
}

function Logs({ result, open }: { result: SynthesisResponse; open: boolean }) {
  const hasLogs = result.stderr.trim() !== '' || result.stdout.trim() !== ''
  if (!hasLogs) return null
  const content = (
    <>
      <LogBlock title="stderr" text={result.stderr} tone="e" />
      <LogBlock title="stdout" text={result.stdout} />
    </>
  )
  if (open) return content
  return (
    <details className="syn-details">
      <summary>Log do Yosys</summary>
      {content}
    </details>
  )
}

const FAILURE_TITLE: Partial<Record<SynthesisFailureKind, string>> = {
  synthesis: 'Erro de síntese',
  netlist: 'Netlist ausente ou inválida',
  timeout: 'Tempo limite excedido',
  unavailable: 'Serviço indisponível',
  network: 'Falha de conexão',
  invalid_response: 'Resposta inválida',
  http: 'Erro do servidor',
  interrupted: 'Síntese interrompida',
}

/** Tela 2c (#22, #28) — síntese Yosys com estados e estatísticas da netlist. */
export function SynthesisPanel() {
  const headingId = useId()
  const state = useSessionState()
  const health = useHealth()
  const { canStart, running, failureKind, start } = useSynthesis()
  const { status, result, error } = state.synthesis
  const confirmed = isSynthesisConfirmed(state)
  const stats = useMemo(
    () => (confirmed && result?.netlist_content ? netlistStats(result.netlist_content) : null),
    [confirmed, result],
  )
  const yosysDown = !isToolAvailable(health.state, 'yosys')

  let statusText: string
  if (!state.session) statusText = 'Envie um projeto para habilitar a síntese.'
  else if (!canStart && !running) statusText = 'Sessão sem projeto válido. Envie o projeto novamente.'
  else if (running) statusText = 'Sintetizando com Yosys… a operação não informa progresso; aguarde.'
  else if (status === 'success' && confirmed) statusText = 'Síntese concluída.'
  else if (status === 'error') statusText = 'A síntese não foi concluída.'
  else statusText = 'Pronto para sintetizar.'

  const label = running
    ? 'Sintetizando…'
    : status === 'error'
      ? 'Tentar novamente'
      : status === 'success'
        ? 'Sintetizar novamente'
        : 'Iniciar síntese'

  return (
    <section className="card syn-run" aria-labelledby={headingId} aria-busy={running}>
      <div className="ch">
        <h2 id={headingId}>Síntese Yosys</h2>
        <button
          type="button"
          className="btn bp bsm"
          onClick={() => void start()}
          disabled={!canStart}
          aria-disabled={!canStart}
        >
          {label}
        </button>
      </div>
      <p role="status" className="syn-run__status muted" data-status={status}>
        {statusText}
      </p>
      {yosysDown && !running && (
        <p className="syn-note state-warn">O healthcheck indica Yosys indisponível; a síntese pode falhar.</p>
      )}

      {running && (
        <div className="pb pb--indeterminate" role="progressbar" aria-label="Sintetizando">
          <div className="fl" />
        </div>
      )}

      {status === 'error' && error && (
        <div className="syn-error">
          <div role="alert" className="state-error">
            <p>
              <strong>{(failureKind && FAILURE_TITLE[failureKind]) ?? 'Falha na síntese'}:</strong> {error}
            </p>
          </div>
          {result && <Logs result={result} open />}
        </div>
      )}

      {confirmed && result && stats && (
        <>
          <div className="ns syn-stats" role="list" aria-label="Estatísticas da netlist">
            {stats.map((stat) => (
              <div key={stat.key} className="nst" role="listitem" data-stat={stat.key}>
                <div className="v">{stat.value}</div>
                <div className="l">{stat.label}</div>
              </div>
            ))}
          </div>
          {result.stat_report && result.stat_report.trim() !== '' && (
            <details className="syn-details">
              <summary>Relatório do Yosys (stat)</summary>
              <pre className="lb syn-stat-report" tabIndex={0}>
                {tail(result.stat_report).text}
              </pre>
            </details>
          )}
          <Logs result={result} open={false} />
        </>
      )}
    </section>
  )
}
