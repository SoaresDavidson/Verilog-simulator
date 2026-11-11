import { useId, useMemo, useState } from 'react'
import {
  directionLabel,
  indexBitUses,
  widthLabel,
  type BitUse,
  type CellInfo,
  type ModuleInfo,
  type NetlistModel,
} from '../netlist/model'
import { BitList } from './BitList'
import { Section } from './Section'

export interface NetlistExplorerProps {
  model: NetlistModel
  selectedModule: string | null
  onSelectModule: (name: string) => void
}

function norm(text: string): string {
  return text.toLowerCase()
}

interface ModuleMatch {
  module: boolean
  ports: ModuleInfo['ports']
  cells: ModuleInfo['cells']
  nets: ModuleInfo['nets']
  total: number
}

function matchModule(m: ModuleInfo, q: string): ModuleMatch {
  if (!q) return { module: true, ports: m.ports, cells: m.cells, nets: m.nets, total: 0 }
  const ports = m.ports.filter((p) => norm(p.name).includes(q))
  const cells = m.cells.filter((c) => norm(c.name).includes(q) || norm(c.type).includes(q))
  const nets = m.nets.filter((n) => norm(n.name).includes(q))
  const module = norm(m.name).includes(q)
  return { module, ports, cells, nets, total: Number(module) + ports.length + cells.length + nets.length }
}

function describeUse(use: BitUse): string {
  switch (use.kind) {
    case 'port':
      return `porta ${use.name}[${use.index}]`
    case 'net':
      return `fio ${use.name}[${use.index}]`
    case 'cell':
      return `célula ${use.name}, porta ${use.pin}[${use.index}]`
  }
}

/**
 * Visualizador estrutural navegável (#21): módulos (top em destaque e
 * hierarquia), portas, células com parâmetros/conexões e fios, com busca,
 * correlação por índice de bit e seções recolhíveis paginadas.
 */
