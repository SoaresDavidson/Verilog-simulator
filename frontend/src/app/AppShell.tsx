import { motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { BrandMark } from '../components/art'
import { PaletteSwitch } from '../components/PaletteSwitch'
import { ThemeToggle } from '../components/ThemeToggle'
import { DatapathScreen } from '../features/datapath/DatapathScreen'
import { LiveDatapath } from '../features/simulation/live/LiveDatapath'
import { SimulationScreen } from '../features/simulation/SimulationScreen'
import { SynthesisScreen } from '../features/synthesis/SynthesisScreen'
import { UploadScreen } from '../features/upload/UploadScreen'
import { useSessionState } from '../state/hooks'
import { STEPS, type StepId } from '../state/session'
import { Stepper } from './Stepper'
import { useStepNavigation } from './useStepNavigation'

const SCREENS: Record<StepId, () => ReactNode> = {
  1: () => <UploadScreen />,
  2: () => <SynthesisScreen />,
  3: () => <DatapathScreen />,
  4: () => <SimulationScreen diagramSlot={(context) => <LiveDatapath context={context} />} />,
}

function stepFromHash(hash: string): StepId | null {
  return STEPS.find((step) => step.hash === hash)?.id ?? null
}

/** Mantém `location.hash` (`#s1`..`#s4`) sincronizado com a etapa, passando pela guarda. */
function useHashSync(step: StepId, goTo: (step: StepId, options?: { silent?: boolean }) => boolean) {
  const goToRef = useRef(goTo)
  useEffect(() => {
    goToRef.current = goTo
  })

  useEffect(() => {
    const expected = STEPS.find((s) => s.id === step)?.hash
    if (expected && window.location.hash !== expected) {
      window.history.replaceState(null, '', expected)
    }
  }, [step])

  useEffect(() => {
    const onHashChange = () => {
      const target = stepFromHash(window.location.hash)
      if (target !== null && !goToRef.current(target)) {
        // Bloqueado: restaura o hash da etapa atual.
        const current = STEPS.find((s) => s.id === step)?.hash
        if (current) window.history.replaceState(null, '', current)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [step])
}

export interface AppShellProps {
  /** Ações extras do cabeçalho (ex.: status da API, encerrar sessão). */
  headerActions?: ReactNode
}

export function AppShell({ headerActions }: AppShellProps) {
  const state = useSessionState()
  const { session } = state
  // Colunas da marca que energizam: sessão, síntese, caminho de dados, simulação.
  const progress =
    (session ? 1 : 0) +
    (state.synthesis.status === 'success' ? 1 : 0) +
    (state.step >= 4 ? 1 : 0) +
    (state.simulation.status === 'success' ? 1 : 0)
  const nav = useStepNavigation()
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  useHashSync(nav.step, nav.goTo)

  // Leva o foco ao título da nova tela para teclado e leitor de tela.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const root = mainRef.current ?? document.getElementById('main')
    root?.querySelector<HTMLElement>('h1')?.focus()
  }, [nav.step])

  // A etapa 1 é a página de entrada (navegação fixa, seções de uma tela e rodapé);
  // as etapas 2 a 4 são a bancada de trabalho, com rolagem interna.
  const landing = nav.step === 1
  useEffect(() => {
    document.documentElement.dataset.layout = landing ? 'landing' : 'app'
  }, [landing])

  const header = (
    <header className={landing ? 'nav app-header' : 'app-header'}>
      <div className={landing ? 'wrap app-header__bar' : 'app-header__bar'}>
        <a className="skip-link" href="#main">
          Pular para o conteúdo
        </a>
        <div className="brand logo">
          <span className="brand__plaque">
            <BrandMark size={46} lit={progress} />
          </span>
          <span className="brand__name">
            Verilog <b>Classroom</b>
          </span>
        </div>
        <Stepper nav={nav} />
        <div className="header-actions">
          {session && (
            <div className="sbadge" title="Sessão ativa">
              <span className="sbadge__dot" aria-hidden="true" />
              <span className="sr-only">Sessão ativa: </span>
              <span className="sbadge__txt">{session.projectId}</span>
            </div>
          )}
          {headerActions}
          <PaletteSwitch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )

  if (landing) {
    return (
      <>
        {header}
        <UploadScreen />
      </>
    )
  }

  return (
    <div id="app">
      {header}
      <main id="main" ref={mainRef} tabIndex={-1}>
        <motion.div key={nav.step} className="scr-wrap" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 22 }}>
          {SCREENS[nav.step]()}
        </motion.div>
      </main>
    </div>
  )
}
