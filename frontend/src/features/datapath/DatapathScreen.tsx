import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'
import { useSessionState } from '../../state/hooks'
import { NetlistExplorer } from './explorer/NetlistExplorer'
import { buildNetlistModel } from './netlist/model'
import { buildModuleGraph } from './netlist/parse'
import { valuesAt } from './netlist/signals'
import { DatapathDiagram } from './render/DatapathDiagram'
import type { DiagramSelection } from './render/DiagramSvg'
import './datapath.css'

type Tab = 'diagram' | 'structure'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'diagram', label: 'Diagrama' },
  { id: 'structure', label: 'Estrutura' },
]

/**
 * Tela 3 (#s3) — caminho de dados: diagrama SVG (#30) e estrutura em
 * tabelas (#21) do netlist em `state.synthesis.result.netlist_content`.
 */
export function DatapathScreen() {
  const nav = useStepNavigation()
  const state = useSessionState()
  const ids = useId()
  const result = state.synthesis.result
  const netlist = result?.netlist_content ?? null
  const topHint = result?.top_module ?? state.topModule

  const model = useMemo(() => buildNetlistModel(netlist, topHint), [netlist, topHint])
  const [picked, setPicked] = useState<string | null>(null)
  const selectedModule = picked && model.byName.has(picked) ? picked : (model.top ?? model.tree[0]?.name ?? null)
  const module = selectedModule ? model.byName.get(selectedModule) : undefined
  const graph = useMemo(() => (module ? buildModuleGraph(module) : null), [module])
  const [selection, setSelection] = useState<DiagramSelection | null>(null)

  const simLog = state.simulation.result?.simulation_log ?? null
  const values = useMemo(
    () => (simLog ? valuesAt(simLog.timeline, state.timelineCursor ?? simLog.metadata.begintime) : undefined),
    [simLog, state.timelineCursor],
  )

  const [tab, setTab] = useState<Tab>('diagram')
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ diagram: null, structure: null })
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.id === tab)
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
    setTab(TABS[next].id)
    tabRefs.current[TABS[next].id]?.focus()
  }

  const openModule = (name: string) => {
    setPicked(name)
    setSelection(null)
  }

  let content
  if (netlist === null) {
    content = (
      <div className="card placeholder" role="status">
        <p>Nenhum netlist disponível.</p>
        <p className="muted">Execute a síntese na etapa anterior para visualizar o caminho de dados.</p>
      </div>
    )
  } else if (model.modules.length === 0) {
    content = (
      <div className="card placeholder" role="status">
        <p>O netlist não contém módulos.</p>
        <p className="muted">Verifique se o módulo top foi sintetizado corretamente e tente novamente.</p>
      </div>
    )
  } else {
    content = (
      <>
        <div className="dp-bar">
          <div role="tablist" aria-label="Visualização" className="dp-tabs" onKeyDown={onTabKey}>
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el
                }}
                type="button"
                role="tab"
                id={`${ids}-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`${ids}-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className={`dp-tab${tab === t.id ? ' dp-tab--on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'diagram' && (
            <label className="dp-modsel">
              <span>Módulo</span>
              <select value={selectedModule ?? ''} onChange={(e) => openModule(e.target.value)}>
                {model.tree.map(({ name, depth }) => (
                  <option key={name} value={name}>
                    {'  '.repeat(depth)}
                    {name}
                    {name === model.top ? ' (top)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div role="tabpanel" id={`${ids}-panel-${tab}`} aria-labelledby={`${ids}-tab-${tab}`} className="dp-panel">
          {tab === 'diagram' ? (
            graph && (
              <DatapathDiagram
                key={graph.module}
                graph={graph}
                values={values}
                selectedSignals={state.selectedSignals}
                selection={selection}
                onSelect={setSelection}
                onOpenModule={openModule}
              />
            )
          ) : (
            <NetlistExplorer model={model} selectedModule={selectedModule} onSelectModule={openModule} />
          )}
        </div>
      </>
    )
  }

  return (
    <Screen title="Caminho de Dados" description="Diagrama e estrutura gerados a partir do netlist da síntese.">
      {content}
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
