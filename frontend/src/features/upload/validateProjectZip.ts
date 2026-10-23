import { MAX_UPLOAD_BYTES } from '../../config'
import { formatBytes } from '../../lib/format'
import type { ProjectFile, ProjectFileKind } from '../../state/session'
import { readZipEntries, ZipFormatError } from './zipInspect'

export type ZipValidation = { ok: true; files: ProjectFile[] } | { ok: false; message: string }

const VERILOG_EXT = /\.(v|sv)$/i

function isIgnored(path: string): boolean {
  const name = path.split('/').pop() ?? ''
  return path.startsWith('__MACOSX/') || name.startsWith('._') || name === '.DS_Store'
}

function isUnsafePath(path: string): boolean {
  return path.startsWith('/') || /^[a-z]:/i.test(path) || path.split('/').includes('..')
}

/** Mesma regra do backend (`integrations/yosys.py::_find_verilog_sources`). */
export function classifyFile(path: string): ProjectFileKind {
  if (!VERILOG_EXT.test(path)) return 'other'
  const name = (path.split('/').pop() ?? '').toLowerCase()
  if (name.includes('tb_') || path.toLowerCase().includes('testbench')) return 'testbench'
  return 'source'
}

/**
 * Valida extensão, tamanho e conteúdo do ZIP antes do envio e devolve a
 * lista de arquivos para preview (nunca usada como fonte da síntese).
 */
export async function validateProjectZip(file: File, maxBytes = MAX_UPLOAD_BYTES): Promise<ZipValidation> {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    return { ok: false, message: 'Selecione um arquivo com extensão .zip.' }
  }
  if (file.size === 0) {
    return { ok: false, message: 'O arquivo está vazio.' }
  }
  if (file.size > maxBytes) {
    return {
      ok: false,
      message: `O arquivo tem ${formatBytes(file.size)}; o limite é ${formatBytes(maxBytes)}.`,
    }
  }

  let entries
  try {
    entries = await readZipEntries(file)
  } catch (error) {
    const message = error instanceof ZipFormatError ? error.message : 'Não foi possível ler o arquivo ZIP.'
    return { ok: false, message }
  }

  const visible = entries.filter((entry) => !entry.isDirectory && !isIgnored(entry.path))
  if (visible.some((entry) => isUnsafePath(entry.path))) {
    return { ok: false, message: 'O ZIP contém caminhos inválidos (absolutos ou com "..").' }
  }

  const files: ProjectFile[] = visible
    .map((entry) => ({ path: entry.path, size: entry.size, kind: classifyFile(entry.path) }))
    .sort((a, b) => a.path.localeCompare(b.path))

  if (!files.some((f) => f.kind !== 'other')) {
    return { ok: false, message: 'O ZIP não contém arquivos Verilog (.v) ou SystemVerilog (.sv).' }
  }
  return { ok: true, files }
}
