import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'

/**
 * Tela 3 (#s3) — diagrama do caminho de dados a partir do netlist Yosys.
 * Placeholder da fundação (#24). Lê `state.synthesis.result.netlist_content`.
 */
export function DatapathScreen() {
  const nav = useStepNavigation()
  return (
    <Screen title="Caminho de Dados" description="Diagrama gerado a partir do netlist da síntese.">
      <div className="card placeholder">
        <p>Em construção.</p>
      </div>
      <div className="scr__actions">
        <button type="button" className="btn bs bsm" onClick={() => nav.goTo(2)}>
          Voltar
        </button>
        <button type="button" className="btn bp bsm" onClick={() => nav.goTo(4)}>
          Simular →
        </button>
      </div>
    </Screen>
  )
}
