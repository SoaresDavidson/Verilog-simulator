/**
 * Limites do lado do cliente para logs grandes (#15). O backend pode truncar
 * a timeline (`metadata.truncated`); aqui só limitamos o que é RENDERIZADO,
 * nunca os dados recebidos.
 */

/** Máximo de linhas renderizadas de uma vez na lista de sinais. */
export const MAX_LIST_ROWS = 300

/** Máximo de sinais desenhados no waveform ao mesmo tempo. */
export const MAX_WAVEFORM_SIGNALS = 64
