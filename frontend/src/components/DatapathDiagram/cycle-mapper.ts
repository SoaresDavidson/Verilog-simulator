import type { LogCiclo } from '../../../types';

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface StageHighlight {
  active: boolean;
  intensity: 'low' | 'medium' | 'high';
  label?: string;
  anomaly?: 'bubble' | 'flush' | null;
}

export interface RegisterHighlight {
  active: boolean;
  value: number | string;
  highlight: boolean;
}

export interface WireHighlight {
  active: boolean;
  value?: string;
  animated: boolean;
  color?: 'normal' | 'bubble' | 'flush';
}

export interface PipelineRegHighlight {
  active: boolean;
  flushed: boolean;
  stalled: boolean;
}

export interface HighlightMap {
  stages: Record<string, StageHighlight>;
  registers: Record<string, RegisterHighlight>;
  wires: Record<string, WireHighlight>;
  pipelineRegs: Record<string, PipelineRegHighlight>;
}

// ── Mapeamento principal ──────────────────────────────────────────────────

export function mapCycleToHighlights(cycle: LogCiclo): HighlightMap {
  const isBubble = cycle.bolha === '1';
  const isFlush  = cycle.flush === '1';
  const isBranch = cycle.btb_predito === '1';
  const aluActive = cycle.ula_resultado !== '00000000' &&
    cycle.ula_resultado !== '0' &&
    cycle.ula_resultado !== undefined;

  return {
    stages: {
      IF: {
        active: true,
        intensity: 'high',
        label: `PC = 0x${cycle.pc_atual}`,
        anomaly: null,
      },
      ID: {
        active: true,
        intensity: isBubble ? 'low' : 'medium',
        label: cycle.instrucao ?? '—',
        anomaly: isBubble ? 'bubble' : null,
      },
      EX: {
        active: aluActive,
        intensity: aluActive ? 'high' : 'low',
        label: aluActive ? `ULA → 0x${cycle.ula_resultado}` : 'inativo',
        anomaly: isFlush ? 'flush' : null,
      },
      MEM: {
        active: true,
        intensity: 'low',
        anomaly: null,
      },
      WB: {
        active: true,
        intensity: 'low',
        anomaly: null,
      },
    },
    registers: buildRegisterHighlights(cycle),
    wires: {
      pc_to_imem:    { active: true,    value: `0x${cycle.pc_atual}`,         animated: true },
      imem_to_reg:   { active: true,    value: cycle.instrucao,               animated: true },
      ifreg_to_ctrl: { active: !isBubble, animated: !isBubble },
      regfile_rs1:   { active: !isBubble, animated: !isBubble },
      regfile_rs2:   { active: !isBubble, animated: !isBubble },
      alu_result:    { active: aluActive, value: `0x${cycle.ula_resultado}`,  animated: aluActive },
      branch_target: {
        active: isBranch,
        value: isBranch ? `0x${cycle.btb_alvo}` : undefined,
        animated: isBranch,
        color: isFlush ? 'flush' : isBranch ? 'normal' : 'normal',
      },
      forward_ex_ex: { active: !isFlush && !isBubble, animated: false },
      forward_mem_ex:{ active: !isFlush,              animated: false },
      wb_to_reg:     { active: true,                  animated: true },
    },
    pipelineRegs: {
      IF_ID:  { active: !isBubble, flushed: isFlush,  stalled: isBubble },
      ID_EX:  { active: true,      flushed: false,    stalled: false },
      EX_MEM: { active: true,      flushed: false,    stalled: false },
      MEM_WB: { active: true,      flushed: false,    stalled: false },
    },
  };
}

// ── Helpers internos ───────────────────────────────────────────────────────

function buildRegisterHighlights(
  cycle: LogCiclo,
): Record<string, RegisterHighlight> {
  const source =
    cycle.registradores && Object.keys(cycle.registradores).length > 0
      ? cycle.registradores
      : Object.fromEntries(
          Object.entries(cycle).filter(([k]) => /^x\d+$/.test(k)),
        );

  return Object.fromEntries(
    Object.entries(source).map(([reg, val]) => [
      reg,
      {
        active:    val !== 0 && val !== '0',
        value:     val,
        highlight: val !== 0 && val !== '0',
      },
    ]),
  );
}

// ── Utilitários de classe CSS ──────────────────────────────────────────────

export function getStageClass(
  highlight: StageHighlight,
): string {
  const classes: string[] = ['datapath-stage'];
  if (highlight.active) classes.push('stage--active');
  if (highlight.intensity) classes.push(`stage--${highlight.intensity}`);
  if (highlight.anomaly === 'bubble') classes.push('stage--bubble');
  if (highlight.anomaly === 'flush')  classes.push('stage--flush');
  return classes.join(' ');
}

export function getWireClass(highlight: WireHighlight): string {
  const classes: string[] = [];
  if (highlight.active) {
    classes.push('wire--active');
    if (highlight.animated) classes.push('wire--animated');
    if (highlight.color === 'bubble') classes.push('wire--bubble');
    if (highlight.color === 'flush')  classes.push('wire--flush');
  } else {
    classes.push('wire--inactive');
  }
  return classes.join(' ');
}

export function getPipelineRegClass(
  highlight: PipelineRegHighlight,
): string {
  const classes: string[] = ['pipeline-reg'];
  if (highlight.flushed) classes.push('pipeline-reg--flushed');
  else if (highlight.stalled) classes.push('pipeline-reg--stalled');
  return classes.join(' ');
}
