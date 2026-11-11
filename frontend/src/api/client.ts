/**
 * Cliente tipado das rotas do backend. Cada método aceita `RequestOptions`
 * (`signal`, `timeoutMs`) e lança `ApiError` em qualquer falha.
 */
import { API_BASE_URL, DEFAULT_REQUEST_TIMEOUT_MS } from '../config'
import { ApiError, MESSAGES } from './errors'
import { createHttpClient, type HttpClient, type RequestOptions } from './http'
import {
  PROJECT_ID_PATTERN,
  type DeleteProjectResponse,
  type ProjectId,
  type StatusResponse,
  type SimulationResponse,
  type SynthesisResponse,
  type UploadResponse,
} from './types'

export interface ApiClientConfig {
  /** Padrão: `VITE_API_URL` ou `http://localhost:8000/api/v1`. */
  baseUrl?: string
  fetch?: typeof fetch
  /** Fonte do `X-Session-Token`, lida a cada requisição. */
  getSessionToken?: () => string | null | undefined
  timeoutMs?: number
}

export interface ApiClient {
  /** Acesso direto para rotas ainda não cobertas pelos métodos abaixo. */
  readonly http: HttpClient
  /** `POST /verilog/upload-projeto-zip` (multipart, campo `file`). Não envia token. */
  uploadProject(file: File, options?: RequestOptions): Promise<UploadResponse>
  /** `POST /verilog/mapear-processador`. */
  synthesize(projectId: ProjectId, options?: RequestOptions): Promise<SynthesisResponse>
  /** `POST /verilog/simular-execucao`. */
  simulate(projectId: ProjectId, options?: RequestOptions): Promise<SimulationResponse>
  /** `DELETE /verilog/projeto/{project_id}`. */
  deleteProject(projectId: ProjectId, options?: RequestOptions & { keepalive?: boolean }): Promise<DeleteProjectResponse | null>
  /** `GET /status/`. 503 devolve o relatório normalmente (não lança). */
  getStatus(options?: RequestOptions): Promise<StatusResponse>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(): ApiError {
  return new ApiError({ kind: 'invalid_response', message: MESSAGES.invalidResponse })
}

export function assertUploadResponse(value: unknown): UploadResponse {
  if (
    !isRecord(value) ||
    typeof value.project_id !== 'string' ||
    !PROJECT_ID_PATTERN.test(value.project_id) ||
    typeof value.session_token !== 'string' ||
    value.session_token === ''
  ) {
    throw invalid()
  }
  return {
    project_id: value.project_id,
    session_token: value.session_token,
    message: typeof value.message === 'string' ? value.message : '',
  }
}

function assertToolResponse(value: unknown): Record<string, unknown> & { success: boolean } {
  if (!isRecord(value) || typeof value.success !== 'boolean') throw invalid()
  return value as Record<string, unknown> & { success: boolean }
}

export function assertSynthesisResponse(value: unknown): SynthesisResponse {
  const body = assertToolResponse(value)
  const netlist = body.netlist_content
  if (netlist !== null && netlist !== undefined && !(isRecord(netlist) && isRecord(netlist.modules))) throw invalid()
  return {
    success: body.success,
    stdout: typeof body.stdout === 'string' ? body.stdout : '',
    stderr: typeof body.stderr === 'string' ? body.stderr : '',
    top_module: typeof body.top_module === 'string' ? body.top_module : null,
    netlist_content: (netlist ?? null) as SynthesisResponse['netlist_content'],
    stat_report: typeof body.stat_report === 'string' ? body.stat_report : null,
  }
}

export function assertSimulationResponse(value: unknown): SimulationResponse {
  const body = assertToolResponse(value)
  const log = body.simulation_log
  if (
    log !== null &&
    log !== undefined &&
    !(isRecord(log) && isRecord(log.metadata) && isRecord(log.modules) && isRecord(log.timeline))
  ) {
    throw invalid()
  }
  return {
    success: body.success,
    stdout: typeof body.stdout === 'string' ? body.stdout : '',
    stderr: typeof body.stderr === 'string' ? body.stderr : '',
    simulation_log: (log ?? null) as SimulationResponse['simulation_log'],
  }
}

export function assertStatusResponse(value: unknown): StatusResponse {
  if (!isRecord(value) || typeof value.status !== 'string' || !isRecord(value.checks)) throw invalid()
  return value as unknown as StatusResponse
}

/** Codifica cada segmento mantendo a barra de `runs/run_<hex>` (rota `{project_id:path}`). */
export function projectPath(projectId: ProjectId): string {
  return projectId.split('/').map(encodeURIComponent).join('/')
}

export function createApiClient(config: ApiClientConfig = {}): ApiClient {
  const http = createHttpClient({
    baseUrl: (config.baseUrl ?? API_BASE_URL).replace(/\/+$/, ''),
    fetch: config.fetch,
    getSessionToken: config.getSessionToken,
    timeoutMs: config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  })

  return {
    http,

    async uploadProject(file, options) {
      const formData = new FormData()
      formData.append('file', file, file.name)
      const body = await http.request<unknown>('/verilog/upload-projeto-zip', {
        ...options,
        method: 'POST',
        formData,
        withSession: false,
      })
      return assertUploadResponse(body)
    },

    async synthesize(projectId, options) {
      const body = await http.request<unknown>('/verilog/mapear-processador', {
        ...options,
        method: 'POST',
        json: { project_id: projectId },
      })
      return assertSynthesisResponse(body)
    },

    async simulate(projectId, options) {
      const body = await http.request<unknown>('/verilog/simular-execucao', {
        ...options,
        method: 'POST',
        json: { project_id: projectId },
      })
      return assertSimulationResponse(body)
    },

    async deleteProject(projectId, options) {
      const body = await http.request<unknown>(`/verilog/projeto/${projectPath(projectId)}`, {
        ...options,
        method: 'DELETE',
      })
      return isRecord(body) ? (body as unknown as DeleteProjectResponse) : null
    },

    async getStatus(options) {
      const body = await http.request<unknown>('/status/', {
        ...options,
        acceptStatus: [503],
        withSession: false,
      })
      return assertStatusResponse(body)
    },
  }
}
