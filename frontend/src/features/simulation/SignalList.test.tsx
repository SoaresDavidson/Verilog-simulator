import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/render'
import { simulatedState } from './testData'

function list() {
  return within(screen.getByRole('list', { name: 'Sinais da simulação' }))
}
function row(id: string) {
  return document.querySelector<HTMLElement>(`[data-signal="${CSS.escape(id)}"]`)
}
function rowIds() {
  return [...document.querySelectorAll<HTMLElement>('[data-signal]')].map((el) => el.dataset.signal)
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

describe('Tela 4 — lista de sinais (#31)', () => {
  it('mostra hierarquia, largura, tipo, caminho, valor no cursor e estado', () => {
    renderApp({ initialState: simulatedState() })
    expect(rowIds()).toEqual(['tb.clk', 'tb.rst', 'tb.uut.clk', 'tb.uut.data[7:0]', 'tb.uut.nosamp'])

    const data = within(row('tb.uut.data[7:0]')!)
    expect(data.getByText('tb.uut.data')).toBeInTheDocument()
    expect(data.getByText(/8 bits · wire/)).toBeInTheDocument()
    expect(data.getByText('0xXX')).toHaveAttribute('data-state', 'x')

    const rst = within(row('tb.rst')!)
    expect(rst.getByText('1')).toHaveClass('b0', 's1')
    expect(rst.getByText(/1 bit · reg/)).toBeInTheDocument()
  })

  it('sinal sem amostra é marcado sem quebrar a lista', () => {
    renderApp({ initialState: simulatedState() })
    expect(within(row('tb.uut.nosamp')!).getByText('sem amostra')).toBeInTheDocument()
    expect(list().getAllByRole('listitem')).toHaveLength(5)
  })

  it('mudança de timestamp atualiza valores (última amostra <= cursor)', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: simulatedState() })
    await user.click(screen.getByRole('button', { name: 'Próximo passo' }))
    expect(within(row('tb.uut.data[7:0]')!).getByText('0x0A')).toHaveAttribute('data-state', 'bus')
    expect(within(row('tb.clk')!).getByText('1')).toHaveClass('s1')

    fireEvent.change(screen.getByRole('slider', { name: 'Timeline' }), { target: { value: '4' } })
    expect(within(row('tb.rst')!).getByText('Z')).toHaveClass('sz')
    expect(within(row('tb.uut.data[7:0]')!).getByText('0xFF')).toBeInTheDocument()
  })

  it('filtros por módulo, nome e seleção da tela 2 funcionam em conjunto', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: simulatedState(undefined, { selectedSignals: ['clk', 'data'] }) })

    await user.selectOptions(screen.getByLabelText('Módulo'), 'tb.uut')
    expect(rowIds()).toEqual(['tb.uut.clk', 'tb.uut.data[7:0]', 'tb.uut.nosamp'])

    await user.click(screen.getByLabelText('Somente sinais escolhidos na Seleção'))
    expect(rowIds()).toEqual(['tb.uut.clk', 'tb.uut.data[7:0]'])

    await user.type(screen.getByLabelText('Nome'), 'dat')
    expect(rowIds()).toEqual(['tb.uut.data[7:0]'])

    await user.selectOptions(screen.getByLabelText('Módulo'), '')
    await user.clear(screen.getByLabelText('Nome'))
    expect(rowIds()).toEqual(['tb.clk', 'tb.uut.clk', 'tb.uut.data[7:0]'])

    await user.type(screen.getByLabelText('Nome'), 'inexistente')
    expect(screen.getByText('Nenhum sinal corresponde aos filtros.')).toBeInTheDocument()
  })

  it('visibilidade inicial vem da tela 2 e alternar marca/desmarca o sinal', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: simulatedState(undefined, { selectedSignals: ['rst'] }) })
    const rst = screen.getByRole('checkbox', { name: 'Exibir tb.rst' })
    const clk = screen.getByRole('checkbox', { name: 'Exibir tb.clk' })
    expect(rst).toBeChecked()
    expect(clk).not.toBeChecked()

    await user.click(clk)
    await user.click(rst)
    expect(clk).toBeChecked()
    expect(rst).not.toBeChecked()
    expect(row('tb.clk')).toHaveClass('sel')
  })

  it('alternar visibilidade sincroniza com o waveform', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: simulatedState(undefined, { selectedSignals: ['rst'] }) })
    expect(screen.getByRole('img', { name: /Formas de onda de 1 sinal,/ })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Exibir tb.uut.data' }))
    expect(screen.getByRole('img', { name: /Formas de onda de 2 sinais,/ })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Exibir tb.rst' }))
    await user.click(screen.getByRole('checkbox', { name: 'Exibir tb.uut.data' }))
    expect(screen.getByText(/Nenhum sinal visível/)).toBeInTheDocument()
  })
})
