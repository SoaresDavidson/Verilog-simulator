/**
 * Sinais da simulação derivados de `simulation_log.modules` + `timeline` (#31).
 * Puro, sem React; memoizado por objeto de log.
 */
import type { SimLog, SignalValue } from '../../api/types'
import { indexSimLog } from './simlog'

export interface SignalInfo {
  /** Identificador único na lista (= referência usada na timeline). */
  id: string
  /** Referência na timeline (chave de `timeline[t]`). */
  ref: string
  /** Nome local sem faixa de bits (ex.: `data`). */
  name: string
  /** Nome local como veio do VCD (ex.: `data[7:0]`). */
  localName: string
  /** Chave do escopo em `modules` (ex.: `tb.uut`); `''` se desconhecido. */
  scope: string
  /** Caminho hierárquico `escopo.nome`. */
  path: string
  width: number
  varType: string
  /** Aliases conhecidos (mesmo sinal em outros escopos). */
  references: string[]
  /** Há ao menos uma amostra na timeline. */
  hasSamples: boolean
  /** Profundidade na hierarquia (0 = escopo raiz). */
  depth: number
}

/** Estado lógico exibido: `bus` = vetor sem X/Z; `real` = valor real; `none` = sem amostra. */
export type LogicState = '0' | '1' | 'x' | 'z' | 'bus' | 'real' | 'none'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Remove faixa de bits e escape do Yosys: `\\data[7:0]` -> `data`. */
export function baseName(name: string): string {
  return name.replace(/^\\/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim()
}

function joinPath(scope: string, name: string): string {
  return scope ? `${scope}.${name}` : name
}

const cache = new WeakMap<SimLog, SignalInfo[]>()

function buildSignals(log: SimLog): SignalInfo[] {
  const { tracks } = indexSimLog(log)
  const modules = isRecord(log.modules) ? log.modules : {}
  const scopeKeys = Object.keys(modules)
  const children = new Map<string, string[]>()
  const isChild = new Set<string>()

  for (const key of scopeKeys) {
    const scope = modules[key]
    const list: string[] = []
    const raw = isRecord(scope) && Array.isArray(scope.child_scopes) ? scope.child_scopes : []
    for (const child of raw) {
      if (typeof child !== 'string') continue
      // vcdvcd usa o nome completo; aceita também nome relativo ao pai.
      const resolved = child in modules ? child : `${key}.${child}` in modules ? `${key}.${child}` : null
      if (resolved && resolved !== key) {
        list.push(resolved)
        isChild.add(resolved)
      }
    }
    children.set(key, list)
  }

  const out: SignalInfo[] = []
  const seen = new Set<string>()
  const visited = new Set<string>()

  const visit = (key: string, depth: number) => {
    if (visited.has(key)) return
    visited.add(key)
    const scope = modules[key]
    const variables = isRecord(scope) && isRecord(scope.variables) ? scope.variables : {}
    for (const [localName, raw] of Object.entries(variables)) {
      if (!isRecord(raw)) continue
      const references = Array.isArray(raw.references) ? raw.references.filter((r): r is string => typeof r === 'string') : []
      const own = joinPath(key, localName)
      const ref = tracks.has(own) ? own : (references.find((r) => tracks.has(r)) ?? own)
      const id = own
      if (seen.has(id)) continue
      seen.add(id)
      const width = Number(raw.size)
      out.push({
        id,
        ref,
        name: baseName(localName),
        localName,
        scope: key,
        path: joinPath(key, baseName(localName)),
        width: Number.isFinite(width) && width > 0 ? width : 1,
        varType: typeof raw.var_type === 'string' ? raw.var_type : '',
        references,
        hasSamples: tracks.has(ref),
        depth,
      })
    }
    for (const child of children.get(key) ?? []) visit(child, depth + 1)
  }

  for (const key of scopeKeys) if (!isChild.has(key)) visit(key, 0)
  for (const key of scopeKeys) visit(key, 0) // ciclos/órfãos

  // Referências da timeline sem declaração em `modules` (log parcial).
  const covered = new Set<string>()
  for (const s of out) {
    covered.add(s.ref)
    for (const r of s.references) covered.add(r)
  }
  for (const [ref, track] of tracks) {
    if (covered.has(ref) || seen.has(ref)) continue
    const dot = ref.lastIndexOf('.')
    const scope = dot > 0 ? ref.slice(0, dot) : ''
    const localName = dot > 0 ? ref.slice(dot + 1) : ref
    const width = Math.max(1, ...track.values.map((v) => (/^[01xz]+$/i.test(v) ? v.length : 1)))
    seen.add(ref)
    out.push({
      id: ref,
      ref,
      name: baseName(localName),
      localName,
      scope,
      path: joinPath(scope, baseName(localName)),
      width,
      varType: '',
      references: [ref],
      hasSamples: true,
      depth: scope ? scope.split('.').length - 1 : 0,
    })
  }
  return out
}

/** Lista de sinais em ordem hierárquica (escopo pai antes dos filhos). */
export function listSignals(log: SimLog): SignalInfo[] {
  let signals = cache.get(log)
  if (!signals) {
    signals = buildSignals(log)
    cache.set(log, signals)
  }
  return signals
}

/** Escopos (chaves de `modules`) que têm sinais, em ordem hierárquica. */
export function listScopes(signals: readonly SignalInfo[]): string[] {
  return [...new Set(signals.map((s) => s.scope))]
}

/**
 * Casa um sinal do VCD com os sinais escolhidos na tela 2 (`selectedSignals`).
 *
 * Heurística: os nomes da tela 2 vêm do netlist do Yosys (porta/netname,
 * opcionalmente com prefixo `modulo.` ou `/`, escape `\\` e faixa `[n:m]`),
 * enquanto o VCD usa caminhos de INSTÂNCIA (`tb.uut.clk`). Normalizamos ambos
 * (sem escape, sem faixa de bits) e:
 * 1. se o nome escolhido tem caminho (`a.b`), casa quando ele é sufixo do
 *    caminho do sinal no VCD (`tb.a.b`);
 * 2. senão — ou se o caminho não casar com NENHUM sinal — casa pelo nome base
 *    (`clk` casa com `tb.clk` e `tb.uut.clk`).
 */
export function selectionMatcher(selected: readonly string[], signals: readonly SignalInfo[]): (signal: SignalInfo) => boolean {
  const names = new Set<string>()
  const paths: string[] = []
  for (const raw of selected) {
    const normalized = raw
      .split(/[./]/)
      .map(baseName)
      .filter((part) => part !== '')
      .join('.')
    if (!normalized) continue
    if (normalized.includes('.') && signals.some((s) => s.path === normalized || s.path.endsWith(`.${normalized}`))) {
      paths.push(normalized)
    } else {
      names.add(normalized.slice(normalized.lastIndexOf('.') + 1))
    }
  }
  return (signal) => names.has(signal.name) || paths.some((p) => signal.path === p || signal.path.endsWith(`.${p}`))
}

/** Estende o valor comprimido do VCD até `width` (MSB `x`/`z` replica; senão `0`). */
export function extendValue(value: SignalValue, width: number): string {
  const v = value.toLowerCase()
  if (!/^[01xz]+$/.test(v) || v.length >= width) return v
  const pad = v[0] === 'x' || v[0] === 'z' ? v[0] : '0'
  return pad.repeat(width - v.length) + v
}

export function logicState(value: SignalValue | null, width: number, varType = ''): LogicState {
  if (value === null) return 'none'
  const v = value.toLowerCase()
  if (varType === 'real' || !/^[01xz]+$/.test(v)) return 'real'
  if (width <= 1 && v.length === 1) return v as '0' | '1' | 'x' | 'z'
  if (/^z+$/.test(v)) return 'z'
  if (/[xz]/.test(v)) return 'x'
  return width <= 1 ? (v.endsWith('1') ? '1' : '0') : 'bus'
}

/** Valor para exibição: escalar `0/1/X/Z`; barramento em hexadecimal (`0x0A`, nibbles X/Z). */
export function formatValue(value: SignalValue | null, width: number, varType = ''): string {
  if (value === null) return '—'
  const state = logicState(value, width, varType)
  if (state === 'real') return value
  if (width <= 1) return state === 'bus' ? value : state.toUpperCase()
  const bits = extendValue(value, width)
  const padded = bits.padStart(Math.ceil(bits.length / 4) * 4, bits[0] === 'x' || bits[0] === 'z' ? bits[0] : '0')
  let hex = ''
  for (let i = 0; i < padded.length; i += 4) {
    const nibble = padded.slice(i, i + 4)
    if (/^[01]{4}$/.test(nibble)) hex += parseInt(nibble, 2).toString(16).toUpperCase()
    else if (/^z{4}$/.test(nibble)) hex += 'Z'
    else hex += 'X'
  }
  return `0x${hex}`
}

/** Quantos sinais ficam visíveis por padrão quando a Seleção não casa com nenhum. */
export const DEFAULT_VISIBLE_SIGNALS = 8

/**
 * Visibilidade inicial: sinais que casam com a seleção da tela 2; se nenhum
 * casar, os primeiros com amostra.
 */
export function defaultVisibleIds(signals: readonly SignalInfo[], selected: readonly string[]): Set<string> {
  const matches = selectionMatcher(selected, signals)
  const chosen = signals.filter(matches)
  const base = chosen.length > 0 ? chosen : signals.filter((s) => s.hasSamples).slice(0, DEFAULT_VISIBLE_SIGNALS)
  return new Set(base.map((s) => s.id))
}
