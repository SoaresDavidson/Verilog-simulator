import { describe, expect, it } from 'vitest'
import type { ProjectFile } from '../../state/session'
import { buildFileTree, compareNames, hdlExtension, summarizeTree, type DirNode } from './fileTree'

const f = (path: string, size = 10): ProjectFile => ({ path, size, kind: 'other' })

/** Lista achatada `dir/` e `dir/arquivo` na ordem de renderização. */
function flatten(node: DirNode): string[] {
  const out: string[] = []
  for (const dir of node.dirs) {
    out.push(dir.path)
    out.push(...flatten(dir))
  }
  for (const file of node.files) out.push(file.path)
  return out
}

describe('buildFileTree', () => {
  it('agrupa diretórios aninhados com diretórios antes de arquivos', () => {
    const tree = buildFileTree([f('rtl/cpu/alu.v'), f('top.v'), f('rtl/cpu/regs.sv'), f('rtl/mux.v'), f('sim/tb_top.v')])
    expect(flatten(tree)).toEqual([
      'rtl/',
      'rtl/cpu/',
      'rtl/cpu/alu.v',
      'rtl/cpu/regs.sv',
      'rtl/mux.v',
      'sim/',
      'sim/tb_top.v',
      'top.v',
    ])
  })

  it('ordenação é determinística independente da ordem de entrada', () => {
    const files = [f('B/x.v'), f('a/Z.v'), f('a/b.v'), f('A2/c.v'), f('a/B.v')]
    const expected = flatten(buildFileTree(files))
    expect(flatten(buildFileTree([...files].reverse()))).toEqual(expected)
    expect(flatten(buildFileTree([files[2], files[0], files[4], files[1], files[3]]))).toEqual(expected)
    expect(expected).toEqual(['a/', 'a/B.v', 'a/b.v', 'a/Z.v', 'A2/', 'A2/c.v', 'B/', 'B/x.v'])
  })

  it('identifica extensões .v e .sv (qualquer caixa) e ignora outras', () => {
    expect(hdlExtension('a/x.v')).toBe('v')
    expect(hdlExtension('a/x.SV')).toBe('sv')
    expect(hdlExtension('a/x.vh')).toBeNull()
    expect(hdlExtension('README.md')).toBeNull()
    const tree = buildFileTree([f('a.v'), f('b.sv'), f('c.txt')])
    expect(tree.files.map((x) => x.extension)).toEqual(['v', 'sv', null])
  })

  it('classifica testbench com a regra do backend (tb_ no nome ou testbench no caminho)', () => {
    const tree = buildFileTree([
      f('src/alu.v'),
      f('src/tb_alu.v'),
      f('Testbench/check.sv'),
      f('src/alu_tb.v'),
      f('docs/tb_notes.txt'),
    ])
    const kinds = Object.fromEntries(
      flatten(tree)
        .filter((p) => !p.endsWith('/'))
        .map((p) => {
          const find = (n: DirNode): string | undefined =>
            n.files.find((x) => x.path === p)?.kind ?? n.dirs.map(find).find(Boolean)
          return [p, find(tree)]
        }),
    )
    expect(kinds).toEqual({
      'src/alu.v': 'source',
      'src/tb_alu.v': 'testbench',
      'Testbench/check.sv': 'testbench',
      'src/alu_tb.v': 'source',
      'docs/tb_notes.txt': 'other',
    })
  })

  it('ignora entradas de diretório, duplicatas e normaliza separadores', () => {
    const tree = buildFileTree([f('src/'), f('./src//a.v'), f('src\\a.v'), f('src/a.v')])
    expect(flatten(tree)).toEqual(['src/', 'src/a.v'])
  })

  it('resume fontes, testbenches e outros', () => {
    const summary = summarizeTree(buildFileTree([f('a.v'), f('tb_a.v'), f('x.txt'), f('d/b.sv')]))
    expect(summary).toEqual({ total: 4, sources: 2, testbenches: 1, others: 1 })
  })

  it('compareNames não depende de locale', () => {
    expect(['b', 'B', 'a', 'á'].sort(compareNames)).toEqual(['a', 'B', 'b', 'á'])
  })
})
