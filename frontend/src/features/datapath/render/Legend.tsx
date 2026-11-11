export interface LegendProps {
  /** Há valores simulados aplicados ao diagrama. */
  hasValues: boolean
}

/** Legenda dos estados lógicos 0/1/X/Z (cores compartilhadas com a tela 4). */
export function Legend({ hasValues }: LegendProps) {
  return (
    <div className="lg dpd-legend" role="note" aria-label="Legenda dos estados lógicos">
      <span>Legenda:</span>
      <span className="b0 s0">0 Baixo</span>
      <span className="b0 s1">1 Alto</span>
      <span className="b0 sx">X Indefinido</span>
      <span className="b0 sz">Z Alta impedância</span>
      <span className="dpd-legend__mode">
        {hasValues ? 'Valores da simulação aplicados aos fios.' : 'Sem valores simulados: cores só nas constantes.'}
      </span>
    </div>
  )
}
