import { useEffect, useMemo, useState } from 'react'
import { layoutGraphElk } from './elk'
import { layoutGraph, type DiagramLayout } from './layout'
import type { NetlistGraph } from './parse'

/** Nos testes (jsdom) fica só o layout síncrono, previsível e sem carregar o ELK. */
const ELK_ENABLED = import.meta.env.MODE !== 'test'

/**
 * Layout do diagrama: devolve na hora o layout próprio (síncrono) e troca pelo
 * do ELK assim que ele termina. Falha do ELK mantém o layout próprio.
 */
export function useDiagramLayout(graph: NetlistGraph | null, enabled = true): DiagramLayout | null {
  const fallback = useMemo(() => (graph && enabled ? layoutGraph(graph) : null), [graph, enabled])
  const [elk, setElk] = useState<{ graph: NetlistGraph; layout: DiagramLayout } | null>(null)

  useEffect(() => {
    if (!graph || !enabled || !ELK_ENABLED) return
    let alive = true
    layoutGraphElk(graph)
      .then((layout) => {
        if (alive) setElk({ graph, layout })
      })
      .catch(() => {
        // Mantém o layout próprio.
      })
    return () => {
      alive = false
    }
  }, [graph, enabled])

  return elk && elk.graph === graph ? elk.layout : fallback
}
