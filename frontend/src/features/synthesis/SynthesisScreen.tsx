import { useStepNavigation } from '../../app/useStepNavigation'
import { useMemo } from 'react'
import { Explainer, MiniArt } from '../../components/Explainer'
import { IconArrowLeft, IconArrowRight } from '../../components/icons'
import { ActionBar, Screen, type ScreenFigure } from '../../components/Screen'
import { isSynthesisConfirmed } from '../../state/session'
import { netlistStats } from './netlist'
import { useSessionState } from '../../state/hooks'
import { advanceBlockReason } from './advance'
import { FileTree } from './FileTree'
import { SignalSelector } from './SignalSelector'
import { SynthesisPanel } from './SynthesisPanel'
import { TopModulePanel } from './TopModulePanel'
import { useSynthesis } from './useSynthesis'
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
  // Um só ciclo de síntese para os dois painéis que a disparam.
  const synthesis = useSynthesis()
  const blockReason = advanceBlockReason(state)
  const confirmed = isSynthesisConfirmed(state)
  const netlist = confirmed ? state.synthesis.result?.netlist_content : null

  const figures = useMemo<ScreenFigure[] | undefined>(() => {
    if (!netlist) return undefined
    const stats = netlistStats(netlist)
    const pick = (key: string) => stats.find((s) => s.key === key)?.value ?? 0
    return [
      { value: pick('cells'), label: 'células' },
      { value: pick('wires'), label: 'fios' },
      { value: state.selectedSignals.length, label: 'sinais escolhidos', accent: true },
    ]
  }, [netlist, state.selectedSignals.length])

  return (
    <Screen
      title="Seleção e Síntese"
      description="O Yosys transforma seu Verilog em portas e fios. Depois, escolha quais sinais você quer acompanhar."
      figures={figures}
    >
      <Explainer
        id="sintese"
        title="Entenda esta etapa"
        items={[
          { art: <MiniArt kind="code" />, title: 'Seu Verilog', text: 'Você descreve o comportamento do circuito em código: always, assign, if, case.' },
          { art: <MiniArt kind="yosys" />, title: 'O Yosys', text: 'A ferramenta de síntese lê o código e descobre que hardware ele precisa: portas, registradores, somadores.' },
          { art: <MiniArt kind="netlist" />, title: 'A netlist', text: 'O resultado é uma lista de células ligadas por fios. É ela que vira o desenho da próxima etapa.' },
          { art: <MiniArt kind="select" />, title: 'Os sinais', text: 'Escolha os fios que você quer acompanhar: eles ganham destaque no diagrama e na simulação.' },
        ]}
      />
      <div className="split splitw">
        <div className="sp">
          <FileTree files={state.files} onReupload={() => nav.goTo(1)} />
        </div>
        <div className="sp">
          <SynthesisPanel synthesis={synthesis} />
          <TopModulePanel synthesis={synthesis} />
          <SignalSelector />
        </div>
      </div>
      <ActionBar
        hintId={blockReason ? 'syn-advance-reason' : undefined}
        tone={blockReason ? 'wait' : 'ok'}
        hint={
          blockReason ?? (
            <>
              Tudo pronto: <b>{state.selectedSignals.length}</b> sinais escolhidos. Agora veja o circuito desenhado.
            </>
          )
        }
      >
        <button type="button" className="btn bs" onClick={() => nav.goTo(1)}>
          <IconArrowLeft size={16} />
          Voltar
        </button>
        <button
          type="button"
          className="btn bp"
          disabled={blockReason !== null}
          aria-describedby={blockReason ? 'syn-advance-reason' : undefined}
          onClick={() => nav.goTo(3)}
        >
          Ver Caminho de Dados
          <IconArrowRight size={16} />
        </button>
      </ActionBar>
    </Screen>
  )
}
