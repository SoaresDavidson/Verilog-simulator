/**
 * Cliente HTTP de baixo nível: fetch + timeout + cancelamento + parsing de
 * erro nos dois formatos do backend (`{"error": {...}}` e `{"detail": ...}`).
 *
 * Features não usam este módulo direto; use `useApi()` (ver `./ApiProvider`).
 */
import {
  ApiError,
  MESSAGES,
  genericMessageForStatus,
  sanitizeLegacyDetail,
  type ApiErrorKind,
} from './errors'
import { REQUEST_ID_HEADER, SESSION_TOKEN_HEADER } from './types'

export interface RequestOptions {
  /** Cancela a requisição. Cancelamento gera `ApiError` com `kind: 'aborted'`. */
  signal?: AbortSignal
  /** Timeout no cliente em ms (sobrepõe o padrão). `0` desliga. */
  timeoutMs?: number
}

export interface RequestConfig extends RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  /** Corpo serializado como JSON. */
  json?: unknown
  /** Corpo multipart; o boundary do Content-Type é definido pelo navegador. */
  formData?: FormData
  /** Status não-2xx cujo corpo deve ser devolvido normalmente (ex.: 503 de `/status/`). */
  acceptStatus?: readonly number[]
  /** Envia `X-Session-Token` quando houver sessão (padrão `true`). */
  withSession?: boolean
  /** Mantém a requisição viva ao fechar a página (`fetch` keepalive). */
  keepalive?: boolean
}

export interface HttpClientConfig {
  baseUrl: string
  /** Implementação de fetch (injetável em testes). Padrão: `globalThis.fetch`. */
  fetch?: typeof fetch
  /** Lido a cada requisição; devolve o token da sessão ativa ou `null`. */
  getSessionToken?: () => string | null | undefined
  /** Timeout padrão em ms. */
  timeoutMs: number
}

export interface HttpClient {
  request<T>(path: string, config?: RequestConfig): Promise<T>
}

interface ParsedBody {
  ok: boolean
  value: unknown
}

async function readBody(response: Response): Promise<ParsedBody> {
  const text = await response.text()
  if (text.trim() === '') return { ok: true, value: null }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, value: null }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 408) return 'timeout'
  if (status === 503) return 'unavailable'
  return 'http'
}

/** Constrói o `ApiError` de uma resposta HTTP de erro. Exportado para testes. */
export function errorFromResponse(status: number, body: unknown, headerRequestId: string | null): ApiError {
  const kind = kindForStatus(status)
  const requestId = headerRequestId ?? undefined

  if (isRecord(body) && isRecord(body.error)) {
    const { code, message, request_id } = body.error
    return new ApiError({
      kind,
      status,
      code: typeof code === 'string' ? code : undefined,
      message: typeof message === 'string' && message.trim() !== '' ? message : genericMessageForStatus(status),
      requestId: typeof request_id === 'string' ? request_id : requestId,
    })
  }

  if (isRecord(body) && 'detail' in body && status < 500) {
    const safe = sanitizeLegacyDetail(body.detail)
    return new ApiError({ kind, status, message: safe ?? genericMessageForStatus(status), requestId })
  }

  return new ApiError({ kind, status, message: genericMessageForStatus(status), requestId })
}

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const doFetch: typeof fetch = config.fetch ?? ((input, init) => globalThis.fetch(input, init))

  async function request<T>(path: string, req: RequestConfig = {}): Promise<T> {
    const { signal, json, formData, acceptStatus = [], withSession = true } = req
    const timeoutMs = req.timeoutMs ?? config.timeoutMs

    if (signal?.aborted) throw new ApiError({ kind: 'aborted', message: MESSAGES.aborted })

    const controller = new AbortController()
    let timedOut = false
    const onExternalAbort = () => controller.abort()
    signal?.addEventListener('abort', onExternalAbort, { once: true })
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            controller.abort()
          }, timeoutMs)
        : undefined

    const headers = new Headers({ Accept: 'application/json' })
    let body: BodyInit | undefined
    if (formData) {
      body = formData
    } else if (json !== undefined) {
      headers.set('Content-Type', 'application/json')
      body = JSON.stringify(json)
    }
    const token = withSession ? config.getSessionToken?.() : null
    if (token) headers.set(SESSION_TOKEN_HEADER, token)

    const failFromAbort = (): ApiError =>
      timedOut
        ? new ApiError({ kind: 'timeout', message: MESSAGES.timeout })
        : new ApiError({ kind: 'aborted', message: MESSAGES.aborted })

    try {
      let response: Response
      try {
        response = await doFetch(`${config.baseUrl}${path}`, {
          method: req.method ?? 'GET',
          headers,
          body,
          signal: controller.signal,
          keepalive: req.keepalive,
        })
      } catch {
        if (controller.signal.aborted) throw failFromAbort()
        throw new ApiError({ kind: 'network', message: MESSAGES.network })
      }

      let parsed: ParsedBody
      try {
        parsed = await readBody(response)
      } catch {
        if (controller.signal.aborted) throw failFromAbort()
        throw new ApiError({ kind: 'network', message: MESSAGES.network, status: response.status })
      }

      const requestId = response.headers.get(REQUEST_ID_HEADER)
      if (!response.ok && !acceptStatus.includes(response.status)) {
        throw errorFromResponse(response.status, parsed.value, requestId)
      }
      if (!parsed.ok) {
        throw new ApiError({
          kind: 'invalid_response',
          status: response.status,
          message: MESSAGES.invalidResponse,
          requestId: requestId ?? undefined,
        })
      }
      return parsed.value as T
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onExternalAbort)
    }
  }

  return { request }
}
