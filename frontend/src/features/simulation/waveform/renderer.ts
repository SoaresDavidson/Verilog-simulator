/**
 * Contrato do renderer do waveform. O React só chama `draw(model, viewport)`;
 * trocar o Canvas por uma biblioteca de visualização = outra fábrica.
 */
import type { WaveformModel } from './model'
import type { WaveformViewport } from './viewport'

export interface WaveformRenderer {
  draw(model: WaveformModel, viewport: WaveformViewport): void
  destroy(): void
}

export type WaveformRendererFactory = (canvas: HTMLCanvasElement) => WaveformRenderer
