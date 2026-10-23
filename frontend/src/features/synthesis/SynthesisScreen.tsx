import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'

/**
 * Tela 2 (#s2) — seleção do módulo top, síntese Yosys e seleção de sinais.
 * Placeholder da fundação (#24); implementação nas issues #37 e sub-issues.
 *
 * Contrato: despache `SYNTHESIS_STARTED/SUCCEEDED/FAILED`, `TOP_MODULE_SELECTED`
 * e `SIGNALS_SELECTED` (ver `src/state/session.ts`) e chame `useApi().synthesize`.
 */
export function SynthesisScreen() {
  const nav = useStepNavigation()
  return (
    <Screen title="Seleção e Síntese" description="Escolha o módulo top, execute a síntese e selecione os sinais.">
      <div className="card placeholder">
        <p>Em construção.</p>
      </div>
      <div className="scr__actions">
        <button type="button" className="btn bs bsm" onClick={() => nav.goTo(1)}>
          Voltar
        </button>
        <button type="button" className="btn bp bsm" onClick={() => nav.goTo(3)}>
          Ver Caminho de Dados →
        </button>
      </div>
    </Screen>
  )
}