export function NetlistExplorer({ model, selectedModule, onSelectModule }: NetlistExplorerProps) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<{ module: string; bit: number } | null>(null)
  const q = norm(query.trim())

  const matches = useMemo(() => new Map(model.modules.map((m) => [m.name, matchModule(m, q)])), [model, q])
  const current = (selectedModule && model.byName.get(selectedModule)) || null
  const currentMatch = current ? matches.get(current.name) : undefined
  const focusedBit = focus && current && focus.module === current.name ? focus.bit : null
  const setFocusedBit = (bit: number | null) => setFocus(bit === null || !current ? null : { module: current.name, bit })
  const bitUses = useMemo(() => (current ? indexBitUses(current) : new Map<number, BitUse[]>()), [current])

  const parents = useMemo(() => {
    if (!current) return []
    return model.modules.flatMap((m) =>
      m.cells.filter((c) => c.submodule === current.name).map((c) => ({ module: m.name, cell: c.name })),
    )
  }, [model, current])

  if (model.modules.length === 0) {
    return (
      <div className="card placeholder" role="status">
        <p>O netlist não contém módulos.</p>
        <p className="muted">Verifique se o módulo top foi sintetizado corretamente e tente novamente.</p>
      </div>
    )
  }

  const visibleTree = q ? model.tree.filter((e) => (matches.get(e.name)?.total ?? 0) > 0) : model.tree
  const totalHits = q ? [...matches.values()].reduce((sum, m) => sum + m.total, 0) : 0
  const key = `${current?.name}|${q}`

  return (
    <div className="nx">
      <aside className="nx-side card" aria-label="Módulos do netlist">
        <label htmlFor={searchId} className="nx-label">
          Buscar módulos, células e sinais
        </label>
        <input
          id={searchId}
          type="search"
          className="nx-search"
          value={query}
          placeholder="ex.: alu, $add, clk"
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="nx-hits muted" role="status" aria-live="polite">
          {q ? (totalHits === 0 ? 'Nenhum resultado.' : `${totalHits} resultado(s) em ${visibleTree.length} módulo(s).`) : `${model.modules.length} módulo(s)`}
        </p>
        <nav aria-label="Lista de módulos">
          <ul className="nx-mods">
            {visibleTree.map(({ name, depth }) => {
              const mod = model.byName.get(name)!
              const hits = matches.get(name)?.total ?? 0
              return (
                <li key={name} style={{ paddingLeft: `${Math.min(depth, 6) * 12}px` }}>
                  <button
                    type="button"
                    className={`nx-mod${name === current?.name ? ' nx-mod--on' : ''}${mod.isTop ? ' nx-mod--top' : ''}`}
                    aria-current={name === current?.name ? 'true' : undefined}
                    onClick={() => onSelectModule(name)}
                  >
                    <span className="nx-mod__name">{name}</span>
                    {mod.isTop && <span className="nx-top">TOP</span>}
                    {q && <span className="nx-count" aria-label={`${hits} resultados`}>{hits}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>

      <div className="nx-main">
        {!current || !currentMatch ? (
          <div className="card placeholder" role="status">
            Selecione um módulo na lista.
          </div>
        ) : (
          <>
            <header className={`card nx-head${current.isTop ? ' nx-head--top' : ''}`}>
              <h2 className="nx-title">
                {current.name}
                {current.isTop && <span className="nx-top">TOP</span>}
              </h2>
              <p className="muted">
                {current.isTop ? 'Módulo de topo · ' : ''}
                {current.ports.length} porta(s) · {current.cells.length} célula(s) · {current.nets.length} fio(s)
              </p>
              {parents.length > 0 && (
                <p className="nx-parents">
                  Instanciado em:{' '}
                  {parents.map((p, i) => (
                    <span key={`${p.module}.${p.cell}`}>
                      {i > 0 && ', '}
                      <button type="button" className="nx-link" onClick={() => onSelectModule(p.module)}>
                        {p.module}
                      </button>{' '}
                      <span className="muted">({p.cell})</span>
                    </span>
                  ))}
                </p>
              )}
            </header>

            {focusedBit !== null && (
              <div className="card nx-focus" role="status" aria-live="polite">
                <div className="nx-focus__head">
                  <strong>Net {focusedBit}</strong>
                  <button type="button" className="btn bg bsm" onClick={() => setFocusedBit(null)}>
                    Limpar
                  </button>
                </div>
                <ul>
                  {(bitUses.get(focusedBit) ?? []).map((use, i) => (
                    <li key={i}>{describeUse(use)}</li>
                  ))}
                </ul>
              </div>
            )}

            <Section
              key={`p|${key}`}
              title="Portas"
              items={currentMatch.ports}
              empty={q ? 'Nenhuma porta corresponde à busca.' : 'Módulo sem portas.'}
              render={(ports) => (
                <div className="nx-scroll">
                  <table className="nx-table">
                    <thead>
                      <tr>
                        <th scope="col">Nome</th>
                        <th scope="col">Direção</th>
                        <th scope="col">Largura</th>
                        <th scope="col">Bits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ports.map((p) => (
                        <tr key={p.name}>
                          <th scope="row" className="nx-mono">
                            {p.name}
                          </th>
                          <td>
                            <span className={`nx-dir nx-dir--${p.direction}`}>{directionLabel(p.direction)}</span>
                          </td>
                          <td className="nx-mono">{widthLabel(p.width)}</td>
                          <td>
                            <BitList bits={p.bits} label={`porta ${p.name}`} focusedBit={focusedBit} onFocusBit={setFocusedBit} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            />

            <Section
              key={`c|${key}`}
              title="Células"
              items={currentMatch.cells}
              empty={q ? 'Nenhuma célula corresponde à busca.' : 'Módulo sem células.'}
              render={(cells) => (
                <ul className="nx-cells">
                  {cells.map((c) => (
                    <CellItem key={c.name} cell={c} focusedBit={focusedBit} onFocusBit={setFocusedBit} onOpenModule={onSelectModule} />
                  ))}
                </ul>
              )}
            />

            <Section
              key={`n|${key}`}
              title="Fios"
              items={currentMatch.nets}
              empty={q ? 'Nenhum fio corresponde à busca.' : 'Módulo sem fios nomeados.'}
              render={(nets) => (
                <div className="nx-scroll">
                  <table className="nx-table">
                    <thead>
                      <tr>
                        <th scope="col">Nome</th>
                        <th scope="col">Largura</th>
                        <th scope="col">Bits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nets.map((n) => (
                        <tr key={n.name} className={n.hidden ? 'nx-hidden' : undefined}>
                          <th scope="row" className="nx-mono">
                            {n.name}
                            {n.hidden && <span className="sr-only nx-gen"> (nome gerado)</span>}
                          </th>
                          <td className="nx-mono">{widthLabel(n.width)}</td>
                          <td>
                            <BitList bits={n.bits} label={`fio ${n.name}`} focusedBit={focusedBit} onFocusBit={setFocusedBit} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            />
          </>
        )}
      </div>
    </div>
  )
}

interface CellItemProps {
  cell: CellInfo
  focusedBit: number | null
  onFocusBit: (bit: number | null) => void
  onOpenModule: (name: string) => void
}

/** Célula recolhível; detalhes montados só quando aberta. */
function CellItem({ cell, focusedBit, onFocusBit, onOpenModule }: CellItemProps) {
  const [open, setOpen] = useState(false)
  const touchesFocus = focusedBit !== null && cell.connections.some((c) => c.bits.includes(focusedBit))
  return (
    <li>
      <details className={`nx-cell${touchesFocus ? ' nx-cell--hit' : ''}`} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <span className="nx-mono nx-cell__name">{cell.name}</span>
          <span className={`nx-type${cell.submodule ? ' nx-type--mod' : ''}`}>{cell.type}</span>
        </summary>
        {open && (
          <div className="nx-cell__body">
            {cell.submodule && (
              <button type="button" className="btn bs bsm" onClick={() => onOpenModule(cell.submodule!)}>
                Abrir módulo {cell.submodule}
              </button>
            )}
            {cell.parameters.length > 0 && (
              <dl className="nx-params">
                {cell.parameters.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd className="nx-mono">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="nx-scroll">
              <table className="nx-table">
                <caption className="sr-only">Conexões de {cell.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">Porta</th>
                    <th scope="col">Direção</th>
                    <th scope="col">Largura</th>
                    <th scope="col">Bits</th>
                  </tr>
                </thead>
                <tbody>
                  {cell.connections.map((conn) => (
                    <tr key={conn.port}>
                      <th scope="row" className="nx-mono">
                        {conn.port}
                      </th>
                      <td>{directionLabel(conn.direction)}</td>
                      <td className="nx-mono">{widthLabel(conn.width)}</td>
                      <td>
                        <BitList
                          bits={conn.bits}
                          label={`${cell.name}.${conn.port}`}
                          focusedBit={focusedBit}
                          onFocusBit={onFocusBit}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </details>
    </li>
  )
}
