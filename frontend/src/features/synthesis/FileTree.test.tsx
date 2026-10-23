import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { initialSessionState } from '../../state/session'
import { PROJECT_ID, uploadedState } from '../../test/fixtures'
import { renderApp } from '../../test/render'

function filesState(paths: Array<[string, 'source' | 'testbench' | 'other']>) {
  return uploadedState({
    step: 2,
    files: { origin: 'client-preview', items: paths.map(([path, kind]) => ({ path, size: 100, kind })) },
  })
}

describe('Tela 2a — árvore de arquivos (#26)', () => {
  it('renderiza diretórios aninhados, extensões e distinção testbench/sintetizável', () => {
    renderApp({
      initialState: filesState([
        ['rtl/core/alu.sv', 'source'],
        ['rtl/top.v', 'source'],
        ['sim/tb_top.v', 'testbench'],
        ['README.md', 'other'],
      ]),
    })
    const root = screen.getByRole('list', { name: 'Arquivos do projeto' })
    const rtl = within(root).getByRole('list', { name: 'Conteúdo de rtl/' })
    const core = within(rtl).getByRole('list', { name: 'Conteúdo de rtl/core/' })
    expect(within(core).getByText('alu.sv')).toBeInTheDocument()

    const alu = within(core).getByText('alu.sv').closest('li') as HTMLElement
    expect(alu).toHaveAttribute('data-kind', 'source')
    expect(within(alu).getByText('.sv')).toBeInTheDocument()
    expect(within(alu).getByText('sintetizável')).toBeInTheDocument()

    const tb = screen.getByText('tb_top.v').closest('li') as HTMLElement
    expect(tb).toHaveAttribute('data-kind', 'testbench')
    expect(within(tb).getByText('.v')).toBeInTheDocument()
    expect(within(tb).getByText('testbench')).toBeInTheDocument()

    const readme = screen.getByText('README.md').closest('li') as HTMLElement
    expect(readme).toHaveAttribute('data-kind', 'other')
    expect(within(readme).queryByText(/^\.s?v$/)).not.toBeInTheDocument()

    // Ordem determinística: diretórios (rtl, sim) antes do arquivo da raiz.
    const top = within(root).getAllByRole('listitem').filter((li) => li.parentElement === root)
    const label = (li: HTMLElement) =>
      (li.querySelector(':scope > .syn-tree__dirname, :scope > .nm') as HTMLElement).textContent?.replace('▾ ', '')
    expect(top.map(label)).toEqual(['rtl/', 'sim/', 'README.md'])
  })

  it('reclassifica pela regra do backend mesmo se o preview vier com kind diferente', () => {
    renderApp({ initialState: filesState([['bench/testbench_cpu.v', 'source']]) })
    expect(screen.getByText('testbench_cpu.v').closest('li')).toHaveAttribute('data-kind', 'testbench')
  })

  it('projeto sem fontes compatíveis mostra aviso acionável', async () => {
    const user = userEvent.setup()
    renderApp({ initialState: filesState([['sim/tb_top.v', 'testbench'], ['notes.txt', 'other']]) })
    expect(screen.getByText(/nenhuma fonte sintetizável/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enviar outro projeto' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Novo Projeto' })).toBeInTheDocument()
  })

  it('estado vazio sem arquivos mostra mensagem acionável', () => {
    renderApp({ initialState: filesState([]) })
    expect(screen.getByText(/nenhum arquivo encontrado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar outro projeto' })).toBeInTheDocument()
  })

  it('sem listagem disponível informa que a síntese usa o servidor', () => {
    renderApp({ initialState: uploadedState({ step: 2, files: null }) })
    expect(screen.getByText(/lista de arquivos indisponível/i)).toBeInTheDocument()
  })

  it('não permite avançar sem project_id válido', () => {
    renderApp({
      initialState: {
        ...initialSessionState,
        step: 2,
        session: { projectId: 'runs/../etc', sessionToken: 't', fileName: 'x.zip' },
        files: { origin: 'client-preview', items: [{ path: 'a.v', size: 1, kind: 'source' }] },
      },
    })
    expect(screen.getByRole('button', { name: /ver caminho de dados/i })).toBeDisabled()
    expect(screen.getByText(/sem projeto válido/i)).toBeInTheDocument()
  })

  it('com project_id válido mas sem síntese o avanço continua bloqueado', () => {
    renderApp({ initialState: filesState([['a.v', 'source']]) })
    expect(PROJECT_ID).toMatch(/^runs\//)
    expect(screen.getByRole('button', { name: /ver caminho de dados/i })).toBeDisabled()
  })
})
