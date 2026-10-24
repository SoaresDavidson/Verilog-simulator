import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { parseNetlist, type NetlistGraph } from '../netlist/parse'
import { chainNetlist, simpleNetlist } from '../test/netlists'
import { DatapathDiagram } from './DatapathDiagram'

function graphOf(netlist = simpleNetlist): NetlistGraph {
  const graph = parseNetlist(netlist)
  if (!graph) throw new Error('netlist sem módulo')
  return graph
}

describe('DatapathDiagram', () => {
  it('renderiza portas e células como elementos navegáveis, com minimapa e legenda', () => {
    const { container } = render(<DatapathDiagram graph={graphOf()} />)
    const region = screen.getByRole('region', { name: /Diagrama do módulo and2/ })
    expect(within(region).getByRole('button', { name: /\ba, 1 bit/ })).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: /\by, 1 bit/ })).toBeInTheDocument()
    expect(within(region).getByRole('button', { name: /tipo \$and/ })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-edge]').length).toBeGreaterThan(0)
    expect(screen.getByTestId('minimap')).toBeInTheDocument()
    const legend = screen.getByRole('note', { name: /Legenda/ })
    for (const state of ['0', '1', 'X', 'Z']) expect(legend).toHaveTextContent(state)
  })

  it('clicar num nó abre o painel de propriedades e fechar limpa a seleção', async () => {
    const user = userEvent.setup()
    render(<DatapathDiagram graph={graphOf()} />)
    await user.click(screen.getByRole('button', { name: /tipo \$and/ }))
    expect(screen.getByRole('button', { name: 'Fechar propriedades' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fechar propriedades' }))
    expect(screen.queryByRole('button', { name: 'Fechar propriedades' })).not.toBeInTheDocument()
  })

  it('zoom altera o viewport refletido no minimapa', async () => {
    const user = userEvent.setup()
    render(<DatapathDiagram graph={graphOf()} />)
    const viewport = screen.getByTestId('minimap-viewport')
    const before = viewport.getAttribute('width')
    await user.click(screen.getByRole('button', { name: 'Aproximar' }))
    expect(viewport.getAttribute('width')).not.toBe(before)
  })

  it('aplica valores simulados e destaca sinais selecionados', () => {
    const { container } = render(
      <DatapathDiagram graph={graphOf()} values={{ y: '1', 'and2.y': '1' }} selectedSignals={['and2.y']} />,
    )
    expect(container.querySelector('.dp-v--1')).not.toBeNull()
    expect(container.querySelector('.dp-edge--sig, .dp-node--sig')).not.toBeNull()
  })

  it('estruturas grandes usam fallback até o usuário pedir o desenho', async () => {
    const user = userEvent.setup()
    render(<DatapathDiagram graph={graphOf(chainNetlist(20))} maxNodes={5} />)
    expect(screen.getByRole('status')).toHaveTextContent(/grande demais/)
    await user.click(screen.getByRole('button', { name: 'Desenhar assim mesmo' }))
    expect(screen.getByRole('region', { name: /Diagrama do módulo/ })).toBeInTheDocument()
  })
})
