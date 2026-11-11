import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../../test/render'
import { cpuLog, simulatedState } from '../testData'

function live() {
  return within(screen.getByRole('region', { name: 'Diagrama ao vivo' }))
}
function busBar() {
  return within(live().getByRole('list', { name: 'Sinais selecionados no instante atual' }))
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

describe('Tela 4 — diagrama ao vivo (#32)', () => {
  it('reutiliza o diagrama da tela 3 e mostra o valor do timestamp inicial no painel', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: simulatedState() })

    expect(live().getByRole('region', { name: 'Diagrama ao vivo do módulo top' })).toBeInTheDocument()
    await user.click(live().getByRole('button', { name: /clk, 1 bit/ }))
    const panel = live().getByRole('button', { name: 'Fechar propriedades' }).closest('section')!
    expect(panel).toHaveTextContent(/Valor\s*0/)
  })

  it('transição do cursor atualiza painel e barra de sinais', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: simulatedState() })

    expect(busBar().getAllByText('clk')[0].closest('li')).toHaveTextContent('0')
    await user.click(screen.getByRole('button', { name: 'Próximo passo' }))
    expect(busBar().getAllByText('clk')[0].closest('li')).toHaveTextContent('1')
    await user.click(live().getByRole('button', { name: /clk, 1 bit/ }))
    const panel = live().getByRole('button', { name: 'Fechar propriedades' }).closest('section')!
    expect(panel).toHaveTextContent(/Valor\s*1/)
  })

  it('marca sinais sem amostra no timestamp atual', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: simulatedState() })

    await user.click(screen.getByRole('checkbox', { name: 'Exibir tb.uut.nosamp' }))
    expect(busBar().getByText('nosamp').closest('li')).toHaveTextContent('sem amostra')
  })

  it('selecionar um fio no diagrama exibe o sinal correspondente na lista', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: simulatedState(cpuLog, { selectedSignals: ['top.rst'] }) })
    const checkbox = screen.getAllByRole('checkbox', { name: /^Exibir .*\.clk$/ })[0]
    if ((checkbox as HTMLInputElement).checked) await user.click(checkbox)
    expect(checkbox).not.toBeChecked()

    await user.click(live().getByRole('button', { name: /clk, 1 bit/ }))
    expect(screen.getAllByRole('checkbox', { name: /^Exibir .*\.clk$/ }).some((c) => (c as HTMLInputElement).checked)).toBe(true)
  })

  it('sem netlist mostra aviso em vez do diagrama', () => {
    const state = simulatedState()
    renderApp({ initialState: { ...state, synthesis: { ...state.synthesis, result: { ...state.synthesis.result!, netlist_content: null } } } })
    expect(live().getByRole('status')).toHaveTextContent(/Sem netlist/)
  })
})
