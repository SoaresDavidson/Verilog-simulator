import { useId } from 'react'
import { GlyphOtherFile, GlyphSourceFile, GlyphTestbenchFile, IconInfo } from '../../components/icons'
import { formatBytes } from '../../lib/format'
import type { ProjectFile, ProjectFileKind } from '../../state/session'

const KIND_LABEL: Record<ProjectFileKind, string> = {
  source: 'fonte',
  testbench: 'testbench',
  other: 'outro',
}

const KIND_ICON = { source: GlyphSourceFile, testbench: GlyphTestbenchFile, other: GlyphOtherFile }

export interface FilePreviewProps {
  title: string
  subtitle?: string
  files: ProjectFile[]
  /** Aviso sobre a origem da lista (ex.: derivada do ZIP no cliente). */
  note?: string
}

/** Lista de arquivos do projeto (preview). Não é fonte para a síntese. */
export function FilePreview({ title, subtitle, files, note }: FilePreviewProps) {
  const headingId = useId()
  const sources = files.filter((f) => f.kind === 'source').length
  const testbenches = files.filter((f) => f.kind === 'testbench').length

  return (
    <section className="card file-preview" aria-labelledby={headingId}>
      <div className="ch">
        <h2 id={headingId} className="file-preview__title">
          {title}
        </h2>
        <span className="count file-preview__meta">
          {subtitle ? `${subtitle} · ` : ''}
          {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'} · {sources} fonte{sources === 1 ? '' : 's'}
          {testbenches > 0 ? ` · ${testbenches} testbench${testbenches === 1 ? '' : 'es'}` : ''}
        </span>
      </div>
      <ul className="ft file-preview__list" aria-label={`Arquivos de ${title}`}>
        {files.map((file) => {
          const slash = file.path.lastIndexOf('/')
          const dir = slash >= 0 ? file.path.slice(0, slash + 1) : ''
          const name = file.path.slice(slash + 1)
          const Glyph = KIND_ICON[file.kind]
          return (
            <li key={file.path} className={`f f--${file.kind}`}>
              <Glyph size={22} />
              <span className="nm" title={file.path}>
                {dir && <span className="muted">{dir}</span>}
                {name}
              </span>
              <span className={`tag tag--${file.kind}`}>{KIND_LABEL[file.kind]}</span>
              <span className="sz">{formatBytes(file.size)}</span>
            </li>
          )
        })}
      </ul>
      {note && (
        <p className="file-preview__note muted">
          <IconInfo size={16} />
          {note}
        </p>
      )}
    </section>
  )
}
