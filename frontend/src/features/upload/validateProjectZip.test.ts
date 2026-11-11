import { describe, expect, it } from 'vitest'
import { zipFile } from '../../test/zip'
import { classifyFile, validateProjectZip } from './validateProjectZip'

describe('validateProjectZip', () => {
  it('lista arquivos e classifica fontes/testbenches como o backend', async () => {
    const result = await validateProjectZip(
      zipFile([
        { name: 'src/', content: '' },
        { name: 'src/top.v', content: 'module top; endmodule' },
        { name: 'tb/tb_top.sv', content: 'module tb; endmodule' },
        { name: 'README.md', content: '#' },
        { name: '__MACOSX/src/._top.v', content: '' },
      ]),
    )
    expect(result).toEqual({
      ok: true,
      files: [
        { path: 'README.md', size: 1, kind: 'other' },
        { path: 'src/top.v', size: 21, kind: 'source' },
        { path: 'tb/tb_top.sv', size: 20, kind: 'testbench' },
      ],
    })
    expect(classifyFile('testbench/cpu.v')).toBe('testbench')
  })

  it('rejeita extensão, tamanho, conteúdo e ZIP sem Verilog', async () => {
    expect(await validateProjectZip(new File(['x'], 'a.rar'))).toMatchObject({ ok: false, message: expect.stringMatching(/\.zip/) })
    expect(await validateProjectZip(zipFile([{ name: 'a.v', content: 'x'.repeat(200) }]), 100)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/limite/),
    })
    expect(await validateProjectZip(new File(['isto não é zip, só texto qualquer'], 'a.zip'))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/ZIP válido/),
    })
    expect(await validateProjectZip(zipFile([{ name: 'doc.txt', content: 'x' }]))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/\.v/),
    })
    expect(await validateProjectZip(zipFile([{ name: '../evil.v', content: 'x' }]))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/caminhos inválidos/),
    })
  })
})
