import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Netlist, SynthesisResponse } from '../../api/types'
import { synthesisOk, synthesizedState, uploadedState } from '../../test/fixtures'
import { createFetchMock, jsonResponse } from '../../test/http'
import { renderApp } from '../../test/render'
import { TOP_MESSAGES } from './netlist'

const mod = (attributes: Record<string, string> = {}) => ({ attributes, ports: {}, cells: {}, netnames: {} })

/** Netlist com vários módulos; `cpu` é o top (não o primeiro em ordem alfabética). */
const multi: Netlist = {
  creator: 'Yosys',
  modules: { regfile: mod(), alu: mod(), cpu: mod({ top: '00000000000000000000000000000001' }) },
}
const multiOk: SynthesisResponse = { ...synthesisOk, top_module: 'cpu', netlist_content: multi }

const topPanel = () => screen.getByRole('region', { name: 'Módulo Top' })
const advance = () => screen.getByRole('button', { name: /ver caminho de dados/i })

async function synthesize(response: unknown) {
  const user = userEvent.setup()
  const fetch = createFetchMock().mockResolvedValueOnce(jsonResponse(200, response))
  renderApp({ initialState: uploadedState({ step: 2 }), fetch })
  await user.click(within(screen.getByRole('region', { name: 'Síntese Yosys' })).getByRole('button'))
  return user
}

describe('Tela 2b — módulo top (#27)', () => {
  it('antes da síntese não lista módulos e o avanço fica bloqueado', () => {
    renderApp({ initialState: uploadedState({ step: 2 }) })
    expect(within(topPanel()).getByText(/execute a síntese/i)).toBeInTheDocument()
    expect(within(topPanel()).queryByRole('list')).toBeNull()
    expect(advance()).toBeDisabled()
  })

  it('candidatos múltiplos vêm da netlist e o top é o do backend', async () => {
    await synthesize(multiOk)
    const list = await within(topPanel()).findByRole('list', { name: 'Módulos encontrados na netlist' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('.nm')?.textContent)).toEqual(['alu', 'cpu', 'regfile'])
    const current = items.find((li) => li.getAttribute('aria-current') === 'true')
    expect(current?.querySelector('.nm')?.textContent).toBe('cpu')
    expect(within(current as HTMLElement).getByText('top')).toBeInTheDocument()
    expect(advance()).toBeEnabled()
  })

  it('top fora da netlist é rejeitado com erro seguro', async () => {
    await synthesize({ ...multiOk, top_module: 'inventado' })
    expect(await within(screen.getByRole('region', { name: 'Síntese Yosys' })).findByRole('alert')).toHaveTextContent(
      TOP_MESSAGES.invalid,
    )
    expect(within(topPanel()).queryByRole('list')).toBeNull()
    expect(within(topPanel()).getByText(/netlist indisponível/i)).toBeInTheDocument()
    expect(advance()).toBeDisabled()
  })

  it('backend sem top_module: cliente não inventa um', async () => {
    await synthesize({ ...multiOk, top_module: null })
    expect(await within(screen.getByRole('region', { name: 'Síntese Yosys' })).findByRole('alert')).toHaveTextContent(
      TOP_MESSAGES.missing,
    )
    expect(within(topPanel()).queryByText('cpu')).toBeNull()
    expect(advance()).toBeDisabled()
  })

  it('netlist sem candidatos (só caixas-pretas) é erro', async () => {
    await synthesize({
      ...multiOk,
      top_module: 'bb',
      netlist_content: { creator: 'Y', modules: { bb: mod({ blackbox: '1' }) } },
    })
    expect(await within(screen.getByRole('region', { name: 'Síntese Yosys' })).findByRole('alert')).toHaveTextContent(
      TOP_MESSAGES.invalid,
    )
    expect(advance()).toBeDisabled()
  })

  it('estado com top inválido (seleção inválida) mostra erro e bloqueia o avanço', () => {
    renderApp({ initialState: synthesizedState({ step: 2, topModule: 'nao_existe' }) })
    expect(within(topPanel()).getByRole('alert')).toHaveTextContent(/módulo top inválido/i)
    expect(advance()).toBeDisabled()
  })
})
