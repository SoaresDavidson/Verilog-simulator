import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { SynthesisResponse } from '../../api/types'
import { synthesisOk, uploadedState } from '../../test/fixtures'
import { createFetchMock, jsonResponse } from '../../test/http'
import { renderApp } from '../../test/render'

const response: SynthesisResponse = {
  ...synthesisOk,
  stdout: 'Yosys ok',
  top_module: 'cpu',
  netlist_content: {
    creator: 'Yosys',
    modules: {
      cpu: {
        attributes: { top: '00000000000000000000000000000001' },
        ports: { clk: { direction: 'input', bits: [2], width: 1 }, pc: { direction: 'output', bits: [3, 4, 5, 6], width: 4 } },
        cells: {
          u_alu: { hide_name: 0, type: 'alu', parameters: {}, attributes: {}, port_directions: {}, connections: {} },
        },
        netnames: {
          clk: { hide_name: 0, bits: [2], attributes: {}, width: 1 },
          pc: { hide_name: 0, bits: [3, 4, 5, 6], attributes: {}, width: 4 },
        },
      },
      alu: {
        attributes: {},
        ports: { y: { direction: 'output', bits: [7, 8], width: 2 } },
        cells: {},
        netnames: { y: { hide_name: 0, bits: [7, 8], attributes: {}, width: 2 } },
      },
    },
  },
}

const region = (name: string) => screen.getByRole('region', { name })
const advance = () => screen.getByRole('button', { name: /ver caminho de dados/i })
const reason = () => document.getElementById('syn-advance-reason')?.textContent ?? null

describe('Tela 2 — seleção e síntese integrada (#37)', () => {
  it('fluxo completo: arquivos → síntese → top → sinais → etapa 3', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock().mockResolvedValueOnce(jsonResponse(200, response))
    renderApp({
      initialState: uploadedState({
        step: 2,
        files: {
          origin: 'client-preview',
          items: [
            { path: 'rtl/cpu.v', size: 10, kind: 'source' },
            { path: 'rtl/alu.v', size: 10, kind: 'source' },
            { path: 'tb/tb_cpu.v', size: 10, kind: 'testbench' },
          ],
        },
      }),
      fetch,
    })

    // Subfeatures presentes.
    expect(within(region('Arquivos')).getByRole('list', { name: 'Arquivos do projeto' })).toBeInTheDocument()
    expect(region('Síntese Yosys')).toBeInTheDocument()
    expect(region('Módulo Top')).toBeInTheDocument()
    expect(region('Fios para visualizar')).toBeInTheDocument()
    expect(advance()).toBeDisabled()
    expect(reason()).toMatch(/conclua a síntese/i)

    await user.click(within(region('Síntese Yosys')).getByRole('button', { name: 'Iniciar síntese' }))
    await within(region('Síntese Yosys')).findByText('Síntese concluída.')

    expect(within(region('Módulo Top')).getByText('cpu').closest('li')).toHaveAttribute('aria-current', 'true')
    expect(reason()).toBe('Selecione pelo menos 1 sinal.')

    const sig = region('Fios para visualizar')
    expect(within(sig).getAllByRole('checkbox').map((b) => b.closest('label')?.querySelector('.syn-sig__ref')?.textContent)).toEqual([
      'cpu.clk',
      'cpu.pc',
      'cpu.u_alu.y',
    ])
    await user.click(within(sig).getByRole('checkbox', { name: /cpu\.pc/ }))
    expect(advance()).toBeEnabled()
    expect(reason()).toBeNull()

    await user.click(advance())
    expect(screen.getByRole('heading', { level: 1, name: 'Caminho de Dados' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('voltar leva à etapa 1 mantendo a sessão', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: uploadedState({ step: 2 }) })
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Novo Projeto' })).toBeInTheDocument()
    expect(screen.getByText('Projeto enviado. Sessão criada.')).toBeInTheDocument()
  })
})
