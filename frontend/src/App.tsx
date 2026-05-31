import { useState, useEffect, useRef, useCallback, useMemo, memo, lazy, Suspense } from "react";
const NetlistViewer = lazy(() => import("./components/NetlistViewer"));
// import DatapathViewer from "./components/DatapathViewer";
import "./App.css";

const API_BASE = "http://localhost:8000/api/v1";
const STORAGE_KEY = "verilog_classroom_project";

// ─── Utilities ────────────────────────────────────────────────────────────────
function precomputeTimeline(timeline: JSON) {
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

// Returns true if `modules` is a flat dict of scopes (backend format) rather than
// a single scope object. The distinction: a flat dict has no "variables" / "child_scopes"
// at the top level — those only appear inside individual scope entries.
function _isFlatModuleDict(modules) {
  if (!modules || typeof modules !== "object") return false;
  return modules.variables === undefined && modules.child_scopes === undefined;
}

function countClockEdges(timeline, clockSignal) {
  const times = Object.keys(timeline)
    .map(Number)
    .sort((a, b) => a - b);
  let edges = 0,
    prev = "0";
  for (const t of times) {
    const changes = timeline[String(t)];
    // Accept exact match OR suffix match (e.g. "clk" matches "tb.clk")
    const key =
      clockSignal in changes
        ? clockSignal
        : Object.keys(changes).find(
            (k) =>
              k === clockSignal || k.endsWith(`.${clockSignal}`),
          );
    if (key) {
      const val = changes[key];
      if (prev === "0" && val === "1") edges++;
      prev = val;
    }
  }
  return edges;
}

function findClockSignal(modules) {
  if (!modules) return null;
  if (_isFlatModuleDict(modules)) {
    // Backend flat-dict format: { "tb": { variables: {...}, child_scopes: [...] }, ... }
    for (const [scopeName, scope] of Object.entries(modules)) {
      const s = scope as any;
      if (s && s.variables) {
        for (const [name] of Object.entries(s.variables)) {
          if (/clk|clock/i.test(name as string)) return `${scopeName}.${name}`;
        }
      }
    }
    return null;
  }
  // Legacy single-scope recursive format
  const search = (mod) => {
    if (mod.variables) {
      for (const [name] of Object.entries(mod.variables)) {
        if (/clk|clock/i.test(name)) return name;
      }
    }
    if (mod.child_scopes && !Array.isArray(mod.child_scopes)) {
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
  if (_isFlatModuleDict(modules)) {
    // Backend flat-dict format: iterate every scope and collect variables with full paths
    for (const [scopeName, scope] of Object.entries(modules)) {
      const s = scope as any;
      if (s && s.variables) {
        for (const [name, info] of Object.entries(s.variables)) {
          signals.push({
            name: `${scopeName}.${name}`,
            shortName: name as string,
            ...(info as object),
          });
        }
      }
    }
    return signals;
  }
  // Legacy single-scope recursive format
  if (modules.variables) {
    for (const [name, info] of Object.entries(modules.variables)) {
      signals.push({
        name: prefix ? `${prefix}.${name}` : name,
        shortName: name,
        ...info,
      });
    }
  }
  if (modules.child_scopes && !Array.isArray(modules.child_scopes)) {
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
  Upload: memo(() => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )),
  Cpu: memo(() => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  )),
  Play: memo(() => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )),
  Pause: memo(() => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  )),
  StepB: memo(() => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" />
      <line x1="5" y1="19" x2="5" y2="5" />
    </svg>
  )),
  StepF: memo(() => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  )),
  SkipStart: memo(() => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="19 20 9 12 19 4" fill="currentColor" />
      <polygon points="10 20 3 12 10 4" fill="currentColor" />
      <line x1="2" y1="19" x2="2" y2="5" />
    </svg>
  )),
  SkipEnd: memo(() => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="5 4 15 12 5 20" fill="currentColor" />
      <polygon points="14 4 21 12 14 20" fill="currentColor" />
      <line x1="22" y1="5" x2="22" y2="19" />
    </svg>
  )),
  ChevR: memo(() => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )),
  ChevD: memo(() => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )),
  Check: memo(() => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )),
  X: memo(() => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )),
  Loader: memo(() => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="vc-loader-spin">
      <path d="M21 12a9 9 0 11-6.219-8.56" />
    </svg>
  )),
  Trash: memo(() => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )),
  Signal: memo(() => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )),
  Download: memo(() => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )),
  Book: memo(() => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )),
  Activity: memo(() => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )),
  Grid: memo(() => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  )),
  Terminal: memo(() => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )),
  Layers: memo(() => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )),
  RefreshCw: memo(() => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )),
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
  return (
    <div
      className={`vc-step-row ${isActive ? "vc-step-active" : ""} ${["vc-step-idle", "vc-step-loading", "vc-step-done", "vc-step-error"][step.status] || ""}`}
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

function ModuleTreeBase({ modules, selected, onSelect, prefix = "", flatDict = null }) {
  const [open, setOpen] = useState(true);
  if (!modules) return null;

  // Top-level call with flat dict: render each scope entry as a child tree node
  if (_isFlatModuleDict(modules)) {
    return (
      <div>
        {Object.entries(modules).map(([scopeName, scope]) => (
          <ModuleTree
            key={scopeName}
            modules={scope}
            selected={selected}
            onSelect={onSelect}
            prefix={scopeName}
            flatDict={modules}
          />
        ))}
      </div>
    );
  }

  const displayName = prefix.split(".").pop() || "root";
  const fd = flatDict ?? {};

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
                    [{(v as any).size ?? 1}b·{(v as any).var_type ?? (v as any).type ?? "wire"}]
                  </span>
                </div>
              ))}
          {modules.variables && Object.keys(modules.variables).length > 8 && (
            <div className="vc-mvar vc-mvar-more">
              +{Object.keys(modules.variables).length - 8} sinais
            </div>
          )}
          {/* child_scopes from backend is an array of scope-name strings */}
          {modules.child_scopes && Array.isArray(modules.child_scopes) &&
            (modules.child_scopes as string[]).map((childName) => {
              const shortChild = childName.split(".").pop() ?? childName;
              const childScope = (fd as any)[childName] ?? (fd as any)[shortChild];
              if (!childScope) return null;
              return (
                <ModuleTree
                  key={childName}
                  modules={childScope}
                  selected={selected}
                  onSelect={onSelect}
                  prefix={prefix ? `${prefix}.${childName}` : childName}
                  flatDict={fd}
                />
              );
            })}
          {/* Legacy: child_scopes as object */}
          {modules.child_scopes && !Array.isArray(modules.child_scopes) &&
            Object.entries(modules.child_scopes).map(([n, child]) => (
              <ModuleTree
                key={n}
                modules={child}
                selected={selected}
                onSelect={onSelect}
                prefix={prefix ? `${prefix}.${n}` : n}
                flatDict={flatDict}
              />
            ))}
        </div>
      )}
    </div>
  );
}
const ModuleTree = memo(ModuleTreeBase);

