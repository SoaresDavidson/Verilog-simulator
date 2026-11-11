import { useId, useMemo } from 'react'
import { GlyphOtherFile, GlyphSourceFile, GlyphTestbenchFile, IconFolder } from '../../components/icons'
import { formatBytes } from '../../lib/format'
import type { IdentifiedFiles, ProjectFileKind } from '../../state/session'
import { buildFileTree, summarizeTree, type DirNode } from './fileTree'

const KIND_LABEL: Record<ProjectFileKind, string> = {
  source: 'sintetizável',
  testbench: 'testbench',
  other: 'ignorado',
}

function DirList({ node, label }: { node: DirNode; label: string }) {
  return (
    <ul className="syn-tree__list" aria-label={label}>
      {node.dirs.map((dir) => (
        <li key={dir.path} className="syn-tree__dir">
          <span className="d syn-tree__dirname" title={dir.path}>
            <IconFolder size={16} />
            {dir.name}/
          </span>
          <DirList node={dir} label={`Conteúdo de ${dir.path}`} />
        </li>
      ))}
      {node.files.map((file) => (
        <li key={file.path} className={`f syn-tree__file syn-tree__file--${file.kind}`} data-kind={file.kind}>
          {file.kind === 'source' ? <GlyphSourceFile size={22} /> : file.kind === 'testbench' ? <GlyphTestbenchFile size={22} /> : <GlyphOtherFile size={22} />}
          <span className="nm" title={file.path}>
            {file.name}
          </span>
          {file.kind !== 'other' && <span className={`tag tag--${file.kind}`}>{KIND_LABEL[file.kind]}</span>}
          {file.extension && <span className="syn-ext">.{file.extension}</span>}
          {file.kind === 'other' && <span className="sr-only">(ignorado pela síntese)</span>}
          <span className="sz">{formatBytes(file.size)}</span>
        </li>
      ))}
    </ul>
  )
}

export interface FileTreeProps {
  files: IdentifiedFiles | null
  /** Ação para enviar outro projeto (estado vazio / sem fontes). */
  onReupload?: () => void
}

/**
 * Tela 2a (#26) — árvore de arquivos do projeto agrupada por diretório.
 * Fonte: preview do cliente; a síntese usa os arquivos enviados ao servidor.
 */
export function FileTree({ files, onReupload }: FileTreeProps) {
  const headingId = useId()
  const tree = useMemo(() => buildFileTree(files?.items ?? []), [files])
  const summary = useMemo(() => summarizeTree(tree), [tree])

  const reupload = onReupload && (
    <button type="button" className="btn bs bsm" onClick={onReupload}>
      Enviar outro projeto
    </button>
  )

  let body
  if (!files) {
    body = (
      <p className="muted syn-empty">
        Lista de arquivos indisponível nesta sessão. A síntese usa os arquivos enviados ao servidor.
      </p>
    )
  } else if (summary.total === 0) {
    body = (
      <div className="syn-empty" role="note">
        <p>Nenhum arquivo encontrado no projeto. Envie um ZIP com módulos .v ou .sv.</p>
        {reupload}
      </div>
    )
  } else {
    body = (
      <>
        {summary.sources === 0 && (
          <div className="state-error syn-empty" role="note">
            <p>
              Nenhuma fonte sintetizável encontrada (.v/.sv fora de testbench). A síntese vai falhar: envie um ZIP com
              ao menos um módulo de projeto.
            </p>
            {reupload}
          </div>
        )}
        <div className="ft syn-tree">
          <DirList node={tree} label="Arquivos do projeto" />
        </div>
        <p className="muted syn-tree__legend">
          <span className="syn-tree__key">
            <GlyphSourceFile size={18} /> sintetizável
          </span>
          <span className="syn-tree__key">
            <GlyphTestbenchFile size={18} /> testbench: nome com <code>tb_</code> ou caminho com <code>testbench</code>
          </span>
        </p>
        {files.origin === 'client-preview' && (
          <p className="muted syn-tree__legend">Lista lida do ZIP no navegador; a síntese usa os arquivos do servidor.</p>
        )}
      </>
    )
  }

  return (
    <section className="card syn-files" aria-labelledby={headingId}>
      <div className="ch">
        <h2 id={headingId}>Arquivos</h2>
        {files && summary.total > 0 && (
          <span className="count syn-meta">
            {summary.sources} fonte{summary.sources === 1 ? '' : 's'} · {summary.testbenches} testbench
            {summary.testbenches === 1 ? '' : 'es'}
          </span>
        )}
      </div>
      {body}
    </section>
  )
}
