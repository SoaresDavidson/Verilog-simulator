/**
 * API pública da feature de caminho de dados (#21, #30), reutilizada pelo
 * diagrama ao vivo da tela 4 (#32).
 *
 * Fluxo típico na #32:
 * ```tsx
 * const graph = useMemo(() => parseNetlist(netlist, { top: topModule }), [netlist, topModule])
 * const layout = useMemo(() => graph && layoutGraph(graph), [graph])
 * const values = useMemo(() => valuesAt(simLog.timeline, cursor), [simLog, cursor])
 * <DatapathDiagram graph={graph} layout={layout} values={values}
 *   selectedSignals={selectedSignals} selection={sel} onSelect={setSel} />
 * ```
 */
export { DatapathScreen } from './DatapathScreen'

// Netlist -> modelo navegável
export {
  buildNetlistModel,
  constantLabel,
  formatParameter,
  indexBitUses,
  isConstBit,
  isTopAttribute,
  type BitUse,
  type CellInfo,
  type ModuleInfo,
  type NetInfo,
  type NetlistModel,
  type PortInfo,
} from './netlist/model'

// Netlist -> grafo (parser)
export {
  buildModuleGraph,
  edgesOfNet,
  edgesOfNode,
  parseNetlist,
  type GraphEdge,
  type GraphNet,
  type GraphNode,
  type GraphNodeKind,
  type GraphPin,
  type NetlistGraph,
  type ParseOptions,
} from './netlist/parse'

// Grafo -> posições (layout)
export { layoutGraph, routePath, type DiagramLayout, type EdgeRoute, type LayoutOptions, type NodeBox, type Point } from './netlist/layout'

// Sinais e valores simulados
export {
  bitValues,
  edgeValue,
  findNetByRef,
  formatValue,
  logicStateOf,
  normalizeValue,
  resolveSignalRefs,
  resolveValues,
  valuesAt,
  type LogicState,
  type SignalValues,
} from './netlist/signals'

// Renderização
export { DatapathDiagram, DEFAULT_MAX_NODES, type DatapathDiagramProps } from './render/DatapathDiagram'
export { DiagramSvg, type DiagramHighlights, type DiagramSelection, type DiagramSvgProps } from './render/DiagramSvg'
export { Legend } from './render/Legend'
export { NetlistExplorer, type NetlistExplorerProps } from './explorer/NetlistExplorer'
