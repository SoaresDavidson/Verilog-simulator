import { useState, type ReactNode } from 'react'

export const PAGE_SIZE = 50

export interface SectionProps<T> {
  title: string
  items: readonly T[]
  /** Mensagem quando não há itens. */
  empty: string
  render: (visible: readonly T[]) => ReactNode
  defaultOpen?: boolean
}

/**
 * Seção recolhível (`<details>`) com paginação incremental. O conteúdo só é
 * montado quando aberta, para netlists grandes não travarem a página.
 * Remonte com `key` para reiniciar a paginação.
 */
export function Section<T>({ title, items, empty, render, defaultOpen = true }: SectionProps<T>) {
  const [open, setOpen] = useState(defaultOpen)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const visible = items.length > limit ? items.slice(0, limit) : items
  const remaining = items.length - visible.length

  return (
    <details className="nx-sec card" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="nx-sec__sum">
        <h3>{title}</h3>
        <span className="nx-count">{items.length}</span>
      </summary>
      {open &&
        (items.length === 0 ? (
          <p className="muted nx-empty">{empty}</p>
        ) : (
          <>
            {render(visible)}
            {remaining > 0 && (
              <button type="button" className="btn bs bsm nx-page" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                Mostrar mais {Math.min(PAGE_SIZE, remaining)} (restam {remaining})
              </button>
            )}
          </>
        ))}
    </details>
  )
}
