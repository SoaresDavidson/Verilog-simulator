/**
 * Configuração de runtime do frontend. Único lugar que lê `import.meta.env`.
 */

const DEFAULT_API_URL = 'http://localhost:8000/api/v1'

function readApiUrl(): string {
  const raw = import.meta.env.VITE_API_URL
  const url = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : DEFAULT_API_URL
  return url.replace(/\/+$/, '')
}

/** URL base da API, sem barra final (ex.: `http://localhost:8000/api/v1`). */
export const API_BASE_URL = readApiUrl()

/** Tempo máximo padrão de uma requisição antes de abortar no cliente. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000

/** Limite de tamanho do ZIP validado no cliente antes do envio (10 MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Intervalo de consulta ao healthcheck `GET /status/`. */
export const STATUS_POLL_INTERVAL_MS = 30_000