function WaveformViewer({
  sortedTimes,
  accumulated,
  currentTime,
  selectedSignals,
  onTimeClick,
}) {
  const ROW = 32,
    LABEL = 190,
    W = 720;
  if (!sortedTimes?.length)
    return (
      <div className="vc-empty">
        <Ic.Activity />
        <span>Execute a simulação para visualizar as formas de onda</span>
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
                            ? parseInt(seg.val, 2).toString(16).toUpperCase()
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
        <rect
          x={LABEL}
          y={24}
          width={W - LABEL - 24}
          height={36 + selectedSignals.length * ROW}
          fill="transparent"
          className="vc-waveform-crosshair"
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
const WaveformViewerMemo = memo(WaveformViewer);

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
    def: "Descrição estrutural de um circuito digital: lista de células lógicas (AND, OR, DFF, MUX) e suas interconexões, gerada a partir da simulação.",
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
    term: "Simulação (Icarus)",
    def: "Executa um design Verilog com um testbench para verificar comportamento. Icarus Verilog é um compilador/simulador open-source que gera saída VCD.",
  },
  {
    term: "Testbench",
    def: "Módulo Verilog não-sintetizável que gera entradas para seu design e observa saídas, simulando o ambiente em que o circuito vai operar.",
  },
  {
    term: "Barramento de Dados",
    def: "Grupo de fios que transporta palavras de dados (endereços, valores) entre componentes. Largura típica: 8, 16, 32 ou 64 bits.",
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

  // Pipeline: 2 etapas — Upload (0) + Simular (1)
  const [steps, setSteps] = useState([
    { index: 0, label: "Upload ZIP", status: 0 },
    { index: 1, label: "Simular", status: 0 },
  ]);
  const [currentStep, setCurrentStep] = useState(0);
  const [simResult, setSimResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consoleColl, setConsoleColl] = useState({ sim: true });
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
    () => precomputed?.accumulated?.[currentTime],
    [precomputed, currentTime],
  );
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

  const handleSim = async () => {
    if (!projectId) return;
    updStep(1, 1);
    try {
      const r = await apiSimulate(projectId);
      setSimResult(r);
      updStep(1, r.success ? 2 : 3);
      if (r.success) {
        setCurrentStep(2);
        setTab("waveform");
        setSelSignals(
          flattenSignals(r.simulation_log?.modules || {}).slice(0, 6),
        );
        setCurrentTime(0);
      } else {
        setErrors((e) => ({
          ...e,
          sim: "Icarus reportou erros — veja o console",
        }));
      }
    } catch (err) {
      updStep(1, 3);
      setErrors((e) => ({ ...e, sim: err.message }));
    }
  };

  const handleReset = async () => {
    if (projectId) await apiDelete(projectId).catch(() => {});
    setProjectId(null);
    setSimResult(null);
    setSteps([
      { index: 0, label: "Upload ZIP", status: 0 },
      { index: 1, label: "Simular", status: 0 },
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

  // Com o backend corrigido, netlist_content vem diretamente na resposta de simulação.
  // Os fallbacks extras garantem compatibilidade com versões antigas do backend.
  const netlistContent =
    simResult?.netlist_content ??
    simResult?.netlist ??
    simResult?.simulation_log?.netlist ??
    simResult?.simulation_log?.netlist_content ??
    null;

  const TABS = [
    { id: "waveform", label: "Waveform", icon: <Ic.Activity /> },
    // { id: "datapath", label: "Datapath", icon: <Ic.Layers /> },
    { id: "netlist", label: "Netlist", icon: <Ic.Grid /> },
    { id: "console", label: "Console", icon: <Ic.Terminal /> },
    { id: "education", label: "Glossário", icon: <Ic.Book /> },
  ];

  return (
    <>
      <div className="vc-app">
        {/* Header */}
        <header className="vc-header">
          <div className="vc-logo">
            <div className="vc-logo-mark">
              <Ic.Cpu />
            </div>
            <div>
              <div className="vc-logo-text">Verilog Classroom</div>
              <span className="vc-logo-sub">Icarus Verilog IDE</span>
            </div>
          </div>
          <div className="vc-sep" />
          <div className="vc-header-pills">
            {apiStat ? (
              <StatusPill
                label="Icarus"
                ok={apiStat.dependencies?.icarus_verilog === "available"}
              />
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
          {/* Sidebar */}
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
                  className="vc-display-none"
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                {errors.upload && (
                  <div className="vc-err">
                    <Ic.X />
                    {errors.upload}
                  </div>
                )}

                {/* Simular */}
                <button
                  className="vc-btn vc-btn-primary"
                  onClick={handleSim}
                  disabled={steps[0].status !== 2 || steps[1].status === 1}
                >
                  {steps[1].status === 1 ? (
                    <>
                      <Ic.Loader /> Simulando…
                    </>
                  ) : (
                    <>
                      <Ic.Play /> Executar Simulação
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
                  &nbsp;&nbsp;*.tb.v &nbsp;(testbench)
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
                <div className="vc-hier-empty">
                  Execute a simulação primeiro
                </div>
              )}
            </div>
          </aside>

          {/* Main */}
          <main className="vc-main">
            {/* Metrics */}
            {meta && (
              <div className="vc-metrics">
                <div className="vc-metric">
                  <div className="vc-metric-lbl">Timescale</div>
                  <div className="vc-metric-val amber vc-metric-mono-font">
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

              {/* ── Netlist: idem ── */}
              {tab === "netlist" && (
                <div key="netlist" className="vc-flow-panel">
                  {netlistContent ? (
                    <Suspense fallback={<div className="vc-empty"><Ic.Loader /><span>Carregando visualizador...</span></div>}>
                      <NetlistViewer
                        netlistJson={netlistContent}
                        activeSignals={activeSignals}
                      />
                    </Suspense>
                  ) : (
                    <div className="vc-panel-empty-state">
                      <svg
                        width="48"
                        height="48"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#cbd5e1"
                        strokeWidth="1.5"
                      >
                        <rect x="4" y="4" width="16" height="16" rx="2" />
                        <rect x="9" y="9" width="6" height="6" />
                        <line x1="9" y1="1" x2="9" y2="4" />
                        <line x1="15" y1="1" x2="15" y2="4" />
                        <line x1="9" y1="20" x2="9" y2="23" />
                        <line x1="15" y1="20" x2="15" y2="23" />
                      </svg>
                      <div className="vc-empty-title">
                        {simResult
                          ? "Netlist não disponível — verifique se o Yosys está instalado no servidor e se o campo netlist_content foi retornado pelo backend."
                          : "Execute a simulação para visualizar o netlist."}
                      </div>
                      {simResult && (
                        <div className="vc-empty-details">
                          Campos retornados pelo backend:{" "}
                          <b className="vc-text-dark">
                            {Object.keys(simResult).join(", ")}
                          </b>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Demais abas: dentro do scroll normal ── */}
              {tab !== "datapath" && tab !== "netlist" && (
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
                      <WaveformViewerMemo
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
                                  (sig) =>
                                    s[sig.name] ?? s[sig.shortName] ?? "",
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
                        {netlistContent && (
                          <button
                            className="vc-export-btn"
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = URL.createObjectURL(
                                new Blob(
                                  [JSON.stringify(netlistContent, null, 2)],
                                  { type: "application/json" },
                                ),
                              );
                              a.download = "netlist.json";
                              a.click();
                            }}
                          >
                            <Ic.Download /> Exportar Netlist JSON
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {/* Console */}
                  {tab === "console" && (
                    <>
                      {simResult && (
                        <ConsolePanelLight
                          title="Icarus Verilog — Simulation Output"
                          stdout={simResult.stdout}
                          stderr={simResult.stderr}
                          collapsed={consoleColl.sim}
                          onToggle={() =>
                            setConsoleColl((c) => ({ ...c, sim: !c.sim }))
                          }
                        />
                      )}
                      {!simResult && (
                        <div className="vc-empty">
                          <Ic.Terminal />
                          <span>
                            Nenhuma saída de console — execute a simulação
                            primeiro
                          </span>
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
              )}

              {/* Playback bar */}
              {precomputed && (
                <div className="vc-playback">
                  {/* Skip to start */}
                  <button
                    className="vc-ctrl-btn"
                    title="Ir ao início"
                    onClick={() => setCurrentTime(precomputed.sorted[0])}
                  >
                    <Ic.SkipStart />
                  </button>
                  {/* Step back */}
                  <button
                    className="vc-ctrl-btn"
                    title="Passo anterior"
                    onClick={() => {
                      const idx = precomputed.sorted.indexOf(currentTime);
                      setCurrentTime(precomputed.sorted[Math.max(0, idx - 1)]);
                    }}
                  >
                    <Ic.StepB />
                  </button>
                  {/* Play/Pause */}
                  <button
                    className="vc-play-btn"
                    onClick={() => setPlaying((p) => !p)}
                  >
                    {playing ? <Ic.Pause /> : <Ic.Play />}
                  </button>
                  {/* Step forward */}
                  <button
                    className="vc-ctrl-btn"
                    title="Próximo passo"
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
                  {/* Skip to end */}
                  <button
                    className="vc-ctrl-btn"
                    title="Ir ao fim"
                    onClick={() =>
                      setCurrentTime(
                        precomputed.sorted[precomputed.sorted.length - 1],
                      )
                    }
                  >
                    <Ic.SkipEnd />
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
