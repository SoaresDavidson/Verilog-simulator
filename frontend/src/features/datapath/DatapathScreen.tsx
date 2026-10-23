import { useMemo, useState } from 'react'
import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'
import { useSessionState } from '../../state/hooks'
import { NetlistExplorer } from './explorer/NetlistExplorer'
import { buildNetlistModel } from './netlist/model'
import './datapath.css'

/**
 * Tela 3 (#s3) — estrutura mapeada do netlist Yosys.
 * Lê `state.synthesis.result.netlist_content`.
 */
export function DatapathScreen() {
  const nav = useStepNavigation()
  const state = useSessionState()
  const result = state.synthesis.result
  const netlist = result?.netlist_content ?? null
  const topHint = result?.top_module ?? state.topModule

  const model = useMemo(() => buildNetlistModel(netlist, topHint), [netlist, topHint])
  const [picked, setPicked] = useState<string | null>(null)
  const selectedModule = picked && model.byName.has(picked) ? picked : (model.top ?? model.tree[0]?.name ?? null)

  return (
    <Screen title="Caminho de Dados" description="Estrutura mapeada a partir do netlist da síntese.">
      {netlist === null ? (
        <div className="card placeholder" role="status">
          <p>Nenhum netlist disponível.</p>
          <p className="muted">Execute a síntese na etapa anterior para visualizar a estrutura.</p>
        </div>
      ) : (
        <NetlistExplorer model={model} selectedModule={selectedModule} onSelectModule={setPicked} />
      )}
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
