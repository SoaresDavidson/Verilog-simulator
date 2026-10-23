/**
 * API pública da tela 4 (simulação). O diagrama ao vivo (#32) deve usar estes
 * seletores para obter valores no cursor, em vez de reler a timeline.
 */
export { SimulationScreen } from './SimulationScreen'
export {
  floorIndex,
  formatTime,
  indexSimLog,
  isUsableSimLog,
  parseTimescale,
  snapCursor,
  trackValueAt,
  valueAt,
  valuesAt,
  type SignalTrack,
  type SimIndex,
  type Timescale,
} from './simlog'
export {
  baseName,
  defaultVisibleIds,
  extendValue,
  formatValue,
  listScopes,
  listSignals,
  logicState,
  selectionMatcher,
  type LogicState,
  type SignalInfo,
} from './signals'
export { buildRow, buildWaveformModel, type WaveformModel, type WaveRow, type WaveSegment } from './waveform/model'
export type { WaveformRenderer, WaveformRendererFactory } from './waveform/renderer'
export { createCanvasRenderer } from './waveform/canvasRenderer'
export { Waveform, type WaveformProps } from './waveform/Waveform'
export type { WaveformViewport } from './waveform/viewport'
