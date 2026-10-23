/** Limite de caracteres exibidos de `stdout`/`stderr`. */
export const MAX_TOOL_OUTPUT_CHARS = 20_000

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
/** Prefixo absoluto até o diretório do run (`/verilog_code/runs/run_<hex>/`). */
const RUN_PREFIX = /(?:\/[\w.-]+)*\/runs\/run_[0-9a-f]{32}\/?/g

export interface ToolOutput {
  text: string
  truncated: boolean
}

/**
 * Prepara a saída de uma ferramenta para exibição: remove sequências ANSI e
 * caracteres de controle, oculta o caminho interno do run e limita o tamanho.
 * O texto é sempre renderizado como texto (nunca HTML).
 */
export function sanitizeToolOutput(raw: string | null | undefined, max = MAX_TOOL_OUTPUT_CHARS): ToolOutput {
  if (!raw) return { text: '', truncated: false }
  const clean = raw.replace(ANSI, '').replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(RUN_PREFIX, '')
  if (clean.length <= max) return { text: clean, truncated: false }
  return { text: clean.slice(0, max), truncated: true }
}
