import type { ReactNode } from 'react'
import type { SimLog } from '../../api/types'
import type { SignalInfo } from './signals'

/**
 * Contexto entregue ao diagrama ao vivo (#32) pela tela 4. Valores no cursor:
 * use `valuesAt(simLog, time)` / `valueAt(simLog, ref, time)` (index.ts).
 */
export interface LiveDiagramContext {
  simLog: SimLog
  /** Timestamp real em vigor (cursor), ou `null`. */
  time: number | null
  signals: readonly SignalInfo[]
  /** Sinais exibidos (ids = referências da timeline); compartilhado com lista e waveform. */
  visibleIds: ReadonlySet<string>
  /** Alterna a exibição de um sinal (sincroniza lista e waveform). */
  toggleSignal: (id: string) => void
}

/** Conteúdo do painel superior: nó fixo ou função do contexto ao vivo. */
export type DiagramSlot = ReactNode | ((context: LiveDiagramContext) => ReactNode)
