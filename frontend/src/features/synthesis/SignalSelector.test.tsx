import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Netlist, SynthesisResponse } from '../../api/types'
import { synthesisOk, synthesizedState, uploadedState } from '../../test/fixtures'
import { createFetchMock, jsonResponse } from '../../test/http'
import { renderApp } from '../../test/render'
import { SIGNAL_PAGE_SIZE } from './SignalSelector'

function netlistWith(top: string, netnames: Record<string, number>, ports: Record<string, number> = {}): Netlist {
  return {
    creator: 'Yosys',
    modules: {
      [top]: {
        attributes: { top: '1' },
        ports: Object.fromEntries(
          Object.entries(ports).map(([n, w]) => [n, { direction: 'input' as const, bits: Array(w).fill(2), width: w }]),
        ),
        cells: {},
        netnames: Object.fromEntries(
          Object.entries({ ...ports, ...netnames }).map(([n, w]) => [n, { hide_name: 0, bits: Array(w).fill(2), attributes: {}, width: w }]),
        ),
      },
    },
  }
}

function stateFor(netlist: Netlist, top: string, selectedSignals: string[] = []) {
  const result: SynthesisResponse = { ...synthesisOk, top_module: top, netlist_content: netlist }
  return synthesizedState({ step: 2, topModule: top, selectedSignals, synthesis: { status: 'success', result, error: null } })
}

const sigPanel = () => screen.getByRole('region', { name: 'Fios para visualizar' })
const boxes = () => within(sigPanel()).queryAllByRole('checkbox') as HTMLInputElement[]
const checked = () => boxes().filter((b) => b.checked).map((b) => b.closest('label')?.querySelector('.syn-sig__ref')?.textContent)
const advance = () => screen.getByRole('button', { name: /ver caminho de dados/i })
const search = () => within(sigPanel()).getByRole('searchbox', { name: 'Buscar sinal' })

const alu = netlistWith('alu32', { 'result_q': 32, 'carry.chain[0]': 1, opcode_r: 5 }, { a: 32, b: 32 })

describe('Tela 2d — seleção de fios e sinais (#29)', () => {
  it('sem síntese confirmada não mostra checklist', () => {
    renderApp({ initialState: uploadedState({ step: 2 }) })
    expect(within(sigPanel()).getByText(/conclua a síntese/i)).toBeInTheDocument()
    expect(boxes()).toHaveLength(0)
  })

  it('checklist deriva do netlist recebido (nomes e larguras arbitrários)', () => {
    renderApp({ initialState: stateFor(alu, 'alu32') })
    const refs = boxes().map((b) => b.closest('label')?.textContent)
    expect(refs).toEqual([
      'alu32.a[31:0] · entrada',
      'alu32.b[31:0] · entrada',
      'alu32.result_q[31:0] · interno',
      'alu32.carry.chain[0]1 bit · interno',
      'alu32.opcode_r[4:0] · interno',
    ])
    expect(within(sigPanel()).getByRole('status')).toHaveTextContent('0 de 5 selecionados')
  })

  it('seleção vazia bloqueia o avanço', () => {
    renderApp({ initialState: stateFor(alu, 'alu32') })
    expect(advance()).toBeDisabled()
    expect(within(sigPanel()).getByText(/selecione pelo menos 1 sinal/i)).toBeInTheDocument()
  })

  it('selecionar todos, limpar e busca sem perder seleção válida', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: stateFor(alu, 'alu32') })

    await user.click(within(sigPanel()).getByRole('button', { name: 'Selecionar todos' }))
    expect(checked()).toHaveLength(5)
    await user.click(within(sigPanel()).getByRole('button', { name: 'Limpar' }))
    expect(checked()).toHaveLength(0)

    // Busca filtra; selecionar todos vale só para os resultados.
    await user.type(search(), 'ALU32.B')
    expect(boxes()).toHaveLength(1)
    await user.click(within(sigPanel()).getByRole('button', { name: 'Selecionar todos' }))
    await user.clear(search())
    expect(checked()).toEqual(['alu32.b'])

    // Marcar outro e limpar só os resultados de uma nova busca.
    await user.click(within(sigPanel()).getByRole('checkbox', { name: /alu32\.opcode_r/ }))
    await user.type(search(), 'opcode')
    await user.click(within(sigPanel()).getByRole('button', { name: 'Limpar' }))
    await user.clear(search())
    expect(checked()).toEqual(['alu32.b'])

    await user.type(search(), 'nada-assim')
    expect(within(sigPanel()).getByText(/nenhum sinal corresponde/i)).toBeInTheDocument()
    expect(within(sigPanel()).getByRole('status')).toHaveTextContent('1 de 5 selecionado')
  })

  it('seleção persiste no estado e libera o avanço para a etapa 3 e a 4', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: stateFor(alu, 'alu32') })
    await user.click(within(sigPanel()).getByRole('checkbox', { name: /alu32\.result_q/ }))
    expect(advance()).toBeEnabled()
    await user.click(advance())
    expect(screen.getByRole('heading', { level: 1, name: 'Caminho de Dados' })).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: /etapas/i })
    expect(within(nav).getByRole('button', { name: /simulação/i })).not.toHaveAttribute('aria-disabled')
    await user.click(within(nav).getByRole('button', { name: /seleção/i }))
    expect(checked()).toEqual(['alu32.result_q'])
  })

  it('nova síntese limpa a seleção anterior', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValueOnce(
      jsonResponse(200, { ...synthesisOk, top_module: 'alu32', netlist_content: alu }),
    )
    renderApp({ initialState: stateFor(alu, 'alu32', ['alu32.a']), fetch })
    expect(checked()).toEqual(['alu32.a'])
    await user.click(within(screen.getByRole('region', { name: 'Síntese Yosys' })).getByRole('button'))
    await within(screen.getByRole('region', { name: 'Síntese Yosys' })).findByText('Síntese concluída.')
    expect(checked()).toEqual([])
    expect(advance()).toBeDisabled()
  })

  it('listas longas são paginadas', async () => {
    const user = userEvent.setup()
    const many = netlistWith('big', Object.fromEntries(Array.from({ length: 450 }, (_, i) => [`w${String(i).padStart(3, '0')}`, 1])))
    renderApp({ initialState: stateFor(many, 'big') })
    expect(boxes()).toHaveLength(SIGNAL_PAGE_SIZE)
    await user.click(within(sigPanel()).getByRole('button', { name: /mostrar mais \(250 restantes\)/i }))
    expect(boxes()).toHaveLength(400)
    // Selecionar todos atinge também os itens fora da página.
    await user.click(within(sigPanel()).getByRole('button', { name: 'Selecionar todos' }))
    expect(within(sigPanel()).getByRole('status')).toHaveTextContent('450 de 450 selecionados')
  })

  it('netlist sem portas nem fios visíveis mostra erro', () => {
    renderApp({ initialState: stateFor(netlistWith('empty', {}), 'empty') })
    expect(within(sigPanel()).getByRole('alert')).toHaveTextContent(/não tem portas nem fios/i)
    expect(advance()).toBeDisabled()
  })
})
