import type { LogCiclo, NetlistData } from '../types';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = {
      status: res.status,
      message: body?.detail ?? `Erro HTTP ${res.status}`,
      detail: body?.detail,
    };
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function uploadProject(file: File): Promise<{ project_id: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/api/v1/verilog/upload-projeto-zip`, {
    method: 'POST',
    body: form,
  });
  return handleResponse<{ project_id: string }>(res);
}

export async function synthesize(project_id: string): Promise<NetlistData> {
  const res = await fetch(`${BASE}/api/v1/verilog/mapear-processador`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id }),
  });
  return handleResponse<NetlistData>(res);
}

export async function simulate(project_id: string): Promise<LogCiclo[]> {
  const res = await fetch(`${BASE}/api/v1/verilog/simular-execucao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id }),
  });
  const data = await handleResponse<{ simulation_log: LogCiclo[] }>(res);
  
  // Normaliza ciclo de string para number
  return (data.simulation_log ?? []).map((c) => ({
    ...c,
    ciclo: Number(c.ciclo),
  }));
}

export async function deleteProject(project_id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/verilog/projeto/${project_id}`, {
    method: 'DELETE',
  });
  return handleResponse<void>(res);
}

export async function cleanSessions(): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/verilog/limpar`, {
    method: 'POST',
  });
  return handleResponse<void>(res);
}
