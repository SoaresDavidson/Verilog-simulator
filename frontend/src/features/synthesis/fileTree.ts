/**
 * Árvore de arquivos do projeto (#26), derivada da lista plana `state.files`.
 * Função pura: mesma entrada, mesma árvore (ordenação determinística,
 * independente de locale e da ordem do ZIP).
 */
import type { ProjectFile, ProjectFileKind } from '../../state/session'
import { classifyFile } from '../upload/validateProjectZip'

export type HdlExtension = 'v' | 'sv'

export interface FileLeaf {
  /** Caminho completo normalizado (chave estável). */
  path: string
  name: string
  size: number
  /** `.v`/`.sv` reconhecido, ou `null` para outros arquivos. */
  extension: HdlExtension | null
  /** Regra do backend: nome contém `tb_` ou caminho contém `testbench`. */
  kind: ProjectFileKind
}

export interface DirNode {
  /** Caminho do diretório com barra final (`''` na raiz). */
  path: string
  name: string
  dirs: DirNode[]
  files: FileLeaf[]
}

export interface FileTreeSummary {
  total: number
  sources: number
  testbenches: number
  others: number
}

/** Ordenação por ponto de código (não depende de locale), sem diferenciar caixa e com desempate exato. */
export function compareNames(a: string, b: string): number {
  const la = a.toLowerCase()
  const lb = b.toLowerCase()
  if (la !== lb) return la < lb ? -1 : 1
  if (a === b) return 0
  return a < b ? -1 : 1
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.')
    .join('/')
}

export function hdlExtension(path: string): HdlExtension | null {
  const match = /\.(v|sv)$/i.exec(path)
  return match ? (match[1].toLowerCase() as HdlExtension) : null
}

/** Agrupa os arquivos por diretório. Entradas de diretório e duplicatas são ignoradas. */
export function buildFileTree(files: readonly ProjectFile[]): DirNode {
  const root: DirNode = { path: '', name: '', dirs: [], files: [] }
  const dirIndex = new Map<string, DirNode>([['', root]])
  const seen = new Set<string>()

  for (const file of files) {
    if (file.path.endsWith('/')) continue
    const path = normalizePath(file.path)
    if (path === '' || seen.has(path)) continue
    seen.add(path)

    const parts = path.split('/')
    const name = parts.pop() as string
    let parent = root
    let prefix = ''
    for (const part of parts) {
      prefix += `${part}/`
      let dir = dirIndex.get(prefix)
      if (!dir) {
        dir = { path: prefix, name: part, dirs: [], files: [] }
        dirIndex.set(prefix, dir)
        parent.dirs.push(dir)
      }
      parent = dir
    }
    parent.files.push({
      path,
      name,
      size: Number.isFinite(file.size) && file.size >= 0 ? file.size : 0,
      extension: hdlExtension(name),
      kind: classifyFile(path),
    })
  }

  const sortNode = (node: DirNode) => {
    node.dirs.sort((a, b) => compareNames(a.name, b.name))
    node.files.sort((a, b) => compareNames(a.name, b.name))
    node.dirs.forEach(sortNode)
  }
  sortNode(root)
  return root
}

export function summarizeTree(root: DirNode): FileTreeSummary {
  const summary: FileTreeSummary = { total: 0, sources: 0, testbenches: 0, others: 0 }
  const visit = (node: DirNode) => {
    for (const file of node.files) {
      summary.total += 1
      if (file.kind === 'source') summary.sources += 1
      else if (file.kind === 'testbench') summary.testbenches += 1
      else summary.others += 1
    }
    node.dirs.forEach(visit)
  }
  visit(root)
  return summary
}
