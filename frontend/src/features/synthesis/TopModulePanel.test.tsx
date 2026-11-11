import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Netlist, SynthesisResponse } from '../../api/types'
import { synthesisOk, synthesizedState, uploadedState } from '../../test/fixtures'
import { createFetchMock, jsonResponse, type FetchMock } from '../../test/http'
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
    // Top e síntese confirmados: o que falta para avançar é só a seleção de sinais.
    expect(screen.getByText('Selecione pelo menos 1 sinal.', { selector: '#syn-advance-reason' })).toBeInTheDocument()
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

/** Netlist depois de `hierarchy -top alu`: só a hierarquia de `alu` fica. */
const aluOnly: SynthesisResponse = {
  ...synthesisOk,
  top_module: 'alu',
  netlist_content: { creator: 'Yosys', modules: { alu: mod({ top: '1' }) } },
}

/** Corpos JSON enviados a `mapear-processador`, em ordem. */
function synthesisBodies(fetch: FetchMock): unknown[] {
  return fetch.mock.calls
    .filter(([input]) => String(input).endsWith('/verilog/mapear-processador'))
    .map(([, init]) => JSON.parse(String(init?.body)))
}

const synthButton = () => within(screen.getByRole('region', { name: 'Síntese Yosys' })).getByRole('button')
const radio = (name: string) => within(topPanel()).getByRole('radio', { name })

async function synthesizeAuto(...responses: unknown[]) {
  const user = userEvent.setup()
  const fetch = createFetchMock()
  for (const response of [multiOk, ...responses]) fetch.mockResolvedValueOnce(jsonResponse(200, response))
  renderApp({ initialState: uploadedState({ step: 2 }), fetch })
  await user.click(synthButton())
  await within(topPanel()).findByRole('list', { name: 'Módulos encontrados na netlist' })
  return { user, fetch }
}

describe('Tela 2b — escolha explícita do top (#27)', () => {
  it('escolher outro módulo ressintetiza com top_module e mantém a lista da síntese automática', async () => {
    const { user, fetch } = await synthesizeAuto(aluOnly)
    expect(radio('cpu')).toBeChecked()

    await user.click(radio('alu'))

    expect(await within(topPanel()).findByText(/hierarchy -top alu/)).toBeInTheDocument()
    expect(radio('alu')).toBeChecked()
    // `regfile` e `cpu` saíram da netlist, mas continuam escolhíveis.
    expect(within(topPanel()).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual([
      'alu',
      'cpu',
      'regfile',
    ])
    expect(synthesisBodies(fetch)).toEqual([
      { project_id: expect.any(String) },
      { project_id: expect.any(String), top_module: 'alu' },
    ])
  })

  it('"Sintetizar novamente" repete o top escolhido e "Usar top automático" volta ao auto-top', async () => {
    const { user, fetch } = await synthesizeAuto(aluOnly, aluOnly, multiOk)
    await user.click(radio('alu'))
    await within(topPanel()).findByText(/hierarchy -top alu/)

    await user.click(synthButton())
    await within(topPanel()).findByText(/hierarchy -top alu/)
    await user.click(within(topPanel()).getByRole('button', { name: 'Usar top automático' }))

    expect(await within(topPanel()).findByText(/hierarchy -auto-top/)).toBeInTheDocument()
    expect(radio('cpu')).toBeChecked()
    expect(within(topPanel()).queryByRole('button', { name: 'Usar top automático' })).toBeNull()
    const bodies = synthesisBodies(fetch) as Array<Record<string, unknown>>
    expect(bodies.map((b) => b.top_module)).toEqual([undefined, 'alu', 'alu', undefined])
  })

  it('backend devolvendo top diferente do pedido é erro e bloqueia o avanço', async () => {
    const { user } = await synthesizeAuto(multiOk)
    await user.click(radio('alu'))

    expect(await within(screen.getByRole('region', { name: 'Síntese Yosys' })).findByRole('alert')).toHaveTextContent(
      TOP_MESSAGES.mismatch,
    )
    expect(advance()).toBeDisabled()
  })

  it('falha da síntese com top escolhido mantém a lista para escolher outro ou voltar ao automático', async () => {
    const { user } = await synthesizeAuto({ ...synthesisOk, success: false, top_module: null, netlist_content: null })
    await user.click(radio('regfile'))

    await within(screen.getByRole('region', { name: 'Síntese Yosys' })).findByRole('alert')
    expect(within(topPanel()).getByText(/netlist indisponível/i)).toBeInTheDocument()
    expect(within(topPanel()).getAllByRole('radio')).toHaveLength(3)
    expect(within(topPanel()).getAllByRole('radio').some((r) => (r as HTMLInputElement).checked)).toBe(false)
    expect(within(topPanel()).getByRole('button', { name: 'Usar top automático' })).toBeEnabled()
    expect(advance()).toBeDisabled()
  })

  it('top pedido fora dos candidatos não chega ao backend', async () => {
    const user = userEvent.setup()
    const fetch = createFetchMock()
    renderApp({ initialState: synthesizedState({ step: 2, topRequest: 'fantasma', topCandidates: ['top'] }), fetch })

    await user.click(synthButton())

    expect(await within(screen.getByRole('region', { name: 'Síntese Yosys' })).findByRole('alert')).toHaveTextContent(
      TOP_MESSAGES.notCandidate,
    )
    expect(synthesisBodies(fetch)).toEqual([])
    expect(advance()).toBeDisabled()
  })
})
