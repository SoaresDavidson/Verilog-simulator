import { useRef, useEffect } from "react";
import type { LogCiclo } from "../../types";
import { ABI_NAMES } from "../DatapathDiagram/riscv-stages";

interface Props {
  cycle: LogCiclo;
}

// ── Tipos internos ─────────────────────────────────────────────────────────

interface SignalCard {
  label: string;
  icon: string;
  value: string;
  variant?: "hex" | "ok" | "warn" | "err" | "muted";
  description: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toHex(v: string): string {
  return `0x${v}`;
}

function buildCards(cycle: LogCiclo): SignalCard[] {
  return [
    {
      label: "PC Atual",
      icon: "→",
      value: toHex(cycle.pc_atual),
      variant: "hex",
      description: "Endereço da instrução em busca",
    },
    {
      label: "Instrução",
      icon: "⬡",
      value: cycle.instrucao ?? "—",
      description: "Assembly decodificado",
    },
    {
      label: "Resultado ULA",
      icon: "⊕",
      value: toHex(cycle.ula_resultado),
      variant: "hex",
      description: "Saída da unidade aritmética",
    },
    {
      label: "BTB Alvo",
      icon: "⤴",
      value: toHex(cycle.btb_alvo),
      variant: "hex",
      description: "Endereço alvo de desvio predito",
    },
    {
      label: "Bolha",
      icon: "◌",
      value: cycle.bolha === "1" ? "ATIVO" : "—",
      variant: cycle.bolha === "1" ? "warn" : "muted",
      description: "Inserção de NOP por risco de dados",
    },
    {
      label: "Flush",
      icon: "✕",
      value: cycle.flush === "1" ? "ATIVO" : "—",
      variant: cycle.flush === "1" ? "err" : "muted",
      description: "Pipeline descartado por branch miss",
    },
    {
      label: "Branch Predito",
      icon: "⤷",
      value: cycle.btb_predito === "1" ? "SIM" : "NÃO",
      variant: cycle.btb_predito === "1" ? "warn" : undefined,
      description: "BTB previu desvio neste ciclo",
    },
    {
      label: "Branch Tomado",
      icon: "✓",
      value: cycle.branch_tomado === "1" ? "SIM" : "NÃO",
      variant: cycle.branch_tomado === "1" ? "ok" : undefined,
      description: "Confirmação real do desvio",
    },
  ];
}

// ── Grade de Registradores ────────────────────────────────────────────────

interface RegCellProps {
  name: string;
  value: number | string | undefined;
  prevValue: number | string | undefined;
}

function RegCell({ name, value, prevValue }: RegCellProps) {
  const cellRef = useRef<HTMLDivElement>(null);
  const isActive = value !== 0 && value !== "0" && value !== undefined;
  const abiName = ABI_NAMES[name];

  // Flash quando o valor muda
  useEffect(() => {
    if (!cellRef.current) return;
    if (prevValue !== undefined && prevValue !== value) {
      cellRef.current.classList.remove("reg-cell--changed");
      // Trigger reflow
      void cellRef.current.offsetWidth;
      cellRef.current.classList.add("reg-cell--changed");
    }
  }, [value, prevValue]);

  const hexVal =
    value !== undefined
      ? `0x${Number(value).toString(16).padStart(4, "0")}`
      : "0x0000";

  return (
    <div
      ref={cellRef}
      className={`reg-cell${isActive ? " reg-cell--active" : ""}`}
      title={`${name}${abiName ? ` (${abiName})` : ""}: ${hexVal}`}
    >
      <span className="reg-cell__name">{name}</span>
      {abiName && <span className="reg-cell__abi">{abiName}</span>}
      <span className="reg-cell__value">
        {isActive ? `0x${Number(value).toString(16).padStart(4, "0")}` : "0"}
      </span>
    </div>
  );
}

// ── Componente Principal ──────────────────────────────────────────────────

export function CycleInspector({ cycle }: Props) {
  const cards = buildCards(cycle);

  // Coleta todos os 32 registradores
  const regSource =
    cycle.registradores && Object.keys(cycle.registradores).length > 0
      ? cycle.registradores
      : Object.fromEntries(
          Object.entries(cycle).filter(([k]) => /^x\d+$/.test(k)),
        );

  const allRegs = Array.from({ length: 32 }, (_, i) => {
    const key = `x${i}`;
    return { name: key, value: regSource[key] };
  });

  const hasAnyActive = allRegs.some(
    (r) => r.value !== undefined && r.value !== 0 && r.value !== "0",
  );

  return (
    <div className="cycle-inspector">
      {/* ── Cards de Sinais ─────────────────────────────────────── */}
      <div>
        <p className="sidebar-label" style={{ marginBottom: "8px" }}>
          Sinais do Ciclo
        </p>
        <div className="info-grid">
          {cards.map((card) => (
            <div
              className="info-card"
              key={card.label}
              title={card.description}
            >
              <p className="info-card-label">
                <span
                  style={{
                    marginRight: "4px",
                    fontFamily: "var(--font-mono)",
                    opacity: 0.6,
                  }}
                >
                  {card.icon}
                </span>
                {card.label}
              </p>
              <p
                className={`info-card-value${
                  card.variant ? ` info-card-value--${card.variant}` : ""
                }`}
              >
                {card.value}
              </p>
              <p
                style={{
                  fontSize: "0.6rem",
                  color: "var(--text-muted)",
                  marginTop: "3px",
                  lineHeight: 1.3,
                }}
              >
                {card.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Banco de Registradores ──────────────────────────────── */}
      <div className="reg-section">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          <p className="sidebar-label" style={{ margin: 0 }}>
            Banco de Registradores (x0–x31)
          </p>
          {hasAnyActive && (
            <span
              style={{
                fontSize: "0.625rem",
                background: "rgba(37,99,235,0.08)",
                color: "var(--signal-active)",
                border: "1px solid rgba(37,99,235,0.25)",
                borderRadius: "4px",
                padding: "1px 5px",
              }}
            >
              {
                allRegs.filter(
                  (r) =>
                    r.value !== 0 && r.value !== "0" && r.value !== undefined,
                ).length
              }{" "}
              ativos
            </span>
          )}
        </div>
        <div
          className="reg-grid"
          role="table"
          aria-label="Banco de registradores RISC-V"
        >
          {allRegs.map((reg) => (
            <RegCell
              key={reg.name}
              name={reg.name}
              value={reg.value}
              prevValue={undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
