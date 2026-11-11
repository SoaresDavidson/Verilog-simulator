/**
 * Erro tipado do cliente HTTP. `message` é sempre segura para exibir ao
 * usuário (pt-BR, sem stack trace, caminhos ou detalhes internos).
 */

export type ApiErrorKind =
  /** Servidor inalcançável (DNS, CORS, conexão recusada, offline). */
  | 'network'
  /** Timeout no cliente ou HTTP 408 (ferramenta excedeu o tempo). */
  | 'timeout'
  /** HTTP 503: Docker/container indisponível. */
  | 'unavailable'
  /** Cancelado pelo chamador via `AbortSignal`. */
  | 'aborted'
  /** Resposta 2xx que não segue o contrato. */
  | 'invalid_response'
  /** Demais respostas HTTP de erro (400, 401, 403, 404, 413, 500...). */
  | 'http'

export interface ApiErrorInit {
  kind: ApiErrorKind
  message: string
  status?: number
  code?: string
  requestId?: string
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined
  /** Código estável do backend (#12), quando enviado. */
  readonly code: string | undefined
  readonly requestId: string | undefined

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** Verdadeiro para cancelamentos explícitos (não devem gerar toast). */
export function isAbortError(error: unknown): boolean {
  if (error instanceof ApiError) return error.kind === 'aborted'
  return error instanceof DOMException && error.name === 'AbortError'
}

const GENERIC_BY_STATUS: Record<number, string> = {
  400: 'Requisição inválida. Verifique os dados enviados.',
  401: 'Sessão não autenticada. Envie o projeto novamente.',
  403: 'Sessão inválida ou expirada. Envie o projeto novamente.',
  404: 'Projeto não encontrado. A sessão pode ter expirado.',
  408: 'A operação excedeu o tempo limite. Tente novamente.',
  413: 'Arquivo grande demais para o servidor.',
  422: 'Requisição inválida. Verifique os dados enviados.',
  503: 'Serviço indisponível no momento (Docker ou ferramentas). Tente novamente em instantes.',
}

export const MESSAGES = {
  network: 'Não foi possível conectar à API. Verifique sua conexão e se o servidor está em execução.',
  timeout: 'A operação excedeu o tempo limite. Tente novamente.',
  aborted: 'Operação cancelada.',
  invalidResponse: 'O servidor enviou uma resposta inválida. Tente novamente.',
  generic: 'Erro inesperado no servidor. Tente novamente.',
  unknown: 'Ocorreu um erro inesperado.',
} as const

export function genericMessageForStatus(status: number): string {
  return GENERIC_BY_STATUS[status] ?? MESSAGES.generic
}

/** Padrões que indicam vazamento de detalhe interno numa mensagem legada. */
const UNSAFE_PATTERNS = [
  /traceback/i,
  /\bfile "/i,
  /(^|[\s'"(])\/[\w.-]+\/[\w./-]+/, // caminho absoluto POSIX
  /[a-z]:\\/i, // caminho Windows
  /exception|errno|stack/i,
]

/**
 * Aceita uma mensagem legada (`{"detail": "..."}`) só se ela parece segura.
 * Mensagens do formato novo (#12) já são garantidas seguras pelo backend.
 */
export function sanitizeLegacyDetail(detail: unknown): string | null {
  if (typeof detail !== 'string') return null
  const text = detail.trim()
  if (text === '' || text.length > 200) return null
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(text))) return null
  return text
}

/** Converte qualquer erro em mensagem segura para o usuário. */
export function toUserMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (isAbortError(error)) return MESSAGES.aborted
  return MESSAGES.unknown
}
