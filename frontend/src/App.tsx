import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import NetlistViewer from "./NetlistViewer";
import DatapathViewer from "./DatapathViewer";
const API_BASE = "http://localhost:8000/api/v1";
const STORAGE_KEY = "verilog_classroom_project";

// ─── Utilities ────────────────────────────────────────────────────────────────
function precomputeTimeline(timeline) {
  const sorted = Object.keys(timeline)
    .map(Number)
    .sort((a, b) => a - b);
  const accumulated = {};
  let current = {};
  for (const t of sorted) {
    current = { ...current, ...timeline[String(t)] };
    accumulated[t] = { ...current };
  }
  return { sorted, accumulated };
}

function countClockEdges(timeline, clockSignal) {
  const times = Object.keys(timeline)
    .map(Number)
    .sort((a, b) => a - b);
  let edges = 0,
    prev = "0";
  for (const t of times) {
    const changes = timeline[String(t)];
    if (clockSignal in changes) {
      const val = changes[clockSignal];
      if (prev === "0" && val === "1") edges++;
      prev = val;
    }
  }
  return edges;
}

function findClockSignal(modules) {
  if (!modules) return null;
  const search = (mod) => {
    if (mod.variables) {
      for (const [name] of Object.entries(mod.variables)) {
        if (/clk|clock/i.test(name)) return name;
      }
    }
    if (mod.child_scopes) {
      for (const child of Object.values(mod.child_scopes)) {
        const f = search(child);
        if (f) return f;
      }
    }
    return null;
  };
  return search(modules);
}

function flattenSignals(modules, prefix = "") {
  if (!modules) return [];
  const signals = [];
  if (modules.variables) {
    for (const [name, info] of Object.entries(modules.variables)) {
      signals.push({
        name: prefix ? `${prefix}.${name}` : name,
        shortName: name,
        ...info,
      });
    }
  }
  if (modules.child_scopes) {
    for (const [scopeName, child] of Object.entries(modules.child_scopes)) {
      signals.push(
        ...flattenSignals(child, prefix ? `${prefix}.${scopeName}` : scopeName),
      );
    }
  }
  return signals;
}

