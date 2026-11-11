import type { SimulationResponse } from '../../api/types'
import type { OperationState } from '../../state/session'
import { sanitizeToolOutput } from './toolOutput'

export interface RunPanelProps {
  simulation: OperationState<SimulationResponse>
  /** Log presente mas sem timestamps (playback desabilitado). */
  unusableLog: boolean
  canRun: boolean
  onRun: () => void
  onCancel: () => void
}

function OutputBlock({ label, raw, open }: { label: string; raw: string; open: boolean }) {
  const { text, truncated } = sanitizeToolOutput(raw)
  return (
    <details className="sim-out" open={open}>
      <summary>
        {label}
        {text === '' && <span className="muted"> (vazio)</span>}
      </summary>
      {text !== '' && <pre className="sim-out__pre">{text}</pre>}
      {truncated && <p className="muted sim-out__note">Saída truncada para exibição.</p>}
    </details>
  )
}

/** Execução da simulação (#34): botão, estado idle/running/success/error e stdout/stderr. */
export function RunPanel({ simulation, unusableLog, canRun, onRun, onCancel }: RunPanelProps) {
  const { status, result, error } = simulation
  const running = status === 'running'

  let message: string
  if (running) message = 'Simulando…'
  else if (status === 'success') message = unusableLog ? 'Simulação concluída, mas sem dados de timeline para exibir.' : 'Simulação concluída.'
  else if (status === 'error') message = 'A simulação não foi concluída.'
  else message = 'Simulação ainda não executada.'

  return (
    <div className="card sim-run" data-status={status}>
      <div className="sim-run__bar">
        <p role="status" className="sim-run__status">
          {message}
        </p>
        <div className="sim-run__actions">
          {running ? (
            <button type="button" className="btn bs bsm" onClick={onCancel}>
              Cancelar
            </button>
          ) : (
            <button type="button" className="btn bp bsm" onClick={onRun} disabled={!canRun}>
              {status === 'idle' ? 'Executar simulação' : 'Executar novamente'}
            </button>
          )}
        </div>
      </div>
      {running && <div className="pb pb--indeterminate" aria-hidden="true">
          <div className="fl" />
        </div>}
      {status === 'error' && error && (
        <p role="alert" className="state-error">
          {error}
        </p>
      )}
      {status === 'success' && unusableLog && (
        <p role="alert" className="state-warn">
          A resposta não contém um simulation_log utilizável; o playback foi desabilitado.
        </p>
      )}
      {result && (
        <div className="sim-run__outputs">
          <OutputBlock label="stdout" raw={result.stdout} open={false} />
          <OutputBlock label="stderr" raw={result.stderr} open={status === 'error' && result.stderr !== ''} />
        </div>
      )}
    </div>
  )
}
