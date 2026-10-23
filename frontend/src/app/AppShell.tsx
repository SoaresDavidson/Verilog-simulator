import { useEffect, useRef, type ReactNode } from 'react'
import { ThemeToggle } from '../components/ThemeToggle'
import { DatapathScreen } from '../features/datapath/DatapathScreen'
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
  4: () => <SimulationScreen />,
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
  const { session } = useSessionState()
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
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus()
  }, [nav.step])

  return (
    <div id="app">
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      <header className="app-header">
        <div className="logo">
          <span aria-hidden="true">▶</span> Verilog Classroom
        </div>
        {session && (
          <div className="sbadge" title="Sessão ativa">
            <span className="sr-only">Sessão ativa: </span>
            {session.projectId}
          </div>
        )}
        <Stepper nav={nav} />
        <div className="header-actions">
          {headerActions}
          <ThemeToggle />
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        {SCREENS[nav.step]()}
      </main>
    </div>
  )
}
