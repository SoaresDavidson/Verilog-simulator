import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'
import { useSessionState } from '../../state/hooks'
import { advanceBlockReason } from './advance'
import { FileTree } from './FileTree'
import { SignalSelector } from './SignalSelector'
import { SynthesisPanel } from './SynthesisPanel'
import { TopModulePanel } from './TopModulePanel'
import './synthesis.css'

/**
 * Tela 2 (#s2, #37) — árvore de arquivos (#26), síntese Yosys (#22, #28),
 * módulo top (#27) e seleção de sinais (#29). O avanço para a etapa 3 exige
 * `project_id` válido, síntese confirmada, top da netlist e ao menos 1 sinal
 * (`advanceBlockReason`); a navegação passa pela guarda global `goTo`.
 */
export function SynthesisScreen() {
  const nav = useStepNavigation()
  const state = useSessionState()
  const blockReason = advanceBlockReason(state)

  return (
    <Screen title="Seleção e Síntese" description="Confira os arquivos, execute a síntese e selecione os sinais.">
      <div className="split splitw">
        <div className="sp">
          <FileTree files={state.files} onReupload={() => nav.goTo(1)} />
        </div>
        <div className="sp">
          <SynthesisPanel />
          <TopModulePanel />
          <SignalSelector />
          <div className="scr__actions">
            {blockReason && (
              <span id="syn-advance-reason" className="syn-block-reason">
                {blockReason}
              </span>
            )}
            <button type="button" className="btn bs bsm" onClick={() => nav.goTo(1)}>
              Voltar
            </button>
            <button
              type="button"
              className="btn bp bsm"
              disabled={blockReason !== null}
              aria-describedby={blockReason ? 'syn-advance-reason' : undefined}
              onClick={() => nav.goTo(3)}
            >
              Ver Caminho de Dados →
            </button>
          </div>
        </div>
      </div>
    </Screen>
  )
}
