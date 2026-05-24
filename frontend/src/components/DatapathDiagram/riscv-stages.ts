// ── Tipos ──────────────────────────────────────────────────────────────────

export interface Subcomponent {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Stage {
  id: 'IF' | 'ID' | 'EX' | 'MEM' | 'WB';
  label: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  borderColor: string;
  subcomponents: Subcomponent[];
}

export interface PipelineRegister {
  id: string;
  label: string;
  x: number;
  y: number;
  height: number;
}

export interface Wire {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
  curved?: boolean;
  dashed?: boolean;
  color?: string;
}

export type ProcessorType =
  | 'riscv'
  | 'mips'
  | 'pipeline5stage'
  | 'pipeline3stage'
  | 'generic';

// ── Estágios RISC-V ───────────────────────────────────────────────────────

export const RISCV_STAGES: Stage[] = [
  {
    id: 'IF',
    label: 'IF',
    description: 'Instruction Fetch',
    x: 30, y: 60, width: 150, height: 210,
    color: 'var(--stage-if)',
    borderColor: 'var(--stage-if-border)',
    subcomponents: [
      { id: 'pc',       label: 'PC',          x: 50,  y: 90,  width: 110, height: 34 },
      { id: 'imem',     label: 'Instr. Mem',  x: 50,  y: 138, width: 110, height: 34 },
      { id: 'pc_plus4', label: 'PC + 4',      x: 50,  y: 186, width: 110, height: 34 },
    ],
  },
  {
    id: 'ID',
    label: 'ID',
    description: 'Instruction Decode',
    x: 240, y: 60, width: 150, height: 210,
    color: 'var(--stage-id)',
    borderColor: 'var(--stage-id-border)',
    subcomponents: [
      { id: 'regfile',  label: 'Reg. File',   x: 260, y: 90,  width: 110, height: 34 },
      { id: 'control',  label: 'Control',     x: 260, y: 138, width: 110, height: 34 },
      { id: 'imm_gen',  label: 'Imm. Gen',    x: 260, y: 186, width: 110, height: 34 },
    ],
  },
  {
    id: 'EX',
    label: 'EX',
    description: 'Execute',
    x: 450, y: 60, width: 150, height: 210,
    color: 'var(--stage-ex)',
    borderColor: 'var(--stage-ex-border)',
    subcomponents: [
      { id: 'alu',      label: 'ULA',         x: 470, y: 90,  width: 110, height: 34 },
      { id: 'alu_ctrl', label: 'ALU Ctrl',    x: 470, y: 138, width: 110, height: 34 },
      { id: 'btb',      label: 'BTB',         x: 470, y: 186, width: 110, height: 34 },
    ],
  },
  {
    id: 'MEM',
    label: 'MEM',
    description: 'Memory',
    x: 660, y: 60, width: 150, height: 210,
    color: 'var(--stage-mem)',
    borderColor: 'var(--stage-mem-border)',
    subcomponents: [
      { id: 'dmem',      label: 'Data Mem',   x: 680, y: 90,  width: 110, height: 34 },
      { id: 'addr_calc', label: 'Addr. Calc', x: 680, y: 138, width: 110, height: 34 },
    ],
  },
  {
    id: 'WB',
    label: 'WB',
    description: 'Write Back',
    x: 870, y: 60, width: 150, height: 210,
    color: 'var(--stage-wb)',
    borderColor: 'var(--stage-wb-border)',
    subcomponents: [
      { id: 'wb_mux',    label: 'WB Mux',     x: 890, y: 90,  width: 110, height: 34 },
      { id: 'reg_write', label: 'Reg. Write', x: 890, y: 138, width: 110, height: 34 },
    ],
  },
];

export const PIPELINE_REGISTERS: PipelineRegister[] = [
  { id: 'IF_ID',  label: 'IF/ID',  x: 188, y: 60, height: 210 },
  { id: 'ID_EX',  label: 'ID/EX',  x: 398, y: 60, height: 210 },
  { id: 'EX_MEM', label: 'EX/MEM', x: 608, y: 60, height: 210 },
  { id: 'MEM_WB', label: 'MEM/WB', x: 818, y: 60, height: 210 },
];

export const MAIN_WIRES: Wire[] = [
  { id: 'pc_to_imem',    from: { x: 180, y: 107 }, to: { x: 204, y: 107 }, label: 'PC' },
  { id: 'imem_to_reg',   from: { x: 180, y: 155 }, to: { x: 204, y: 155 }, label: 'instr[31:0]' },
  { id: 'ifreg_to_ctrl', from: { x: 214, y: 107 }, to: { x: 260, y: 107 }, label: '' },
  { id: 'regfile_rs1',   from: { x: 370, y: 107 }, to: { x: 414, y: 107 }, label: 'rs1' },
  { id: 'regfile_rs2',   from: { x: 370, y: 130 }, to: { x: 414, y: 130 }, label: 'rs2' },
  { id: 'alu_result',    from: { x: 600, y: 107 }, to: { x: 624, y: 107 }, label: 'ALU_out' },
  {
    id: 'branch_target',
    from: { x: 575, y: 203 },
    to: { x: 315, y: 48 },
    label: 'btb_alvo',
    curved: true,
  },
  {
    id: 'forward_ex_ex',
    from: { x: 624, y: 107 },
    to: { x: 500, y: 107 },
    label: 'fwd EX→EX',
    dashed: true,
  },
  {
    id: 'forward_mem_ex',
    from: { x: 824, y: 107 },
    to: { x: 500, y: 128 },
    label: 'fwd MEM→EX',
    dashed: true,
  },
  {
    id: 'wb_to_reg',
    from: { x: 1020, y: 107 },
    to: { x: 260, y: 88 },
    label: 'rd (WB)',
    curved: true,
    color: 'var(--stage-wb-border)',
  },
];

// ── Detecção do Processador ───────────────────────────────────────────────

import type { NetlistData } from '../../../types';

export function detectProcessorType(netlist: NetlistData): ProcessorType {
  const ids = netlist.nodes.map((n) => n.id.toLowerCase());
  const allIds = ids.join(' ');

  if (
    allIds.includes('risc') ||
    allIds.includes('rv32') ||
    allIds.includes('riscv')
  ) {
    return 'riscv';
  }
  if (allIds.includes('mips')) return 'mips';

  const hasIF  = ids.some((id) => id.includes('if')  || id.includes('fetch'));
  const hasID  = ids.some((id) => id.includes('id')  || id.includes('decode'));
  const hasEX  = ids.some((id) => id.includes('ex')  || id.includes('alu') || id.includes('execute'));
  const hasMEM = ids.some((id) => id.includes('mem') || id.includes('memory'));
  const hasWB  = ids.some((id) => id.includes('wb')  || id.includes('writeback'));

  if (hasIF && hasID && hasEX && hasMEM && hasWB) return 'pipeline5stage';
  if (hasIF && hasID && hasEX) return 'pipeline3stage';

  return 'generic';
}

// Mapeamento ABI RISC-V
export const ABI_NAMES: Record<string, string> = {
  x0: 'zero', x1: 'ra',    x2: 'sp',  x3: 'gp',
  x4: 'tp',   x5: 't0',   x6: 't1',  x7: 't2',
  x8: 's0',   x9: 's1',   x10: 'a0', x11: 'a1',
  x12: 'a2',  x13: 'a3',  x14: 'a4', x15: 'a5',
  x16: 'a6',  x17: 'a7',  x18: 's2', x19: 's3',
  x20: 's4',  x21: 's5',  x22: 's6', x23: 's7',
  x24: 's8',  x25: 's9',  x26: 's10',x27: 's11',
  x28: 't3',  x29: 't4',  x30: 't5', x31: 't6',
};
