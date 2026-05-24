import type { LogCiclo } from '../../../types';

export interface TooltipData {
  title: string;
  value?: string;
  explanation: string;
  anomaly?: string;
}

type TooltipFn = (cycle: LogCiclo) => TooltipData;

export const COMPONENT_TOOLTIPS: Record<string, TooltipFn> = {
  // ── Subcomponentes do IF ─────────────────────────────────────────────────
  pc: (c) => ({
    title: 'Program Counter (PC)',
    value: `0x${c.pc_atual}`,
    explanation:
      'O PC aponta para o endereço da próxima instrução a ser buscada na memória de instruções. A cada ciclo normal, avança em 4 bytes (PC+4).',
  }),
  imem: (c) => ({
    title: 'Memória de Instruções',
    value: c.instrucao ? `instr: ${c.instrucao}` : undefined,
    explanation:
      'Memória somente de leitura que armazena o programa em linguagem de máquina. Entrega a instrução apontada pelo PC no mesmo ciclo (memória combinacional).',
  }),
  pc_plus4: () => ({
    title: 'Somador PC+4',
    explanation:
      'Calcula o endereço sequencial (PC + 4) para que a instrução seguinte seja buscada caso nenhum desvio seja tomado.',
  }),

  // ── Subcomponentes do ID ─────────────────────────────────────────────────
  regfile: (c) => ({
    title: 'Banco de Registradores',
    explanation:
      'Lê os operandos rs1 e rs2 necessários para a instrução. No estágio WB, o resultado pode ser escrito de volta em um registrador destino (rd).',
  }),
  control: (c) => ({
    title: 'Unidade de Controle',
    value: c.instrucao ?? undefined,
    explanation:
      'Decodifica o opcode da instrução e gera todos os sinais de controle que guiam o fluxo de dados nos estágios seguintes (ALUSrc, MemRead, RegWrite, etc.).',
  }),
  imm_gen: () => ({
    title: 'Gerador de Imediato',
    explanation:
      'Extrai e faz extensão de sinal do imediato codificado na instrução (tipo I, S, B, U ou J), preparando-o para uso como operando da ULA ou cálculo de endereço.',
  }),

  // ── Subcomponentes do EX ─────────────────────────────────────────────────
  alu: (c) => ({
    title: 'Unidade Lógica e Aritmética (ULA)',
    value: `resultado = 0x${c.ula_resultado}`,
    explanation:
      'Executa a operação aritmética ou lógica determinada pela instrução (ADD, SUB, AND, OR, SLT…). Os operandos vêm do banco de registradores ou do forwarding.',
  }),
  alu_ctrl: () => ({
    title: 'ALU Control',
    explanation:
      'Interpreta os campos funct3 e funct7 da instrução em conjunto com o sinal ALUOp da unidade de controle para selecionar exatamente qual operação a ULA deve realizar.',
  }),
  btb: (c) => ({
    title: 'Branch Target Buffer (BTB)',
    value: `alvo predito = 0x${c.btb_alvo}`,
    explanation:
      c.btb_predito === '1'
        ? 'O BTB predisse um desvio e redirecionou o PC para o endereço alvo antes da confirmação na ULA.'
        : 'Neste ciclo nenhum desvio foi predito pelo BTB.',
    anomaly:
      c.flush === '1'
        ? 'FLUSH: A predição estava incorreta. Os estágios IF e ID foram descartados e o pipeline foi redirecionado para o endereço correto.'
        : undefined,
  }),

  // ── Subcomponentes do MEM ────────────────────────────────────────────────
  dmem: () => ({
    title: 'Memória de Dados',
    explanation:
      'Armazena e recupera dados durante a execução de instruções de carga (LW, LB…) e armazenamento (SW, SB…). O endereço é calculado pela ULA no estágio EX.',
  }),
  addr_calc: (c) => ({
    title: 'Cálculo de Endereço',
    value: `endereço = 0x${c.ula_resultado}`,
    explanation:
      'O resultado da ULA do estágio anterior serve como endereço para acesso à memória de dados. Para instruções não-memória, esse valor é simplesmente repassado ao WB.',
  }),

  // ── Subcomponentes do WB ─────────────────────────────────────────────────
  wb_mux: () => ({
    title: 'Multiplexador Write-Back',
    explanation:
      'Seleciona qual valor será escrito no banco de registradores: o resultado da ULA (instrução aritmética) ou o dado lido da memória (instrução de carga).',
  }),
  reg_write: () => ({
    title: 'Escrita no Banco de Registradores',
    explanation:
      'Completa o ciclo de vida da instrução, gravando o resultado final no registrador destino (rd). É o único estágio que modifica o estado arquitetural visível do processador.',
  }),

  // ── Estágios inteiros ────────────────────────────────────────────────────
  IF: (c) => ({
    title: 'Estágio IF — Instruction Fetch',
    value: `PC = 0x${c.pc_atual}`,
    explanation:
      'Busca a instrução na memória de instruções usando o endereço apontado pelo PC e passa a instrução e o PC+4 para o registrador IF/ID.',
  }),
  ID: (c) => ({
    title: 'Estágio ID — Instruction Decode',
    value: c.instrucao ?? undefined,
    explanation:
      'Decodifica a instrução, lê os registradores fonte e gera sinais de controle para os estágios seguintes.',
    anomaly:
      c.bolha === '1'
        ? 'BOLHA (stall): Uma dependência de dados ou risco estrutural inseriu uma instrução NOP. O pipeline pausou por um ciclo.'
        : undefined,
  }),
  EX: (c) => ({
    title: 'Estágio EX — Execute',
    value: `ULA → 0x${c.ula_resultado}`,
    explanation:
      'Executa a operação aritmética/lógica. Também resolve a condição de desvio e calcula o endereço alvo do branch.',
    anomaly:
      c.flush === '1'
        ? 'FLUSH: Predição de branch errada detectada. As instruções nos estágios IF e ID foram descartadas.'
        : undefined,
  }),
  MEM: () => ({
    title: 'Estágio MEM — Memory',
    explanation:
      'Realiza o acesso à memória de dados para instruções de load/store. Para demais instruções, apenas repassa os valores ao próximo estágio.',
  }),
  WB: () => ({
    title: 'Estágio WB — Write Back',
    explanation:
      'Escreve o resultado final (ULA ou load) de volta no banco de registradores, concluindo a execução da instrução.',
  }),

  // ── Registradores de pipeline ────────────────────────────────────────────
  IF_ID: (c) => ({
    title: 'Registrador de Pipeline IF/ID',
    explanation:
      'Armazena a instrução buscada e o PC+4 entre os estágios IF e ID, isolando os dois estágios para execução paralela.',
    anomaly:
      c.flush === '1'
        ? 'FLUSH: Conteúdo descartado (substituído por NOP) devido à predição incorreta de branch.'
        : c.bolha === '1'
        ? 'STALL: Pipeline travado — o registrador manteve seu conteúdo por mais um ciclo.'
        : undefined,
  }),
  ID_EX: () => ({
    title: 'Registrador de Pipeline ID/EX',
    explanation:
      'Propaga os operandos, o imediato e os sinais de controle do estágio ID para o EX.',
  }),
  EX_MEM: () => ({
    title: 'Registrador de Pipeline EX/MEM',
    explanation:
      'Propaga o resultado da ULA, o endereço de memória e os sinais de controle do estágio EX para o MEM.',
  }),
  MEM_WB: () => ({
    title: 'Registrador de Pipeline MEM/WB',
    explanation:
      'Propaga o dado lido da memória (se houver) e o resultado da ULA para o estágio WB, onde serão escritos no banco de registradores.',
  }),
};

export function getTooltip(
  componentId: string,
  cycle: LogCiclo,
): TooltipData | null {
  const fn = COMPONENT_TOOLTIPS[componentId];
  if (!fn) return null;
  return fn(cycle);
}
