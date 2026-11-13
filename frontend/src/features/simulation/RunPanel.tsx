import type { SimulationResponse } from '../../api/types'
import type { OperationState } from '../../state/session'
import { WaveArt } from '../../components/art'
import { IconChevron, IconPlay, IconRestart, IconTerminal } from '../../components/icons'
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
    <details className="disc sim-out" open={open}>
      <summary>
        <IconChevron size={16} className="disc__chev" />
        <IconTerminal size={17} />
        {label}
        {text === '' && <span className="disc__meta"> (vazio)</span>}
      </summary>
      {text !== '' && <pre className="lb sim-out__pre">{text}</pre>}
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
      {(status === 'idle' || running) && (
        <div className={`sim-run__intro${running ? ' is-running' : ''}`}>
          <div className="sim-run__art">
            <WaveArt />
          </div>
          <div className="sim-run__copy">
            <h2 className="sim-run__title">{running ? 'Rodando o testbench…' : 'Hora de ligar o circuito'}</h2>
            <p className="muted">
              O Icarus Verilog compila o projeto, executa o testbench e grava cada mudança de sinal. Depois, os valores
              acendem nos fios do diagrama e viram formas de onda.
            </p>
          </div>
        </div>
      )}
      <div className="sim-run__bar">
        <p role="status" className="sim-run__status">
          <span
            className={`led ${running ? 'led--run' : status === 'success' ? (unusableLog ? 'led--warn' : 'led--ok') : status === 'error' ? 'led--err' : ''}`}
            aria-hidden="true"
          />
          {message}
        </p>
        <div className="sim-run__actions">
          {running ? (
            <button type="button" className="btn bs bsm" onClick={onCancel}>
              Cancelar
            </button>
          ) : (
            <button type="button" className={`btn ${status === 'idle' ? 'bp' : 'bs bsm'}`} onClick={onRun} disabled={!canRun}>
              {status === 'idle' ? <IconPlay size={15} /> : <IconRestart size={16} />}
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
      {result && status === 'success' && !unusableLog && (
        <details className="disc sim-run__more">
          <summary>Saída do simulador (stdout e stderr)</summary>
          <div className="sim-run__outputs">
            <OutputBlock label="stdout" raw={result.stdout} open={false} />
            <OutputBlock label="stderr" raw={result.stderr} open={false} />
          </div>
        </details>
      )}
      {result && (status !== 'success' || unusableLog) && (
        <div className="sim-run__outputs">
          <OutputBlock label="stdout" raw={result.stdout} open={false} />
          <OutputBlock label="stderr" raw={result.stderr} open={status === 'error' && result.stderr !== ''} />
        </div>
      )}
    </div>
  )
}
