export type AppState =
  | "idle"
  | "uploading"
  | "uploaded"
  | "synthesizing"
  | "synthesized"
  | "simulating"
  | "simulated";

// types/index.ts — registradores é opcional porque vem flat
export interface LogCiclo {
  ciclo: number;
  pc_atual: string;
  instrucao: string;
  registradores?: Record<string, string | number>;
  bolha: string;
  flush: string;
  btb_predito: string;
  btb_alvo: string;
  branch_tomado?: string;
  ula_resultado?: string;
  [key: string]: unknown;
}

export interface NetlistNode {
  id: string;
  type: string;
  ports: { name: string; direction: "in" | "out" }[];
}

export interface NetlistEdge {
  from: string;
  to: string;
  net: string;
}

export interface NetlistData {
  nodes: NetlistNode[];
  edges: NetlistEdge[];
}

export interface ApiError {
  status: number;
  message: string;
  detail?: string;
}
