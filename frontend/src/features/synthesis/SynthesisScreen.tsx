import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'
import { useSessionState } from '../../state/hooks'
import { advanceBlockReason } from './advance'
import { FileTree } from './FileTree'
import { SynthesisPanel } from './SynthesisPanel'
import { TopModulePanel } from './TopModulePanel'
import './synthesis.css'

/**
 * Tela 2 (#s2) — árvore de arquivos, síntese Yosys, módulo top e seleção de sinais.
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
