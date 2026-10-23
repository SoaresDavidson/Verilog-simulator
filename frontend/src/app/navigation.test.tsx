import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { synthesizedState, uploadedState } from '../test/fixtures'

function stepButton(name: RegExp) {
  return within(screen.getByRole('navigation', { name: /etapas/i })).getByRole('button', { name })
}

describe('navegação em etapas', () => {
  it('sem sessão bloqueia etapas futuras com motivo e toast', async () => {
    const user = userEvent.setup()
    renderApp()

    expect(screen.getByRole('heading', { level: 1, name: 'Novo Projeto' })).toBeInTheDocument()
    const step2 = stepButton(/seleção/i)
    expect(step2).toHaveAttribute('aria-disabled', 'true')
    expect(step2).toHaveAccessibleDescription(/faça o upload/i)

    await user.click(step2)
    expect(screen.getByRole('heading', { level: 1, name: 'Novo Projeto' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/faça o upload/i)
  })

  it('com sessão libera etapa 2 mas não a 3', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: uploadedState() })

    expect(screen.getByText(/runs\/run_0123/)).toBeInTheDocument()
    await user.click(stepButton(/seleção/i))
    const heading = screen.getByRole('heading', { level: 1, name: 'Seleção e Síntese' })
    expect(heading).toHaveFocus()
    expect(window.location.hash).toBe('#s2')

    await user.click(stepButton(/caminho de dados/i))
    expect(screen.getByRole('heading', { level: 1, name: 'Seleção e Síntese' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/síntese/i)
  })

  it('após síntese navega até a etapa 3, exige sinais para a 4 e volta a etapas concluídas', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: synthesizedState({ step: 2 }) })

    await user.click(screen.getByRole('button', { name: /ver caminho de dados/i }))
    expect(screen.getByRole('heading', { level: 1, name: 'Caminho de Dados' })).toBeInTheDocument()
    expect(stepButton(/simulação/i)).toHaveAccessibleDescription(/selecione pelo menos 1 sinal/i)

    const done = stepButton(/seleção.*concluída/i)
    expect(done).not.toHaveAttribute('aria-disabled')
    await user.click(done)
    expect(screen.getByRole('heading', { level: 1, name: 'Seleção e Síntese' })).toBeInTheDocument()
    // Estado preservado: etapa 3 continua liberada.
    expect(stepButton(/caminho de dados/i)).not.toHaveAttribute('aria-disabled')
  })

  it('etapa 4 liberada com sinais; etapas anteriores clicáveis', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: synthesizedState({ step: 3, selectedSignals: ['top.clk'] }) })

    await user.click(stepButton(/simulação/i))
    expect(screen.getByRole('heading', { level: 1, name: 'Simulação' })).toBeInTheDocument()
    expect(stepButton(/simulação/i)).toHaveAttribute('aria-current', 'step')

    await user.click(stepButton(/upload/i))
    expect(screen.getByRole('heading', { level: 1, name: 'Novo Projeto' })).toBeInTheDocument()
  })

  it('hash de etapa bloqueada é revertido', () => {
    renderApp({ initialState: uploadedState() })
    window.location.hash = '#s4'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(screen.getByRole('heading', { level: 1, name: 'Novo Projeto' })).toBeInTheDocument()
  })
})
