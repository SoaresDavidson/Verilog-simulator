import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Netlist } from '../../../api/types'
import { renderApp } from '../../../test/render'
import { synthesizedState } from '../../../test/fixtures'
import { buildNetlistModel } from '../netlist/model'
import { emptyNetlist, hierNetlist, simpleNetlist, synthesisWith } from '../test/netlists'
import { NetlistExplorer } from './NetlistExplorer'

function Harness({ netlist }: { netlist: Netlist }) {
  const model = buildNetlistModel(netlist)
  const [sel, setSel] = useState<string | null>(model.top)
  return <NetlistExplorer model={model} selectedModule={sel} onSelectModule={setSel} />
}

const modList = () => screen.getByRole('navigation', { name: 'Lista de módulos' })

describe('NetlistExplorer', () => {
  it('módulo simples: top destacado, portas com direção e largura, célula com conexões', async () => {
    const user = userEvent.setup()
    render(<Harness netlist={simpleNetlist} />)

    expect(screen.getByRole('heading', { level: 2, name: /and2.*TOP/ })).toBeInTheDocument()
    expect(within(modList()).getByRole('button', { name: /and2/ })).toHaveAttribute('aria-current', 'true')

    const portRow = screen.getByRole('row', { name: /^a entrada 1 bit/ })
    expect(portRow).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /^y saída 1 bit/ })).toBeInTheDocument()

    await user.click(screen.getByText('$and$and2.v:3$1'))
    const conns = screen.getByRole('table', { name: /conexões de \$and/i })
    expect(within(conns).getByRole('row', { name: /^Y saída 1 bit/ })).toBeInTheDocument()
    expect(screen.getByText('A_WIDTH').nextSibling).toHaveTextContent('1')
  })

  it('hierarquia: lista submódulos e navega entre eles', async () => {
    const user = userEvent.setup()
    render(<Harness netlist={hierNetlist} />)

    const items = within(modList()).getAllByRole('button').map((b) => b.textContent)
    expect(items).toEqual(['cpuTOP', 'alu', 'idle'])

    await user.click(screen.getByText('u_alu'))
    await user.click(screen.getByRole('button', { name: 'Abrir módulo alu' }))
    expect(screen.getByRole('heading', { level: 2, name: 'alu' })).toBeInTheDocument()
    expect(screen.getByText(/instanciado em/i)).toHaveTextContent('cpu (u_alu)')

    await user.click(within(modList()).getByRole('button', { name: 'idle' }))
    expect(screen.getByText('Módulo sem células.')).toBeInTheDocument()
  })

  it('barramentos exibem largura e todos os bits', () => {
    render(<Harness netlist={hierNetlist} />)
    expect(screen.getByRole('row', { name: /^a entrada 8 bits/ })).toBeInTheDocument()
    const bits = screen.getByRole('list', { name: /bits de fio alu_out/i })
    expect(within(bits).getAllByRole('button')).toHaveLength(8)
  })

  it('constantes 0/1/x/z são distinguíveis de fios', async () => {
    const user = userEvent.setup()
    render(<Harness netlist={hierNetlist} />)
    await user.click(screen.getByText('$mux$cpu.v:10$4'))
    await user.click(screen.getByText('$eq$cpu.v:9$2'))

    expect(screen.getByLabelText('bit 0: constante X (indefinido)')).toHaveClass('b0', 'sx')
    expect(screen.getByLabelText('bit 0: constante Z (alta impedância)')).toHaveClass('b0', 'sz')
    expect(screen.getByLabelText('bit 0: constante 1 (alto)')).toHaveClass('b0', 's1')
    expect(screen.getAllByLabelText(/constante 0 \(baixo\)/)[0]).toHaveClass('b0', 's0')
    // Fios são botões de correlação, constantes não.
    expect(screen.getAllByRole('button', { name: /^bit 0: net 2$/ }).length).toBeGreaterThan(0)
  })

  it('correlaciona um bit com portas, fios e células', async () => {
    const user = userEvent.setup()
    render(<Harness netlist={hierNetlist} />)
    const clkBits = screen.getByRole('list', { name: /bits de porta clk/i })
    await user.click(within(clkBits).getByRole('button', { name: 'bit 0: net 2' }))

    const status = screen.getByText('Net 2').closest('[role="status"]') as HTMLElement
    expect(status).toHaveTextContent('porta clk[0]')
    expect(status).toHaveTextContent('fio clk[0]')
    expect(status).toHaveTextContent('célula $procdff$3, porta CLK[0]')
    expect(within(clkBits).getByRole('button', { name: 'bit 0: net 2' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('busca localiza módulos, células e sinais por nome', async () => {
    const user = userEvent.setup()
    render(<Harness netlist={hierNetlist} />)
    const search = screen.getByRole('searchbox', { name: /buscar/i })

    await user.type(search, '$add')
    expect(within(modList()).getAllByRole('button').map((b) => b.textContent)).toEqual(['alu1'])

    await user.clear(search)
    await user.type(search, 'alu_out')
    expect(screen.getByRole('row', { name: /^alu_out/ })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /^clk/ })).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'nada-disso')
    expect(screen.getByText('Nenhum resultado.')).toBeInTheDocument()
  })

  it('netlist vazio mostra mensagem clara', () => {
    render(<Harness netlist={emptyNetlist} />)
    expect(screen.getByRole('status')).toHaveTextContent(/não contém módulos/i)
  })
})

describe('DatapathScreen (estrutura)', () => {
  it('mostra a estrutura do netlist sintetizado', () => {
    renderApp({
      initialState: synthesizedState({ step: 3, synthesis: { status: 'success', result: synthesisWith(hierNetlist, 'cpu'), error: null } }),
    })
    expect(screen.getByRole('heading', { level: 1, name: 'Caminho de Dados' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /cpu/ })).toBeInTheDocument()
  })
})