// ─── API ──────────────────────────────────────────────────────────────────────
const apiStatus = () => fetch(`${API_BASE}/status/`).then((r) => r.json());
const apiUpload = async (file) => {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/verilog/upload-projeto-zip`, {
    method: "POST",
    body: fd,
  });
  if (!r.ok) throw new Error((await r.json()).detail);
  return r.json();
};
const apiMap = async (id) => {
  const r = await fetch(`${API_BASE}/verilog/mapear-processador`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: id }),
  });
  if (!r.ok) throw new Error((await r.json()).detail);
  return r.json();
};
const apiSimulate = async (id) => {
  const r = await fetch(`${API_BASE}/verilog/simular-execucao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: id }),
  });
  if (!r.ok) throw new Error((await r.json()).detail);
  return r.json();
};
const apiDelete = (id) =>
  fetch(`${API_BASE}/verilog/projeto/${id}`, { method: "DELETE" });

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ic = {
  Upload: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Cpu: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  ),
  Play: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  Pause: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  ),
  StepB: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" />
      <line x1="5" y1="19" x2="5" y2="5" />
    </svg>
  ),
  StepF: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  ),
  ChevR: () => (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  ChevD: () => (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Check: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  X: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Loader: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ animation: "vc-spin 0.75s linear infinite" }}
    >
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  ),
  Trash: () => (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Signal: () => (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Download: () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Book: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  Activity: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Grid: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  Terminal: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusPill({ label, ok }) {
  return (
    <div className={`vc-pill ${ok ? "vc-pill-ok" : "vc-pill-err"}`}>
      <span className="vc-dot" />
      {label}
    </div>
  );
}

function StepRow({ step, isActive }) {
  const icons = [null, <Ic.Loader />, <Ic.Check />, <Ic.X />];
  const stateClass =
    ["vc-step-idle", "vc-step-loading", "vc-step-done", "vc-step-error"][
      step.status
    ] || "";
  return (
    <div
      className={`vc-step-row ${isActive ? "vc-step-active" : ""} ${stateClass}`}
    >
      <div className="vc-step-num">
        {step.status === 0 && <span>{step.index + 1}</span>}
        {step.status === 1 && <Ic.Loader />}
        {step.status === 2 && <Ic.Check />}
        {step.status === 3 && <Ic.X />}
      </div>
      <span className="vc-step-lbl">{step.label}</span>
      {step.status === 2 && <div className="vc-step-line" />}
    </div>
  );
}

function ConsolePanelLight({ title, stdout, stderr, collapsed, onToggle }) {
  const color = (l) =>
    /error/i.test(l)
      ? "vc-cl-err"
      : /warning/i.test(l)
        ? "vc-cl-warn"
        : "vc-cl-normal";
  return (
    <div className="vc-console">
      <button className="vc-console-hdr" onClick={onToggle}>
        <Ic.Terminal />
        <span>{title}</span>
        <span className="vc-console-chevron">
          {collapsed ? <Ic.ChevR /> : <Ic.ChevD />}
        </span>
      </button>
      {!collapsed && (
        <div className="vc-console-body">
          {stdout && (
            <div className="vc-csec">
              <div className="vc-csec-lbl">stdout</div>
              <pre>
                {stdout.split("\n").map((l, i) => (
                  <div key={i} className={color(l)}>
                    {l || " "}
                  </div>
                ))}
              </pre>
            </div>
          )}
          {stderr && (
            <div className="vc-csec">
              <div className="vc-csec-lbl">stderr</div>
              <pre>
                {stderr.split("\n").map((l, i) => (
                  <div key={i} className={color(l)}>
                    {l || " "}
                  </div>
                ))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModuleTree({ modules, selected, onSelect, prefix = "" }) {
  const [open, setOpen] = useState(true);
  if (!modules) return null;
  const displayName = prefix.split(".").pop() || "root";
  return (
    <div className="vc-mtree">
      <button
        className="vc-mnode"
        onClick={() => {
          setOpen((o) => !o);
          onSelect(prefix);
        }}
      >
        <span className="vc-mchev">{open ? <Ic.ChevD /> : <Ic.ChevR />}</span>
        <Ic.Cpu />
        <span className={selected === prefix ? "vc-msel" : "vc-mlbl"}>
          {displayName}
        </span>
      </button>
      {open && (
        <div className="vc-mchildren">
          {modules.variables &&
            Object.entries(modules.variables)
              .slice(0, 8)
              .map(([n, v]) => (
                <div key={n} className="vc-mvar">
                  <Ic.Signal />
                  <span className="vc-mvar-name">{n}</span>
                  <span className="vc-mvar-meta">
                    [{v.size ?? 1}b·{v.type ?? "wire"}]
                  </span>
                </div>
              ))}
          {modules.variables && Object.keys(modules.variables).length > 8 && (
            <div className="vc-mvar vc-mvar-more">
              +{Object.keys(modules.variables).length - 8} signals
            </div>
          )}
          {modules.child_scopes &&
            Object.entries(modules.child_scopes).map(([n, child]) => (
              <ModuleTree
                key={n}
                modules={child}
                selected={selected}
                onSelect={onSelect}
                prefix={prefix ? `${prefix}.${n}` : n}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function WaveformViewer({
  sortedTimes,
  accumulated,
  currentTime,
  selectedSignals,
  onTimeClick,
}) {
  const ROW = 32;
  const LABEL = 190;
  const W = 720;
  if (!sortedTimes?.length)
    return (
      <div className="vc-empty">
        <Ic.Activity />
        <span>Run simulation to view waveforms</span>
      </div>
    );
  const end = sortedTimes[sortedTimes.length - 1] || 1;
  const tx = (t) => LABEL + (t / end) * (W - LABEL - 24);
  const tickStep = Math.max(1, Math.floor(sortedTimes.length / 12));

  return (
    <div className="vc-scroll-box">
      <svg width={W} height={selectedSignals.length * ROW + 50}>
        <defs>
          <pattern
            id="hatch"
            x="0"
            y="0"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <path d="M0,6 L6,0" stroke="#fde68a" strokeWidth="1" />
          </pattern>
        </defs>
        {/* axis */}
        <line
          x1={LABEL}
          y1={28}
          x2={W - 24}
          y2={28}
          stroke="#e2e8f0"
          strokeWidth={1}
        />
        {sortedTimes
          .filter((_, i) => i % tickStep === 0)
          .map((t) => (
            <g key={t}>
              <line
                x1={tx(t)}
                y1={24}
                x2={tx(t)}
                y2={32}
                stroke="#cbd5e1"
                strokeWidth={1}
              />
              <text
                x={tx(t)}
                y={18}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={8}
                fontFamily="'IBM Plex Mono',monospace"
              >
                {t}
              </text>
            </g>
          ))}
        {selectedSignals.map((sig, si) => {
          const y = 36 + si * ROW;
          const segs = [];
          let prev = null,
            prevX = LABEL;
          for (let i = 0; i < sortedTimes.length; i++) {
            const t = sortedTimes[i];
            const st = accumulated[t] || {};
            const val = st[sig.name] ?? st[sig.shortName] ?? null;
            const x = tx(t);
            if (prev !== null && i > 0)
              segs.push({ x: prevX, ex: x, val: prev, y });
            prev = val;
            prevX = x;
          }
          if (prev !== null) segs.push({ x: prevX, ex: W - 24, val: prev, y });

          return (
            <g key={sig.name}>
              {/* row bg alternating */}
              <rect
                x={0}
                y={y - 2}
                width={W}
                height={ROW - 2}
                fill={si % 2 === 0 ? "#f8fafc" : "#ffffff"}
                opacity={0.5}
              />
              <text
                x={LABEL - 8}
                y={y + ROW / 2 - 4}
                textAnchor="end"
                fill="#374151"
                fontSize={9.5}
                fontFamily="'IBM Plex Mono',monospace"
                fontWeight="500"
              >
                {sig.shortName.length > 22
                  ? sig.shortName.slice(0, 20) + "…"
                  : sig.shortName}
              </text>
              {segs.map((seg, idx) => {
                const is1 = seg.val === "1";
                const isXZ = /[xXzZ]/.test(seg.val ?? "") || seg.val === null;
                const high = seg.y + 3,
                  low = seg.y + ROW - 8,
                  mid = (high + low) / 2;
                const sw = Math.max(0, seg.ex - seg.x - 1);
                if ((sig.size ?? 1) === 1) {
                  return (
                    <line
                      key={idx}
                      x1={seg.x}
                      y1={is1 ? high : low}
                      x2={seg.ex}
                      y2={is1 ? high : low}
                      stroke={isXZ ? "#d97706" : is1 ? "#16a34a" : "#2563eb"}
                      strokeWidth={2}
                    />
                  );
                } else {
                  return (
                    <g key={idx}>
                      <rect
                        x={seg.x + 1}
                        y={high}
                        width={sw}
                        height={low - high}
                        fill={
                          isXZ ? "url(#hatch)" : is1 ? "#dcfce7" : "#eff6ff"
                        }
                        stroke={isXZ ? "#d97706" : "#2563eb"}
                        strokeWidth={0.8}
                      />
                      {sw > 32 && (
                        <text
                          x={seg.x + sw / 2}
                          y={mid + 3}
                          textAnchor="middle"
                          fill="#1d4ed8"
                          fontSize={8}
                          fontFamily="'IBM Plex Mono',monospace"
                        >
                          {seg.val != null
                            ? `${parseInt(seg.val, 2).toString(16).toUpperCase()}`
                            : "?"}
                        </text>
                      )}
                    </g>
                  );
                }
              })}
              <line
                x1={LABEL}
                y1={y + ROW - 3}
                x2={W - 24}
                y2={y + ROW - 3}
                stroke="#f1f5f9"
                strokeWidth={0.8}
              />
            </g>
          );
        })}
        {/* cursor */}
        {currentTime != null && (
          <g>
            <line
              x1={tx(currentTime)}
              y1={24}
              x2={tx(currentTime)}
              y2={36 + selectedSignals.length * ROW}
              stroke="#d97706"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
            <polygon
              points={`${tx(currentTime) - 5},24 ${tx(currentTime) + 5},24 ${tx(currentTime)},32`}
              fill="#d97706"
            />
          </g>
        )}
        {/* click area */}
        <rect
          x={LABEL}
          y={24}
          width={W - LABEL - 24}
          height={36 + selectedSignals.length * ROW}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const relX = e.clientX - r.left;
            const t = Math.round((relX / (W - LABEL - 24)) * end);
            onTimeClick && onTimeClick(Math.max(0, Math.min(end, t)));
          }}
        />
      </svg>
    </div>
  );
}

const GLOSSARY = [
  {
    term: "Flip-Flop (DFF)",
    def: "Elemento de memória bistável que armazena 1 bit de estado. Captura o valor de entrada na borda do clock. Espinha dorsal da lógica sequencial.",
  },
  {
    term: "Multiplexer (MUX)",
    def: "Circuito combinacional que seleciona um entre múltiplos sinais de entrada e roteia para uma única saída, baseado em um sinal de seleção.",
  },
  {
    term: "Netlist",
    def: "Descrição estrutural de um circuito digital: lista de células lógicas (AND, OR, DFF, MUX) e suas interconexões. Saída do Yosys após síntese.",
  },
  {
    term: "VCD (Value Change Dump)",
    def: "Formato ASCII padrão para capturar mudanças de valor de sinais ao longo do tempo de simulação. Produzido pelo Icarus Verilog.",
  },
  {
    term: "Timescale",
    def: "Define a unidade e precisão de tempo para a simulação Verilog. Ex: `1ns/1ps` = passos de 1ns com precisão de 1ps.",
  },
  {
    term: "Ciclo de Clock",
    def: "Período do sinal de clock — unidade fundamental do design digital síncrono. A lógica deve estabilizar dentro de um ciclo. Contado por bordas de subida (0→1).",
  },
  {
    term: "Wire vs. Reg",
    def: "Em Verilog, `wire` é uma conexão combinacional (sempre dirigida), enquanto `reg` é atribuída em blocos procedurais e pode virar flip-flop na síntese.",
  },
  {
    term: "Síntese (Yosys)",
    def: "Converte RTL Verilog em uma netlist de primitivas lógicas de nível de porta. Yosys é um suite de síntese open-source amplamente utilizado.",
  },
  {
    term: "Simulação (Icarus)",
    def: "Executa um design Verilog com um testbench para verificar comportamento. Icarus Verilog é um compilador/simulador open-source que gera saída VCD.",
  },
  {
    term: "Testbench",
    def: "Módulo Verilog não-sintetizável que gera entradas para seu design e observa saídas, simulando o ambiente em que o circuito vai operar.",
  },
];

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function VerilogClassroom() {
  const [apiStat, setApiStat] = useState(null);
  const [projectId, setProjectId] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY))?.projectId || null;
    } catch {
      return null;
    }
  });
  const [steps, setSteps] = useState([
    { index: 0, label: "Upload ZIP", status: 0 },
    { index: 1, label: "Map Netlist", status: 0 },
    { index: 2, label: "Simulate", status: 0 },
  ]);
  const [currentStep, setCurrentStep] = useState(0);
  const [mapResult, setMapResult] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState({});
  const [consoleColl, setConsoleColl] = useState({ map: true, sim: true });
  const [tab, setTab] = useState("waveform");
  const [selModule, setSelModule] = useState("");
  const [selSignals, setSelSignals] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const playRef = useRef(null);
  const fileRef = useRef(null);

  const precomputed = useMemo(
    () =>
      simResult?.simulation_log?.timeline
        ? precomputeTimeline(simResult.simulation_log.timeline)
        : null,
    [simResult],
  );
  const endTime = precomputed
    ? (precomputed.sorted[precomputed.sorted.length - 1] ?? 0)
    : 0;
  const allSignals = useMemo(
    () =>
      simResult?.simulation_log?.modules
        ? flattenSignals(simResult.simulation_log.modules)
        : [],
    [simResult],
  );
  const clockSignal = useMemo(
    () =>
      simResult?.simulation_log?.modules
        ? findClockSignal(simResult.simulation_log.modules)
        : null,
    [simResult],
  );
  const clockCycles = useMemo(
    () =>
      simResult?.simulation_log?.timeline && clockSignal
        ? countClockEdges(simResult.simulation_log.timeline, clockSignal)
        : 0,
    [simResult, clockSignal],
  );
  const activeSignals = useMemo(
    () => precomputed?.accumulated?.[currentTime] || {},
    [precomputed, currentTime],
  );

  // ---> ADICIONE ESTE BLOCO INTEIRO AQUI <---
  // Este hook traduz os sinais do seu Verilog para os blocos do Gráfico
  const activeDatapathElements = useMemo(() => {
    if (!activeSignals) return [];
    const activeIds = [];

    // Converte os nomes e valores dos sinais do ciclo atual para uma string
    // para facilitar a busca (você pode melhorar essa lógica depois para
    // buscar os nomes exatos das suas variáveis Verilog, como "ula_op" ou "pc_out").
    const activeState = JSON.stringify(activeSignals).toLowerCase();

    // Regras heurísticas simples: se o sinal mudou/existe, acende o bloco correspondente
    if (activeState.includes("pc")) {
      activeIds.push("pc", "imem", "e-pc-imem");
    }
    if (activeState.includes("alu") || activeState.includes("ula")) {
      activeIds.push("alu", "mux_alu", "e-reg-aluA", "e-muxB-aluB");
    }
    if (activeState.includes("reg")) {
      activeIds.push("regfile");
    }
    if (activeState.includes("mem")) {
      activeIds.push("dmem", "e-alu-dmem", "e-dmem-muxWb1");
    }
    if (activeState.includes("ctrl") || activeState.includes("op")) {
      activeIds.push("control", "c-ctrl-alu", "c-ctrl-mux");
    }

    return activeIds;
  }, [activeSignals]);
  useEffect(() => {
    if (projectId)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ projectId }));
  }, [projectId]);
  useEffect(() => {
    apiStatus()
      .then(setApiStat)
      .catch(() => setApiStat(null));
  }, []);
  useEffect(() => {
    const h = () => {
      if (projectId) apiDelete(projectId);
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [projectId]);

  useEffect(() => {
    if (!playing || !precomputed) return;
    clearInterval(playRef.current);
    playRef.current = setInterval(() => {
      setCurrentTime((t) => {
        const idx = precomputed.sorted.indexOf(t);
        if (idx < 0 || idx >= precomputed.sorted.length - 1) {
          setPlaying(false);
          return precomputed.sorted[precomputed.sorted.length - 1];
        }
        return precomputed.sorted[idx + 1];
      });
    }, 500 / speed);
    return () => clearInterval(playRef.current);
  }, [playing, speed, precomputed]);

  const updStep = (i, s) =>
    setSteps((st) => st.map((x) => (x.index === i ? { ...x, status: s } : x)));

  const handleFile = async (file) => {
    if (!file?.name.endsWith(".zip")) {
      setErrors((e) => ({ ...e, upload: "Selecione um arquivo .zip" }));
      return;
    }
    setErrors({});
    updStep(0, 1);
    try {
      const r = await apiUpload(file);
      setProjectId(r.project_id);
      updStep(0, 2);
      setCurrentStep(1);
    } catch (err) {
      updStep(0, 3);
      setErrors((e) => ({ ...e, upload: err.message }));
    }
  };
  const handleMap = async () => {
    if (!projectId) return;
    updStep(1, 1);
    try {
      const r = await apiMap(projectId);
      setMapResult(r);
      updStep(1, r.success ? 2 : 3);
      if (r.success) setCurrentStep(2);
      else
        setErrors((e) => ({
          ...e,
          map: "Yosys reportou erros — veja o console",
        }));
    } catch (err) {
      updStep(1, 3);
      setErrors((e) => ({ ...e, map: err.message }));
    }
  };
  const handleSim = async () => {
    if (!projectId) return;
    updStep(2, 1);
    try {
      const r = await apiSimulate(projectId);
      setSimResult(r);
      updStep(2, r.success ? 2 : 3);
      if (r.success) {
        setCurrentStep(3);
        setTab("waveform");
        setSelSignals(
          flattenSignals(r.simulation_log?.modules || {}).slice(0, 6),
        );
        setCurrentTime(0);
      } else
        setErrors((e) => ({
          ...e,
          sim: "Icarus reportou erros — veja o console",
        }));
    } catch (err) {
      updStep(2, 3);
      setErrors((e) => ({ ...e, sim: err.message }));
    }
  };
  const handleReset = async () => {
    if (projectId) await apiDelete(projectId).catch(() => {});
    setProjectId(null);
    setMapResult(null);
    setSimResult(null);
    setSteps([
      { index: 0, label: "Upload ZIP", status: 0 },
      { index: 1, label: "Map Netlist", status: 0 },
      { index: 2, label: "Simulate", status: 0 },
    ]);
    setCurrentStep(0);
    setErrors({});
    setSelSignals([]);
    setPlaying(false);
    setCurrentTime(0);
    localStorage.removeItem(STORAGE_KEY);
  };
  const toggleSig = (sig) =>
    setSelSignals((s) =>
      s.find((x) => x.name === sig.name)
        ? s.filter((x) => x.name !== sig.name)
        : [...s, sig],
    );

  const meta = simResult?.simulation_log?.metadata;

  const TABS = [
    { id: "waveform", label: "Waveform", icon: <Ic.Activity /> },
    { id: "datapath", label: "Datapath", icon: <Ic.Cpu /> }, // <--- NOVA ABA AQUI
    { id: "netlist", label: "Netlist", icon: <Ic.Grid /> },
    { id: "console", label: "Console", icon: <Ic.Terminal /> },
    { id: "education", label: "Glossário", icon: <Ic.Book /> },
  ];
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,700;1,9..144,400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg:       #f0f2f5;
          --bg2:      #e8ebf0;
          --surface:  #ffffff;
          --surface2: #f8fafc;
          --surface3: #f1f5f9;
          --border:   #e2e8f0;
          --border2:  #cbd5e1;
          --text:     #0f172a;
          --text2:    #374151;
          --text3:    #64748b;
          --text4:    #94a3b8;
          --accent:   #2563eb;
          --accent2:  #1d4ed8;
          --amber:    #d97706;
          --amber2:   #b45309;
          --green:    #16a34a;
          --red:      #dc2626;
          --purple:   #7c3aed;
          --cyan:     #0891b2;
          --shadow-sm: 0 1px 3px rgba(15,23,42,0.07), 0 1px 2px rgba(15,23,42,0.05);
          --shadow-md: 0 4px 12px rgba(15,23,42,0.09), 0 2px 6px rgba(15,23,42,0.06);
          --shadow-lg: 0 10px 30px rgba(15,23,42,0.12), 0 4px 12px rgba(15,23,42,0.07);
          --mono: 'IBM Plex Mono', monospace;
          --serif: 'Fraunces', Georgia, serif;
          --radius: 8px;
        }

        body { background: var(--bg); color: var(--text); font-family: var(--mono); -webkit-font-smoothing: antialiased; }

        @keyframes vc-spin { to { transform: rotate(360deg); } }
        @keyframes vc-fadein { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }

        /* ── LAYOUT ── */
        .vc-app { display: grid; grid-template-rows: auto 1fr; height: 100vh; overflow: hidden; }
        .vc-layout { display: grid; grid-template-columns: 272px 1fr; overflow: hidden; }

        /* ── HEADER ── */
        .vc-header {
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
          padding: 0 24px;
          display: flex; align-items: center; gap: 14px;
          height: 54px; z-index: 10;
        }
        .vc-logo {
          display: flex; align-items: center; gap: 10px;
        }
        .vc-logo-mark {
          width: 30px; height: 30px; border-radius: 7px;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          display: flex; align-items: center; justify-content: center;
          color: white;
          box-shadow: 0 2px 8px #2563eb40;
        }
        .vc-logo-text {
          font-family: var(--serif); font-weight: 700; font-size: 17px;
          color: var(--text); letter-spacing: -0.4px; line-height: 1;
        }
        .vc-logo-sub {
          font-family: var(--mono); font-weight: 300; font-size: 10px;
          color: var(--text3); letter-spacing: 2px; text-transform: uppercase;
          display: block; margin-top: 1px;
        }
        .vc-sep { flex: 1; }
        .vc-header-pills { display: flex; gap: 8px; align-items: center; }

        .vc-pill {
          display: flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 500; color: var(--text2);
          background: var(--surface2); border: 1px solid var(--border);
          border-radius: 20px; padding: 4px 10px;
          letter-spacing: 0.3px;
        }
        .vc-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .vc-pill-ok .vc-dot { background: var(--green); box-shadow: 0 0 5px #16a34a60; }
        .vc-pill-err .vc-dot { background: var(--red); box-shadow: 0 0 5px #dc262660; }

        .vc-btn-reset {
          display: flex; align-items: center; gap: 6px;
          background: transparent; border: 1px solid var(--border);
          color: var(--text3); font-family: var(--mono); font-size: 10px;
          padding: 5px 12px; border-radius: 6px; cursor: pointer;
          transition: all 0.15s; letter-spacing: 0.2px;
        }
        .vc-btn-reset:hover { border-color: var(--red); color: var(--red); background: #fef2f2; }

        /* ── SIDEBAR ── */
        .vc-sidebar {
          background: var(--surface);
          border-right: 1px solid var(--border);
          display: flex; flex-direction: column;
          overflow-y: auto; overflow-x: hidden;
        }

        /* ── PIPELINE SECTION ── */
        .vc-section { padding: 18px 16px; border-bottom: 1px solid var(--border); }
        .vc-section-title {
          font-size: 9px; font-weight: 600; color: var(--text4);
          text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 14px;
        }

        .vc-steps { display: flex; flex-direction: column; gap: 6px; position: relative; }
        .vc-step-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 6px;
          border: 1px solid transparent; transition: all 0.15s;
          position: relative;
        }
        .vc-step-active { background: #eff6ff; border-color: #bfdbfe; }
        .vc-step-done   { background: #f0fdf4; border-color: #bbf7d0; }
        .vc-step-error  { background: #fef2f2; border-color: #fecaca; }
        .vc-step-num {
          width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
          border: 1.5px solid var(--border2);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 600; color: var(--text3);
          background: var(--surface);
        }
        .vc-step-active  .vc-step-num { border-color: var(--accent); color: var(--accent); }
        .vc-step-done    .vc-step-num { border-color: var(--green); color: var(--green); background: #f0fdf4; }
        .vc-step-error   .vc-step-num { border-color: var(--red); color: var(--red); }
        .vc-step-loading .vc-step-num { border-color: var(--amber); color: var(--amber); }
        .vc-step-lbl { font-size: 11px; font-weight: 500; color: var(--text2); }
        .vc-step-active .vc-step-lbl { color: var(--accent); }
        .vc-step-done   .vc-step-lbl { color: var(--green); }
        .vc-step-error  .vc-step-lbl { color: var(--red); }

        /* ── UPLOAD AREA ── */
        .vc-upload {
          border: 1.5px dashed var(--border2); border-radius: var(--radius);
          padding: 18px 12px; text-align: center; cursor: pointer;
          transition: all 0.2s; color: var(--text3); font-size: 11px;
          background: var(--surface2);
        }
        .vc-upload:hover, .vc-upload-drag { border-color: var(--accent); color: var(--accent); background: #eff6ff; }
        .vc-upload-icon { color: var(--text4); margin-bottom: 8px; display: flex; justify-content: center; }
        .vc-upload-hint { font-size: 9px; color: var(--text4); margin-top: 4px; }
        .vc-upload-id {
          font-size: 8.5px; color: var(--text3); margin-top: 6px;
          word-break: break-all; background: var(--surface3); border-radius: 4px;
          padding: 4px 6px; text-align: left;
        }

        /* ── BUTTONS ── */
        .vc-btn {
          display: flex; align-items: center; justify-content: center; gap: 7px;
          border-radius: 7px; font-family: var(--mono); font-size: 11px;
          font-weight: 500; padding: 9px 14px; cursor: pointer;
          transition: all 0.15s; width: 100%; border: none;
          letter-spacing: 0.2px;
        }
        .vc-btn-primary {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
          color: white; box-shadow: 0 2px 8px #2563eb30;
        }
        .vc-btn-primary:hover:not(:disabled) { box-shadow: 0 4px 14px #2563eb40; transform: translateY(-1px); }
        .vc-btn-primary:active:not(:disabled) { transform: translateY(0); }
        .vc-btn-secondary {
          background: var(--surface2); color: var(--text2);
          border: 1px solid var(--border);
        }
        .vc-btn-secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: #eff6ff; }
        .vc-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

        .vc-err { font-size: 10px; color: var(--red); margin-top: 5px; display: flex; gap: 4px; align-items: flex-start; }
        .vc-form-gap { display: flex; flex-direction: column; gap: 8px; }

        /* ── PROJECT TIP ── */
        .vc-tip {
          border-radius: var(--radius); border: 1px solid #fde68a;
          background: #fffbeb; padding: 10px 12px;
          font-size: 9.5px; color: #92400e; line-height: 1.9;
        }
        .vc-tip-title { font-weight: 600; font-size: 9px; color: var(--amber); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }

        /* ── MODULE TREE ── */
        .vc-modules { padding: 16px; flex: 1; }
        .vc-mtree { font-size: 11px; }
        .vc-mnode {
          display: flex; align-items: center; gap: 5px;
          background: transparent; border: none; color: var(--text3);
          font-family: var(--mono); font-size: 11px; cursor: pointer;
          padding: 4px 0; width: 100%; text-align: left;
          transition: color 0.1s;
        }
        .vc-mnode:hover { color: var(--text); }
        .vc-mchev { display: flex; color: var(--text4); }
        .vc-mlbl { color: var(--text2); font-weight: 500; }
        .vc-msel { color: var(--accent); font-weight: 600; }
        .vc-mchildren { margin-left: 14px; border-left: 1.5px solid var(--border); padding-left: 10px; }
        .vc-mvar { display: flex; align-items: center; gap: 5px; padding: 2px 0; color: var(--text4); }
        .vc-mvar-name { color: var(--text3); font-size: 10px; }
        .vc-mvar-meta { color: var(--text4); font-size: 9px; }
        .vc-mvar-more { font-size: 9px; font-style: italic; }

        /* ── MAIN PANEL ── */
        .vc-main { display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }

        /* ── METRICS BAR ── */
        .vc-metrics {
          background: var(--surface); border-bottom: 1px solid var(--border);
          display: flex; overflow-x: auto;
          box-shadow: var(--shadow-sm);
        }
        .vc-metric {
          padding: 12px 22px; border-right: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;
        }
        .vc-metric-lbl { font-size: 9px; font-weight: 600; color: var(--text4); text-transform: uppercase; letter-spacing: 1px; }
        .vc-metric-val {
          font-family: var(--serif); font-size: 22px; font-weight: 700;
          color: var(--text); line-height: 1; letter-spacing: -0.5px;
        }
        .vc-metric-val.blue   { color: var(--accent); }
        .vc-metric-val.amber  { color: var(--amber); }
        .vc-metric-val.green  { color: var(--green); }
        .vc-metric-val.cyan   { color: var(--cyan); font-size: 15px; font-family: var(--mono); font-weight: 600; margin-top: 3px; }
        .vc-metric-unit { font-size: 9px; color: var(--text4); }

        /* ── TAB BAR ── */
        .vc-tabs {
          background: var(--surface); border-bottom: 1px solid var(--border);
          display: flex; padding: 0 8px;
        }
        .vc-tab {
          display: flex; align-items: center; gap: 6px;
          padding: 10px 14px; font-size: 11px; font-weight: 500; color: var(--text3);
          background: transparent; border: none; border-bottom: 2px solid transparent;
          cursor: pointer; font-family: var(--mono);
          transition: all 0.15s; letter-spacing: 0.2px;
          margin-bottom: -1px;
        }
        .vc-tab:hover { color: var(--text2); }
        .vc-tab.vc-tab-active { color: var(--accent); border-bottom-color: var(--accent); }

        /* ── CONTENT ── */
        .vc-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .vc-content-scroll { flex: 1; overflow-y: auto; padding: 20px; animation: vc-fadein 0.2s ease; }

        /* ── SIGNAL CHIPS ── */
        .vc-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 14px; }
        .vc-chip {
          display: flex; align-items: center; gap: 4px;
          background: var(--surface); border: 1px solid var(--border);
          color: var(--text3); font-size: 10px; font-weight: 500;
          padding: 4px 9px; border-radius: 20px; cursor: pointer;
          transition: all 0.12s; box-shadow: var(--shadow-sm);
        }
        .vc-chip:hover { border-color: var(--accent); color: var(--accent); }
        .vc-chip-on { border-color: var(--accent); color: var(--accent); background: #eff6ff; box-shadow: 0 0 0 1px #bfdbfe; }

        /* ── SCROLL BOXES ── */
        .vc-scroll-box {
          overflow: auto; background: var(--surface); border-radius: var(--radius);
          border: 1px solid var(--border); box-shadow: var(--shadow-sm);
          min-height: 260px;
        }
        .vc-empty {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          height: 200px; color: var(--text4); font-size: 12px;
        }

        /* ── EXPORT BAR ── */
        .vc-exports { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
        .vc-export-btn {
          display: flex; align-items: center; gap: 5px;
          background: var(--surface); border: 1px solid var(--border);
          color: var(--text3); font-family: var(--mono); font-size: 10px;
          padding: 6px 12px; border-radius: 6px; cursor: pointer;
          transition: all 0.12s; box-shadow: var(--shadow-sm);
          font-weight: 500;
        }
        .vc-export-btn:hover { border-color: var(--accent); color: var(--accent); background: #eff6ff; }

        /* ── CONSOLE ── */
        .vc-console { border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 10px; box-shadow: var(--shadow-sm); }
        .vc-console-hdr {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px; background: var(--surface3); border: none;
          color: var(--text2); font-family: var(--mono); font-size: 11px; font-weight: 500;
          cursor: pointer; width: 100%; letter-spacing: 0.2px;
        }
        .vc-console-hdr:hover { background: var(--surface2); }
        .vc-console-chevron { margin-left: auto; color: var(--text4); }
        .vc-console-body { background: var(--surface); max-height: 320px; overflow-y: auto; }
        .vc-csec { padding: 10px 14px; }
        .vc-csec-lbl { font-size: 9px; font-weight: 600; color: var(--text4); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
        .vc-console-body pre { font-family: var(--mono); font-size: 10px; line-height: 1.7; white-space: pre-wrap; word-break: break-all; }
        .vc-cl-err  { color: var(--red); }
        .vc-cl-warn { color: var(--amber); }
        .vc-cl-normal { color: var(--text2); }

        /* ── PLAYBACK ── */
        .vc-playback {
          background: var(--surface); border-top: 1px solid var(--border);
          padding: 10px 20px; display: flex; align-items: center; gap: 10px;
          box-shadow: 0 -2px 8px rgba(15,23,42,0.05);
        }
        .vc-play-btn {
          width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          border: none; color: white;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; box-shadow: 0 2px 8px #2563eb35;
          transition: all 0.15s;
        }
        .vc-play-btn:hover { transform: scale(1.08); box-shadow: 0 4px 14px #2563eb40; }
        .vc-ctrl-btn {
          width: 28px; height: 28px; flex-shrink: 0;
          border-radius: 6px; border: 1px solid var(--border);
          background: var(--surface2); color: var(--text3);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.12s;
        }
        .vc-ctrl-btn:hover { border-color: var(--accent); color: var(--accent); background: #eff6ff; }
        .vc-slider {
          flex: 1; -webkit-appearance: none; height: 4px; border-radius: 2px;
          outline: none; cursor: pointer; background: var(--border);
          transition: background 0.2s;
        }
        .vc-slider::-webkit-slider-thumb {
          -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
          background: var(--accent); cursor: pointer;
          box-shadow: 0 0 0 3px white, 0 0 0 4px #bfdbfe;
          transition: all 0.15s;
        }
        .vc-slider:hover::-webkit-slider-thumb { transform: scale(1.2); }
        .vc-time-lbl { font-size: 10.5px; color: var(--text3); min-width: 90px; text-align: right; font-weight: 500; }
        .vc-speed-sel {
          background: var(--surface2); border: 1px solid var(--border);
          color: var(--text2); font-family: var(--mono); font-size: 10px;
          padding: 4px 7px; border-radius: 6px; cursor: pointer; font-weight: 500;
        }
        .vc-cycle-badge {
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          border: 1px solid #bfdbfe; color: var(--accent);
          font-size: 10px; font-weight: 600; padding: 4px 10px; border-radius: 20px;
          white-space: nowrap;
        }

        /* ── GLOSSARY ── */
        .vc-glossary { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px,1fr)); gap: 14px; }
        .vc-gcard {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 16px 18px;
          box-shadow: var(--shadow-sm); transition: box-shadow 0.15s, transform 0.15s;
        }
        .vc-gcard:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
        .vc-gterm {
          font-family: var(--serif); font-size: 14px; font-weight: 700;
          color: var(--text); margin-bottom: 8px; letter-spacing: -0.2px;
        }
        .vc-gterm-accent { color: var(--accent); }
        .vc-gdef { font-size: 11px; color: var(--text2); line-height: 1.7; }

        /* ── DIVIDERS AND MISC ── */
        .vc-divider { height: 1px; background: var(--border); margin: 4px 0; }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--text4); }
      `}</style>

      <div className="vc-app">
        {/* ── Header ── */}
        <header className="vc-header">
          <div className="vc-logo">
            <div className="vc-logo-mark">
              <Ic.Cpu />
            </div>
            <div>
              <div className="vc-logo-text">Verilog Classroom</div>
              <span className="vc-logo-sub">Hardware IDE</span>
            </div>
          </div>
          <div className="vc-sep" />
          <div className="vc-header-pills">
            {apiStat ? (
              <>
                <StatusPill
                  label="Yosys"
                  ok={apiStat.dependencies?.yosys === "available"}
                />
                <StatusPill
                  label="Icarus"
                  ok={apiStat.dependencies?.icarus_verilog === "available"}
                />
              </>
            ) : (
              <StatusPill label="API offline" ok={false} />
            )}
          </div>
          {projectId && (
            <button className="vc-btn-reset" onClick={handleReset}>
              <Ic.Trash /> Reiniciar
            </button>
          )}
        </header>

        <div className="vc-layout">
          {/* ── Sidebar ── */}
          <aside className="vc-sidebar">
            {/* Pipeline */}
            <div className="vc-section">
              <div className="vc-section-title">Pipeline</div>
              <div className="vc-steps">
                {steps.map((s) => (
                  <StepRow
                    key={s.index}
                    step={s}
                    isActive={s.index === currentStep}
                  />
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="vc-section">
              <div className="vc-section-title">Ações</div>
              <div className="vc-form-gap">
                {/* Upload */}
                <div
                  className={`vc-upload ${dragging ? "vc-upload-drag" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    handleFile(e.dataTransfer.files[0]);
                  }}
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="vc-upload-icon">
                    <Ic.Upload />
                  </div>
                  <div>
                    {projectId
                      ? "Projeto carregado"
                      : "Arraste o .zip ou clique aqui"}
                  </div>
                  {projectId ? (
                    <div className="vc-upload-id">{projectId}</div>
                  ) : (
                    <div className="vc-upload-hint">Somente arquivos .zip</div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".zip"
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                {errors.upload && (
                  <div className="vc-err">
                    <Ic.X />
                    {errors.upload}
                  </div>
                )}

                {/* Map */}
                <button
                  className="vc-btn vc-btn-secondary"
                  onClick={handleMap}
                  disabled={!projectId || steps[1].status === 1}
                >
                  {steps[1].status === 1 ? (
                    <>
                      <Ic.Loader /> Mapeando…
                    </>
                  ) : (
                    <>
                      <Ic.Cpu /> Map Netlist
                    </>
                  )}
                </button>
                {errors.map && (
                  <div className="vc-err">
                    <Ic.X />
                    {errors.map}
                  </div>
                )}

                {/* Simulate */}
                <button
                  className="vc-btn vc-btn-primary"
                  onClick={handleSim}
                  disabled={steps[1].status !== 2 || steps[2].status === 1}
                >
                  {steps[2].status === 1 ? (
                    <>
                      <Ic.Loader /> Simulando…
                    </>
                  ) : (
                    <>
                      <Ic.Play /> Run Simulation
                    </>
                  )}
                </button>
                {errors.sim && (
                  <div className="vc-err">
                    <Ic.X />
                    {errors.sim}
                  </div>
                )}

                {/* Tip */}
                <div className="vc-tip">
                  <div className="vc-tip-title">Estrutura do ZIP</div>
                  meu_projeto.zip/
                  <br />
                  &nbsp;&nbsp;*.v &nbsp;(arquivos Verilog)
                  <br />
                  &nbsp;&nbsp;scripts/ &nbsp;(scripts de sim)
                </div>
              </div>
            </div>

            {/* Module Tree */}
            <div className="vc-modules">
              <div className="vc-section-title">Hierarquia</div>
              {simResult?.simulation_log?.modules ? (
                <ModuleTree
                  modules={simResult.simulation_log.modules}
                  selected={selModule}
                  onSelect={setSelModule}
                />
              ) : (
                <div style={{ fontSize: 11, color: "var(--text4)" }}>
                  Nenhum dado de simulação
                </div>
              )}
            </div>
          </aside>

          {/* ── Main ── */}
          <main className="vc-main">
            {/* Metrics */}
            {meta && (
              <div className="vc-metrics">
                <div className="vc-metric">
                  <div className="vc-metric-lbl">Timescale</div>
                  <div
                    className="vc-metric-val amber"
                    style={{ fontSize: 18, fontFamily: "var(--mono)" }}
                  >
                    {meta.timescale?.unit ?? "ns"}
                  </div>
                </div>
                <div className="vc-metric">
                  <div className="vc-metric-lbl">End Time</div>
                  <div className="vc-metric-val blue">
                    {meta.endtime ?? endTime}
                  </div>
                  <div className="vc-metric-unit">
                    {meta.timescale?.unit ?? "ns"}
                  </div>
                </div>
                <div className="vc-metric">
                  <div className="vc-metric-lbl">Ciclos de Clock</div>
                  <div className="vc-metric-val green">{clockCycles}</div>
                </div>
                <div className="vc-metric">
                  <div className="vc-metric-lbl">Total de Sinais</div>
                  <div className="vc-metric-val">{allSignals.length}</div>
                </div>
                {clockSignal && (
                  <div className="vc-metric">
                    <div className="vc-metric-lbl">Sinal de Clock</div>
                    <div className="vc-metric-val cyan">{clockSignal}</div>
                  </div>
                )}
              </div>
            )}

            {/* Tabs */}
            <div className="vc-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  className={`vc-tab ${tab === t.id ? "vc-tab-active" : ""}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="vc-content">
              <div className="vc-content-scroll">
                {/* Waveform */}
                {tab === "waveform" && (
                  <>
                    <div className="vc-chips">
                      {allSignals.map((sig) => (
                        <button
                          key={sig.name}
                          className={`vc-chip ${selSignals.find((x) => x.name === sig.name) ? "vc-chip-on" : ""}`}
                          onClick={() => toggleSig(sig)}
                        >
                          <Ic.Signal />
                          {sig.shortName}
                        </button>
                      ))}
                    </div>
                    <WaveformViewer
                      sortedTimes={precomputed?.sorted}
                      accumulated={precomputed?.accumulated}
                      currentTime={currentTime}
                      selectedSignals={selSignals}
                      onTimeClick={setCurrentTime}
                    />
                    <div className="vc-exports">
                      <button
                        className="vc-export-btn"
                        onClick={() => {
                          if (!precomputed || !selSignals.length) return;
                          const rows = precomputed.sorted.map((t) => {
                            const s = precomputed.accumulated[t] || {};
                            return [
                              t,
                              ...selSignals.map(
                                (sig) => s[sig.name] ?? s[sig.shortName] ?? "",
                              ),
                            ].join(",");
                          });
                          const csv = [
                            "timestamp," +
                              selSignals.map((s) => s.shortName).join(","),
                            ...rows,
                          ].join("\n");
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(
                            new Blob([csv], { type: "text/csv" }),
                          );
                          a.download = "timeline.csv";
                          a.click();
                        }}
                      >
                        <Ic.Download /> Exportar CSV
                      </button>
                      <button
                        className="vc-export-btn"
                        onClick={() => {
                          if (!mapResult?.netlist_content) return;
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(
                            new Blob(
                              [
                                JSON.stringify(
                                  mapResult.netlist_content,
                                  null,
                                  2,
                                ),
                              ],
                              { type: "application/json" },
                            ),
                          );
                          a.download = "netlist.json";
                          a.click();
                        }}
                      >
                        <Ic.Download /> Exportar Netlist JSON
                      </button>
                    </div>
                  </>
                )}
                {/* Datapath - O NOVO SIMULADOR */}
                {tab === "datapath" && (
                  <div
                    style={{
                      height: "600px",
                      width: "100%",
                      borderRadius: "var(--radius)",
                      overflow: "hidden",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <DatapathViewer activeElements={activeDatapathElements} />
                  </div>
                )}
                {/* Netlist */}
                {/* Netlist */}
                {tab === "netlist" && (
                  <div style={{ height: "600px", width: "100%" }}>
                    <NetlistViewer
                      netlistJson={mapResult?.netlist_content}
                      activeSignals={activeSignals} // <--- ADICIONE ESTA LINHA AQUI
                    />
                  </div>
                )}

                {/* Console */}
                {tab === "console" && (
                  <>
                    {mapResult && (
                      <ConsolePanelLight
                        title="Yosys — Mapping Output"
                        stdout={mapResult.stdout}
                        stderr={mapResult.stderr}
                        collapsed={consoleColl.map}
                        onToggle={() =>
                          setConsoleColl((c) => ({ ...c, map: !c.map }))
                        }
                      />
                    )}
                    {simResult && (
                      <ConsolePanelLight
                        title="Icarus — Simulation Output"
                        stdout={simResult.stdout}
                        stderr={simResult.stderr}
                        collapsed={consoleColl.sim}
                        onToggle={() =>
                          setConsoleColl((c) => ({ ...c, sim: !c.sim }))
                        }
                      />
                    )}
                    {!mapResult && !simResult && (
                      <div className="vc-empty">
                        Nenhuma saída de console — execute o pipeline primeiro
                      </div>
                    )}
                  </>
                )}

                {/* Glossary */}
                {tab === "education" && (
                  <div className="vc-glossary">
                    {GLOSSARY.map((g) => (
                      <div key={g.term} className="vc-gcard">
                        <div className="vc-gterm">
                          <span className="vc-gterm-accent">
                            {g.term.split(" ")[0]}
                          </span>
                          {" " + g.term.split(" ").slice(1).join(" ")}
                        </div>
                        <div className="vc-gdef">{g.def}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Playback */}
              {precomputed && (
                <div className="vc-playback">
                  <button
                    className="vc-ctrl-btn"
                    onClick={() => {
                      const idx = precomputed.sorted.indexOf(currentTime);
                      setCurrentTime(precomputed.sorted[Math.max(0, idx - 1)]);
                    }}
                  >
                    <Ic.StepB />
                  </button>
                  <button
                    className="vc-play-btn"
                    onClick={() => setPlaying((p) => !p)}
                  >
                    {playing ? <Ic.Pause /> : <Ic.Play />}
                  </button>
                  <button
                    className="vc-ctrl-btn"
                    onClick={() => {
                      const idx = precomputed.sorted.indexOf(currentTime);
                      setCurrentTime(
                        precomputed.sorted[
                          Math.min(precomputed.sorted.length - 1, idx + 1)
                        ],
                      );
                    }}
                  >
                    <Ic.StepF />
                  </button>
                  <input
                    type="range"
                    className="vc-slider"
                    min={0}
                    max={endTime}
                    value={currentTime}
                    onChange={(e) => {
                      const t = Number(e.target.value);
                      const c = precomputed.sorted.reduce(
                        (a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a),
                        precomputed.sorted[0],
                      );
                      setCurrentTime(c);
                    }}
                  />
                  <span className="vc-time-lbl">
                    {currentTime} / {endTime}
                  </span>
                  <select
                    className="vc-speed-sel"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    <option value={0.5}>0.5×</option>
                    <option value={1}>1×</option>
                    <option value={2}>2×</option>
                    <option value={5}>5×</option>
                  </select>
                  {clockCycles > 0 && (
                    <div className="vc-cycle-badge">{clockCycles} ciclos</div>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
