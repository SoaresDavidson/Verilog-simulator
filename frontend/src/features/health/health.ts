import type { HealthLevel, StatusResponse } from '../../api/types'

export type HealthState =
  | { kind: 'checking' }
  | { kind: 'unreachable' }
  | { kind: 'report'; report: StatusResponse }

export interface HealthIssue {
  name: string
  level: Exclude<HealthLevel, 'ok'>
  message: string
}

const CHECK_MESSAGES: Record<string, string> = {
  docker_daemon: 'Docker indisponível: inicie o Docker e os containers do projeto.',
  yosys: 'Yosys indisponível: a síntese não poderá ser executada. Verifique o container do Yosys.',
  icarus: 'Icarus Verilog indisponível: a simulação não poderá ser executada. Verifique o container do Icarus.',
  storage: 'Armazenamento de projetos indisponível: o envio de projetos pode falhar.',
}

export const API_UNREACHABLE_MESSAGE =
  'API indisponível: não foi possível contatar o servidor. Verifique se o backend está em execução.'

/** Problemas acionáveis a partir do relatório de `/status/` (sem expor `detail`). */
export function healthIssues(state: HealthState): HealthIssue[] {
  if (state.kind === 'unreachable') return [{ name: 'api', level: 'error', message: API_UNREACHABLE_MESSAGE }]
  if (state.kind !== 'report') return []
  const issues: HealthIssue[] = []
  for (const [name, check] of Object.entries(state.report.checks)) {
    if (!check || check.status === 'ok') continue
    const level = check.status === 'degraded' ? 'degraded' : 'error'
    const message = CHECK_MESSAGES[name] ?? `Dependência "${name}" indisponível.`
    issues.push({ name, level, message: level === 'degraded' ? message.replace('indisponível', 'com limitações') : message })
  }
  if (issues.length === 0 && state.report.status !== 'ok') {
    issues.push({ name: 'api', level: state.report.status, message: 'Backend com limitações. Tente novamente em instantes.' })
  }
  return issues
}

/** Nível agregado para o indicador. */
export function healthLevel(state: HealthState): HealthLevel | 'checking' {
  if (state.kind === 'checking') return 'checking'
  if (state.kind === 'unreachable') return 'error'
  return state.report.status
}

/** Verdadeiro se a ferramenta pode ser usada (desconhecido conta como disponível). */
export function isToolAvailable(state: HealthState, tool: 'yosys' | 'icarus'): boolean {
  if (state.kind === 'unreachable') return false
  if (state.kind !== 'report') return true
  const docker = state.report.checks.docker_daemon
  const check = state.report.checks[tool]
  return docker?.status !== 'error' && check?.status !== 'error'
}
