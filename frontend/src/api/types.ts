/**
 * Tipos do contrato HTTP do backend (`/api/v1`).
 *
 * Fonte: contrato fixo das issues #8, #11, #12, #18, #20. Os nomes dos campos
 * seguem exatamente o JSON trafegado (snake_case); não renomeie aqui.
 */

/** `project_id` canônico: `runs/run_<32 hex>` (#18). */
export type ProjectId = string

export const PROJECT_ID_PATTERN = /^runs\/run_[0-9a-f]{32}$/

/** Header de autenticação das rotas sobre um run (#8). */
export const SESSION_TOKEN_HEADER = 'X-Session-Token'

/** Header de correlação devolvido em toda resposta (#12). */
export const REQUEST_ID_HEADER = 'X-Request-ID'

// ---------------------------------------------------------------------------
// Upload — POST /verilog/upload-projeto-zip (multipart, campo `file`)
// ---------------------------------------------------------------------------

export interface UploadResponse {
  project_id: ProjectId
  message: string
  session_token: string
}

// ---------------------------------------------------------------------------
// Netlist Yosys — preserva a forma do JSON do Yosys (#20)
// ---------------------------------------------------------------------------

export type PortDirection = 'input' | 'output' | 'inout'

/** Bit de um sinal: índice de net (inteiro) ou constante. */
export type NetBit = number | '0' | '1' | 'x' | 'z'

/** Atributos/parâmetros do Yosys: strings binárias ou números. */
export type YosysAttributes = Record<string, string | number>

export interface NetlistPort {
  direction: PortDirection
  bits: NetBit[]
  /** `len(bits)`, calculado pelo backend. */
  width: number
}

export interface NetlistCell {
  hide_name: number
  type: string
  parameters: YosysAttributes
  attributes: YosysAttributes
  port_directions: Record<string, PortDirection>
  connections: Record<string, NetBit[]>
}

export interface NetlistNetname {
  hide_name: number
  bits: NetBit[]
  attributes: YosysAttributes
  width: number
}

export interface NetlistModule {
  attributes: YosysAttributes
  parameter_default_values?: YosysAttributes
  ports: Record<string, NetlistPort>
  cells: Record<string, NetlistCell>
  netnames: Record<string, NetlistNetname>
}

export interface Netlist {
  creator: string
  modules: Record<string, NetlistModule>
}

/** POST /verilog/mapear-processador — body `{ project_id }`. */
export interface SynthesisRequest {
  project_id: ProjectId
}

export interface SynthesisResponse {
  success: boolean
  stdout: string
  stderr: string
  /** Módulo com atributo `top` (= 1 / "000..01"). */
  top_module: string | null
  netlist_content: Netlist | null
  stat_report: string | null
}

// ---------------------------------------------------------------------------
// Simulação — POST /verilog/simular-execucao
// ---------------------------------------------------------------------------

export interface SimLogMetadata {
  timescale: string | Record<string, unknown>
  begintime: number
  endtime: number
  truncated?: boolean
  truncation_reason?: string
  total_timestamps?: number
}

export interface SimLogVariable {
  size: number
  var_type: string
  references: string[]
}

export interface SimLogScope {
  name: string
  variables: Record<string, SimLogVariable>
  child_scopes: string[]
}

/** Valor amostrado: string binária com possíveis `x`/`z` (ex.: `"01x0"`). */
export type SignalValue = string

/** `timeline[timestamp][referência do sinal] = valor`. Chaves de tempo são strings. */
export type SimTimeline = Record<string, Record<string, SignalValue>>

export interface SimLog {
  metadata: SimLogMetadata
  modules: Record<string, SimLogScope>
  timeline: SimTimeline
}

export interface SimulationRequest {
  project_id: ProjectId
}

export interface SimulationResponse {
  success: boolean
  stdout: string
  stderr: string
  simulation_log: SimLog | null
}

// ---------------------------------------------------------------------------
// Remoção — DELETE /verilog/projeto/{project_id}
// ---------------------------------------------------------------------------

export interface DeleteProjectResponse {
  success: boolean
  message: string
}

// ---------------------------------------------------------------------------
// Healthcheck — GET /status/ (#11, backend/schemas/health.py)
// 200 quando pronto, 503 com o mesmo corpo quando não pronto.
// ---------------------------------------------------------------------------

export type HealthLevel = 'ok' | 'degraded' | 'error'

/** Chaves conhecidas de `checks`; o backend pode acrescentar outras. */
export type HealthCheckName = 'docker_daemon' | 'yosys' | 'icarus' | 'storage'

export interface HealthCheck {
  status: HealthLevel
  detail: string | null
  container: string | null
}

export interface StatusResponse {
  status: HealthLevel
  checks: Partial<Record<HealthCheckName, HealthCheck>> & Record<string, HealthCheck>
}

export interface LivenessResponse {
  status: 'alive'
}

// ---------------------------------------------------------------------------
// Erros (#12). Durante a transição o backend ainda pode responder `{detail}`.
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    request_id: string
  }
}

export interface LegacyErrorBody {
  detail: unknown
}
