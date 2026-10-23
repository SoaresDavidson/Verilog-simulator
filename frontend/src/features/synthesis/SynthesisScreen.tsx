import { PROJECT_ID_PATTERN } from '../../api/types'
import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'
import { useSessionState } from '../../state/hooks'
import { stepBlockReason } from '../../state/session'
import { FileTree } from './FileTree'
import './synthesis.css'

/**
 * Tela 2 (#s2) — árvore de arquivos, síntese Yosys, módulo top e seleção de sinais.
 */
export function SynthesisScreen() {
  const nav = useStepNavigation()
  const state = useSessionState()
  const projectValid = state.session !== null && PROJECT_ID_PATTERN.test(state.session.projectId)
  const blockReason = projectValid ? stepBlockReason(state, 3) : 'Sessão sem projeto válido. Envie o projeto novamente.'

  return (
    <Screen title="Seleção e Síntese" description="Confira os arquivos, execute a síntese e selecione os sinais.">
      <div className="split splitw">
        <div className="sp">
          <FileTree files={state.files} onReupload={() => nav.goTo(1)} />
        </div>
        <div className="sp">
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
