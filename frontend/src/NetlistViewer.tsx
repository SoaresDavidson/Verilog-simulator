import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  BaseEdge,
  getSmoothStepPath,
  EdgeLabelRenderer,
} from "@xyflow/react";
import type { Node, Edge, NodeProps, EdgeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as dagre from "dagre";

// ─── CSS INJETADO ─────────────────────────────────────────────────────────────
const NL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

@keyframes nl-flow { 0% { stroke-dashoffset: 20; } 100% { stroke-dashoffset: 0; } }
@keyframes nl-node-pop { from { opacity:0; transform:scale(0.85); } to { opacity:1; transform:scale(1); } }
@keyframes nl-pulse-dot { 0%,100%{opacity:1;} 50%{opacity:0.4;} }

.nl-node { animation: nl-node-pop 0.18s cubic-bezier(.34,1.56,.64,1) both; font-family: 'JetBrains Mono', monospace; }
.nl-edge-active { stroke-dasharray: 8 4; animation: nl-flow 0.5s linear infinite; }

/* ── TOOLBAR ── */
.nl-toolbar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  background: #ffffff; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 6px 10px;
  box-shadow: 0 2px 8px rgba(15,23,42,0.08);
  font-family: 'JetBrains Mono', monospace;
}
.nl-btn {
  font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 600;
  letter-spacing: 0.03em; padding: 5px 10px; border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #f8fafc; color: #64748b;
  cursor: pointer; transition: all 0.14s; white-space: nowrap;
  display: flex; align-items: center; gap: 5px;
}
.nl-btn:hover { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
.nl-btn-on { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
.nl-btn-danger:hover { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
.nl-sep { width: 1px; height: 18px; background: #e2e8f0; flex-shrink: 0; }

.nl-search {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 6px; color: #0f172a; font-family: 'JetBrains Mono', monospace;
  font-size: 9px; padding: 5px 9px; outline: none; width: 150px;
  transition: border-color 0.14s;
}
.nl-search:focus { border-color: #93c5fd; box-shadow: 0 0 0 2px #dbeafe; }
.nl-search::placeholder { color: #cbd5e1; }

/* ── CATEGORY CHIPS ── */
.nl-cat-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.nl-cat-chip {
  font-size: 8.5px; font-weight: 700; padding: 3px 8px; border-radius: 20px;
  border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;
  cursor: pointer; transition: all 0.13s; font-family: 'JetBrains Mono'; letter-spacing: 0.04em;
}
.nl-cat-chip:hover { border-color: #93c5fd; color: #2563eb; background: #eff6ff; }
.nl-cat-chip-on { color: #fff !important; border-color: transparent !important; }

/* ── LEGEND ── */
.nl-legend {
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  background: #ffffff; border: 1px solid #e2e8f0;
  border-radius: 8px; padding: 6px 12px;
  font-family: 'JetBrains Mono', monospace; font-size: 8px; color: #64748b;
  box-shadow: 0 1px 4px rgba(15,23,42,0.06);
}
.nl-legend-title { font-weight: 700; color: #374151; font-size: 8px; letter-spacing: 0.04em; text-transform: uppercase; margin-right: 2px; }
.nl-legend-item { display: flex; align-items: center; gap: 4px; }
.nl-legend-line { width: 18px; height: 3px; border-radius: 2px; flex-shrink: 0; }
.nl-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* ── TOOLTIP ── */
.nl-tooltip {
  position: fixed; z-index: 9999; pointer-events: none;
  background: #ffffff; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 10px 14px;
  box-shadow: 0 8px 24px rgba(15,23,42,0.14);
  min-width: 190px; max-width: 260px;
  font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #64748b;
}
.nl-tt-title { font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 5px; }
.nl-tt-badge { display: inline-block; font-size: 7.5px; font-weight: 700; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.06em; margin-bottom: 6px; }
.nl-tt-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
.nl-tt-key { color: #94a3b8; }
.nl-tt-val { color: #2563eb; font-weight: 600; }
.nl-tt-div { border: none; border-top: 1px solid #f1f5f9; margin: 5px 0; }

/* ── INFO PANEL ── */
.nl-info {
  position: absolute; top: 0; right: 0; width: 230px; height: 100%;
  background: #ffffff; border-left: 1px solid #e2e8f0;
  font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: #64748b;
  display: flex; flex-direction: column;
  box-shadow: -4px 0 16px rgba(15,23,42,0.07); z-index: 50;
}
.nl-info-hdr {
  padding: 12px 14px; border-bottom: 1px solid #f1f5f9;
  display: flex; justify-content: space-between; align-items: center;
  background: #f8fafc;
}
.nl-info-title { font-size: 10px; font-weight: 700; color: #0f172a; letter-spacing: 0.06em; text-transform: uppercase; }
.nl-info-body { flex: 1; overflow-y: auto; padding: 12px; }
.nl-info-body::-webkit-scrollbar { width: 3px; }
.nl-info-body::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }
.nl-info-stat { background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
.nl-info-stat-label { font-size: 8px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px; }
.nl-info-stat-val { font-size: 16px; font-weight: 700; color: #2563eb; }
.nl-info-stat-val.green { color: #16a34a; }
.nl-info-ports { margin-top: 6px; }
.nl-info-port { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f8fafc; }
.nl-info-port:last-child { border: none; }
.nl-info-port-name { color: #374151; font-size: 9px; }
.nl-info-port-dir { font-size: 7.5px; padding: 1px 5px; border-radius: 2px; font-weight: 700; }
.nl-info-port-dir.in  { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
.nl-info-port-dir.out { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
.nl-info-sec-label {
  font-size: 8px; color: #94a3b8; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.08em; margin: 10px 0 5px;
}

/* ── STATS BAR ── */
.nl-stats-bar {
  font-family: 'JetBrains Mono'; font-size: 9px; color: #64748b;
  background: #ffffff; border: 1px solid #e2e8f0;
  border-radius: 8px; padding: 6px 12px;
  display: flex; gap: 14px;
  box-shadow: 0 1px 4px rgba(15,23,42,0.06);
}
.nl-stats-bar b { font-weight: 700; }

/* ── HIGHLIGHTED NODES ── */
.nl-node-highlighted { box-shadow: 0 0 0 2px #2563eb, 0 0 12px #2563eb40; border-radius: 6px; }

/* ── REACTFLOW LIGHT OVERRIDES ── */
.nl-canvas .react-flow__controls {
  background: #ffffff !important; border: 1px solid #e2e8f0 !important;
  border-radius: 8px !important; box-shadow: 0 2px 8px rgba(15,23,42,0.08) !important;
}
.nl-canvas .react-flow__controls-button {
  background: transparent !important; border-color: #f1f5f9 !important;
  fill: #94a3b8 !important;
}
.nl-canvas .react-flow__controls-button:hover { background: #f8fafc !important; fill: #374151 !important; }
.nl-canvas .react-flow__minimap {
  background: #f8fafc !important; border: 1px solid #e2e8f0 !important;
  border-radius: 8px !important; box-shadow: 0 2px 8px rgba(15,23,42,0.08) !important;
  overflow: hidden;
}
.nl-canvas .react-flow__background { opacity: 0.6 !important; }
.nl-canvas .react-flow__edge-path { transition: stroke 0.2s, stroke-width 0.2s; }
`;

function injectNLCSS() {
  if (document.getElementById("nl-styles-light")) return;
  const s = document.createElement("style");
  s.id = "nl-styles-light";
  s.textContent = NL_CSS;
  document.head.appendChild(s);
}

// ─── TIPOS ────────────────────────────────────────────────────────────────────
interface NetlistViewerProps {
  netlistJson: any;
  activeSignals?: Record<string, string>;
}

interface NLNodeData extends Record<string, unknown> {
  label: string;
  category: string;
  nodeType: string;
  cellName: string;
  isActive: boolean;
  isDimmed: boolean;
  isHighlighted: boolean;
  ports: Array<{ name: string; dir: "input" | "output" }>;
  bits: number;
}

interface NLEdgeData extends Record<string, unknown> {
  isActive: boolean;
  bitWidth?: number;
  busType: "data" | "ctrl" | "clock" | "reset" | "output" | "wire";
  isHighlighted: boolean;
}

// ─── CORES DOS BARRAMENTOS ────────────────────────────────────────────────────
const BUS_COLORS: Record<string, string> = {
  data: "#2563eb", // azul — dados
  ctrl: "#d97706", // âmbar — controle
  clock: "#16a34a", // verde — clock
  reset: "#dc2626", // vermelho — reset
  output: "#7c3aed", // roxo — saída
  wire: "#94a3b8", // cinza — wire genérico
};

const BUS_LABELS: Record<string, string> = {
  data: "Dados",
  ctrl: "Controle",
  clock: "Clock",
  reset: "Reset",
  output: "Saída",
  wire: "Wire",
};

function classifyBus(
  portName: string,
): "data" | "ctrl" | "clock" | "reset" | "output" | "wire" {
  const n = portName.toLowerCase();
  if (/clk|clock/.test(n)) return "clock";
  if (/rst|reset/.test(n)) return "reset";
  if (/ctrl|control|sel|op|func|alu_op|funct/.test(n)) return "ctrl";
  if (/out|result|q\b|y\b/.test(n)) return "output";
  if (/data|bus|a\b|b\b|in\b|din|dout|mem|imm|addr/.test(n)) return "data";
  return "wire";
}

// ─── CATEGORIA → VISUAL ───────────────────────────────────────────────────────
interface CategoryConfig {
  color: string;
  bg: string;
  border: string;
  badge: string;
  shape: "rect" | "trapezoid" | "diamond" | "ellipse" | "dshape";
}

function getCategory(type: string): CategoryConfig {
  const t = type.toLowerCase().replace(/^\$/, "");
  if (/^(dff|sdff|adff|dffe)/.test(t))
    return {
      color: "#d97706",
      bg: "#fffbeb",
      border: "#fde68a",
      badge: "DFF",
      shape: "rect",
    };
  if (/^(mux|pmux|ternary)/.test(t))
    return {
      color: "#9333ea",
      bg: "#faf5ff",
      border: "#e9d5ff",
      badge: "MUX",
      shape: "trapezoid",
    };
  if (/^(add|sub)/.test(t))
    return {
      color: "#16a34a",
      bg: "#f0fdf4",
      border: "#bbf7d0",
      badge: "ARITH",
      shape: "dshape",
    };
  if (/^(mul|div)/.test(t))
    return {
      color: "#059669",
      bg: "#ecfdf5",
      border: "#a7f3d0",
      badge: "ARITH",
      shape: "dshape",
    };
  if (/^(and|or|xor|not|nand|nor)/.test(t))
    return {
      color: "#2563eb",
      bg: "#eff6ff",
      border: "#bfdbfe",
      badge: "GATE",
      shape: "ellipse",
    };
  if (/^(shl|shr|sshl|sshr)/.test(t))
    return {
      color: "#0891b2",
      bg: "#ecfeff",
      border: "#a5f3fc",
      badge: "SHIFT",
      shape: "diamond",
    };
  if (/^(lt|le|gt|ge|eq|ne)/.test(t))
    return {
      color: "#e11d48",
      bg: "#fff1f2",
      border: "#fecdd3",
      badge: "CMP",
      shape: "diamond",
    };
  if (/^(reduce)/.test(t))
    return {
      color: "#ea580c",
      bg: "#fff7ed",
      border: "#fed7aa",
      badge: "REDUCE",
      shape: "ellipse",
    };
  if (/^(mem|memrd|memwr)/.test(t))
    return {
      color: "#0d9488",
      bg: "#f0fdfa",
      border: "#99f6e4",
      badge: "MEM",
      shape: "rect",
    };
  return {
    color: "#64748b",
    bg: "#f8fafc",
    border: "#e2e8f0",
    badge: "CELL",
    shape: "rect",
  };
}

const ALL_CATEGORIES = [
  "DFF",
  "MUX",
  "ARITH",
  "GATE",
  "SHIFT",
  "CMP",
  "MEM",
  "CELL",
];
const CAT_COLORS: Record<string, string> = {
  DFF: "#d97706",
  MUX: "#9333ea",
  ARITH: "#16a34a",
  GATE: "#2563eb",
  SHIFT: "#0891b2",
  CMP: "#e11d48",
  MEM: "#0d9488",
  CELL: "#64748b",
};

// ─── ÍCONES SVG ───────────────────────────────────────────────────────────────
const IcClose = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IcInfo = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
const IcFit = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);
const IcMap = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);
const IcFilter = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
const IcFlash = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polygon
      points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
      fill="currentColor"
    />
  </svg>
);

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────
interface TooltipInfo {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  category: string;
  badge: string;
  color: string;
  ports: Array<{ name: string; dir: "input" | "output" }>;
  isActive: boolean;
  bits: number;
}
const TooltipCtx = React.createContext<{
  show: (i: Omit<TooltipInfo, "visible">) => void;
  hide: () => void;
}>({ show: () => {}, hide: () => {} });

function TooltipProvider({ children }: { children: React.ReactNode }) {
  const [tip, setTip] = useState<TooltipInfo>({
    visible: false,
    x: 0,
    y: 0,
    label: "",
    category: "",
    badge: "",
    color: "#fff",
    ports: [],
    isActive: false,
    bits: 1,
  });
  const show = useCallback(
    (i: Omit<TooltipInfo, "visible">) => setTip({ visible: true, ...i }),
    [],
  );
  const hide = useCallback(() => setTip((p) => ({ ...p, visible: false })), []);
  return (
    <TooltipCtx.Provider value={{ show, hide }}>
      {children}
      {tip.visible && (
        <div
          className="nl-tooltip"
          style={{ left: tip.x + 14, top: tip.y - 8 }}
        >
          <div className="nl-tt-title">{tip.label.split("$").pop()}</div>
          <span
            className="nl-tt-badge"
            style={{
              background: `${tip.color}18`,
              color: tip.color,
              border: `1px solid ${tip.color}40`,
            }}
          >
            {tip.badge}
          </span>
          <hr className="nl-tt-div" />
          <div className="nl-tt-row">
            <span className="nl-tt-key">tipo</span>
            <span className="nl-tt-val">{tip.category}</span>
          </div>
          <div className="nl-tt-row">
            <span className="nl-tt-key">bits</span>
            <span className="nl-tt-val">{tip.bits}</span>
          </div>
          <div className="nl-tt-row">
            <span className="nl-tt-key">status</span>
            <span
              className="nl-tt-val"
              style={{ color: tip.isActive ? "#16a34a" : "#94a3b8" }}
            >
              {tip.isActive ? "ativo" : "idle"}
            </span>
          </div>
          {tip.ports.length > 0 && (
            <>
              <hr className="nl-tt-div" />
              {tip.ports.slice(0, 5).map((p) => (
                <div className="nl-tt-row" key={p.name}>
                  <span className="nl-tt-key">{p.name}</span>
                  <span
                    style={{
                      fontSize: "7.5px",
                      padding: "1px 5px",
                      borderRadius: 2,
                      fontWeight: 700,
                      background: p.dir === "input" ? "#f0fdf4" : "#fffbeb",
                      color: p.dir === "input" ? "#16a34a" : "#d97706",
                      border: `1px solid ${p.dir === "input" ? "#bbf7d0" : "#fde68a"}`,
                    }}
                  >
                    {p.dir.toUpperCase()}
                  </span>
                </div>
              ))}
              {tip.ports.length > 5 && (
                <div
                  style={{ color: "#94a3b8", fontSize: "8px", marginTop: 3 }}
                >
                  +{tip.ports.length - 5} portas
                </div>
              )}
            </>
          )}
        </div>
      )}
    </TooltipCtx.Provider>
  );
}

// ─── NODE SHAPES (LIGHT THEME) ────────────────────────────────────────────────
const NodeShapeRect = ({
  color,
  bg,
  border,
  isActive,
  isDimmed,
  w = 140,
  h = 72,
}: any) => (
  <svg
    width={w}
    height={h}
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      zIndex: -1,
      transition: "all 0.2s",
    }}
  >
    <rect
      x="1.5"
      y="1.5"
      width={w - 3}
      height={h - 3}
      rx="6"
      fill={isDimmed ? "#f8fafc" : bg}
      stroke={isActive ? color : isDimmed ? "#e2e8f0" : border}
      strokeWidth={isActive ? 2.5 : 1.5}
      style={{
        filter: isActive ? `drop-shadow(0 0 8px ${color}50)` : "none",
        transition: "all 0.2s",
      }}
    />
    {isActive && (
      <rect
        x="1.5"
        y="1.5"
        width={w - 3}
        height={4}
        rx="3"
        fill={color}
        opacity="0.8"
      />
    )}
  </svg>
);

const NodeShapeTrapezoid = ({
  color,
  bg,
  border,
  isActive,
  isDimmed,
  w = 38,
  h = 90,
}: any) => (
  <svg
    width={w}
    height={h}
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      zIndex: -1,
      transition: "all 0.2s",
    }}
  >
    <path
      d={`M 2,6 L ${w - 2},${h * 0.16} L ${w - 2},${h * 0.84} L 2,${h - 6} Z`}
      fill={isDimmed ? "#f8fafc" : bg}
      stroke={isActive ? color : isDimmed ? "#e2e8f0" : border}
      strokeWidth={isActive ? 2.5 : 1.5}
      style={{
        filter: isActive ? `drop-shadow(0 0 8px ${color}50)` : "none",
        transition: "all 0.2s",
      }}
    />
  </svg>
);

const NodeShapeDiamond = ({
  color,
  bg,
  border,
  isActive,
  isDimmed,
  w = 110,
  h = 60,
}: any) => (
  <svg
    width={w}
    height={h}
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      zIndex: -1,
      transition: "all 0.2s",
    }}
  >
    <path
      d={`M ${w / 2},3 L ${w - 3},${h / 2} L ${w / 2},${h - 3} L 3,${h / 2} Z`}
      fill={isDimmed ? "#f8fafc" : bg}
      stroke={isActive ? color : isDimmed ? "#e2e8f0" : border}
      strokeWidth={isActive ? 2.5 : 1.5}
      style={{
        filter: isActive ? `drop-shadow(0 0 8px ${color}50)` : "none",
        transition: "all 0.2s",
      }}
    />
  </svg>
);

const NodeShapeEllipse = ({
  color,
  bg,
  border,
  isActive,
  isDimmed,
  w = 120,
  h = 60,
}: any) => (
  <svg
    width={w}
    height={h}
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      zIndex: -1,
      transition: "all 0.2s",
    }}
  >
    <ellipse
      cx={w / 2}
      cy={h / 2}
      rx={w / 2 - 2}
      ry={h / 2 - 2}
      fill={isDimmed ? "#f8fafc" : bg}
      stroke={isActive ? color : isDimmed ? "#e2e8f0" : border}
      strokeWidth={isActive ? 2.5 : 1.5}
      style={{
        filter: isActive ? `drop-shadow(0 0 8px ${color}50)` : "none",
        transition: "all 0.2s",
      }}
    />
  </svg>
);

const NodeShapeDShape = ({
  color,
  bg,
  border,
  isActive,
  isDimmed,
  w = 100,
  h = 80,
}: any) => (
  <svg
    width={w}
    height={h}
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      zIndex: -1,
      transition: "all 0.2s",
    }}
  >
    <path
      d={`M 3,3 L ${w * 0.75},${h * 0.2} L ${w * 0.75},${h * 0.8} L 3,${h - 3} L 3,${h * 0.65} L ${w * 0.25},${h / 2} L 3,${h * 0.35} Z`}
      fill={isDimmed ? "#f8fafc" : bg}
      stroke={isActive ? color : isDimmed ? "#e2e8f0" : border}
      strokeWidth={isActive ? 2.5 : 1.5}
      strokeLinejoin="round"
      style={{
        filter: isActive ? `drop-shadow(0 0 8px ${color}50)` : "none",
        transition: "all 0.2s",
      }}
    />
  </svg>
);

// ─── PORT NODE ────────────────────────────────────────────────────────────────
const PortNode = React.memo(({ data }: NodeProps) => {
  const d = data as NLNodeData;
  const { show, hide } = React.useContext(TooltipCtx);
  const isIn = d.nodeType === "input";
  const color = isIn ? "#16a34a" : "#d97706";
  const bg = isIn ? "#f0fdf4" : "#fffbeb";
  const border = isIn ? "#bbf7d0" : "#fde68a";
  return (
    <div
      className="nl-node"
      style={{
        opacity: d.isDimmed ? 0.25 : 1,
        transition: "opacity 0.2s",
        position: "relative",
        width: 120,
        height: 52,
      }}
      onMouseMove={(e) =>
        show({
          x: e.clientX,
          y: e.clientY,
          label: d.label,
          category: isIn ? "Port Input" : "Port Output",
          badge: isIn ? "PORT_IN" : "PORT_OUT",
          color,
          ports: d.ports ?? [],
          isActive: d.isActive,
          bits: d.bits,
        })
      }
      onMouseLeave={hide}
      aria-label={`Port ${d.label} ${isIn ? "input" : "output"}`}
    >
      {d.isHighlighted && (
        <div
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: 8,
            border: `2px solid #2563eb`,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      )}
      <NodeShapeRect
        color={color}
        bg={bg}
        border={border}
        isActive={d.isActive}
        isDimmed={d.isDimmed}
        w={120}
        h={52}
      />
      <div
        style={{
          position: "relative",
          padding: "6px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              fontSize: "7px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              background: `${color}18`,
              color,
              padding: "1px 5px",
              borderRadius: 2,
              border: `1px solid ${color}40`,
            }}
          >
            {isIn ? "IN" : "OUT"}
          </span>
          {d.isActive && (
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: color,
                boxShadow: `0 0 4px ${color}`,
                animation: "nl-pulse-dot 1s infinite",
              }}
            />
          )}
        </div>
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: d.isActive ? color : "#374151",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 100,
          }}
        >
          {d.label}
        </div>
      </div>
      {!isIn && (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            background: color,
            width: 8,
            height: 8,
            border: `2px solid white`,
          }}
        />
      )}
      {isIn && (
        <Handle
          type="source"
          position={Position.Right}
          style={{
            background: color,
            width: 8,
            height: 8,
            border: `2px solid white`,
          }}
        />
      )}
    </div>
  );
});

// ─── LOGIC NODE ───────────────────────────────────────────────────────────────
const LogicNode = React.memo(({ data }: NodeProps) => {
  const d = data as NLNodeData;
  const { show, hide } = React.useContext(TooltipCtx);
  const cfg = getCategory(d.nodeType);
  const dims: Record<string, { w: number; h: number }> = {
    trapezoid: { w: 38, h: 90 },
    diamond: { w: 110, h: 60 },
    ellipse: { w: 124, h: 64 },
    dshape: { w: 100, h: 80 },
    rect: { w: 140, h: 72 },
  };
  const { w, h } = dims[cfg.shape];
  const ShapeMap: Record<string, React.FC<any>> = {
    rect: NodeShapeRect,
    trapezoid: NodeShapeTrapezoid,
    diamond: NodeShapeDiamond,
    ellipse: NodeShapeEllipse,
    dshape: NodeShapeDShape,
  };
  const Shape = ShapeMap[cfg.shape];
  const labelX =
    cfg.shape === "trapezoid" ? "55%" : cfg.shape === "dshape" ? "62%" : "50%";

  return (
    <div
      className="nl-node"
      style={{
        opacity: d.isDimmed ? 0.2 : 1,
        transition: "opacity 0.2s, transform 0.2s",
        transform: d.isActive ? "scale(1.02)" : "scale(1)",
        position: "relative",
        width: w,
        height: h,
      }}
      onMouseMove={(e) =>
        show({
          x: e.clientX,
          y: e.clientY,
          label: d.cellName,
          category: d.nodeType,
          badge: cfg.badge,
          color: cfg.color,
          ports: d.ports ?? [],
          isActive: d.isActive,
          bits: d.bits,
        })
      }
      onMouseLeave={hide}
      aria-label={`${cfg.badge} cell ${d.cellName}`}
    >
      {d.isHighlighted && (
        <div
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: 8,
            border: `2px solid #2563eb`,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      )}
      <Shape
        color={cfg.color}
        bg={cfg.bg}
        border={cfg.border}
        isActive={d.isActive}
        isDimmed={d.isDimmed}
        w={w}
        h={h}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          padding: "6px 8px",
        }}
      >
        <span
          style={{
            fontSize: "7px",
            fontWeight: 700,
            letterSpacing: "0.07em",
            background: d.isActive ? cfg.color : `${cfg.color}18`,
            color: d.isActive ? "#fff" : cfg.color,
            padding: "1px 5px",
            borderRadius: 2,
          }}
        >
          {cfg.badge}
        </span>
        <span
          style={{
            fontSize: cfg.shape === "trapezoid" ? "7px" : "10px",
            fontWeight: 700,
            color: d.isActive ? cfg.color : "#374151",
            transform: cfg.shape === "trapezoid" ? "rotate(-90deg)" : "none",
            textAlign: "center",
            maxWidth: cfg.shape === "trapezoid" ? 24 : "90%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            transition: "color 0.2s",
          }}
        >
          {d.nodeType.replace(/^\$/, "").toUpperCase()}
        </span>
        {cfg.shape !== "trapezoid" && (
          <span
            style={{
              fontSize: "7px",
              color: "#94a3b8",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "90%",
            }}
          >
            {d.cellName.split("$").pop()?.slice(-14)}
          </span>
        )}
      </div>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: cfg.color,
          width: 8,
          height: 8,
          border: `2px solid white`,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: cfg.color,
          width: 8,
          height: 8,
          border: `2px solid white`,
        }}
      />
    </div>
  );
});

const NODE_TYPES = { portNode: PortNode, logicNode: LogicNode };

// ─── CUSTOM EDGE COM BARRAMENTOS COLORIDOS ───────────────────────────────────
const NLEdge = React.memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
  }: EdgeProps) => {
    const d = (data ?? {}) as NLEdgeData;
    const [path, lx, ly] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    const busColor = d.isHighlighted
      ? "#2563eb"
      : d.isActive
        ? BUS_COLORS[d.busType]
        : "#cbd5e1";
    const sw = d.isHighlighted
      ? 3
      : d.isActive
        ? Math.min(4, 1 + Math.log2((d.bitWidth ?? 1) + 1))
        : 1;
    return (
      <>
        <BaseEdge
          id={id}
          path={path}
          markerEnd={markerEnd}
          className={d.isActive ? "nl-edge-active" : ""}
          style={{
            stroke: busColor,
            strokeWidth: sw,
            filter:
              d.isActive || d.isHighlighted
                ? `drop-shadow(0 0 3px ${busColor}60)`
                : "none",
            transition: "stroke 0.2s, stroke-width 0.2s",
          }}
        />
        {(d.isActive || d.isHighlighted) && d.bitWidth && d.bitWidth > 1 && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: "absolute",
                pointerEvents: "none",
                transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`,
                fontFamily: "JetBrains Mono",
                fontSize: "7px",
                fontWeight: 700,
                color: busColor,
                background: "#ffffff",
                padding: "1px 4px",
                borderRadius: 3,
                border: `1px solid ${busColor}40`,
              }}
            >
              [{d.bitWidth - 1}:0]
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);
const EDGE_TYPES = { nlEdge: NLEdge };

// ─── LAYOUT DAGRE ─────────────────────────────────────────────────────────────
function layoutGraph(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    ranksep: 130,
    nodesep: 38,
    marginx: 40,
    marginy: 40,
  });
  nodes.forEach((n) => {
    const dims: Record<string, [number, number]> = {
      portNode: [120, 52],
      trapezoid: [38, 90],
      diamond: [110, 60],
      ellipse: [124, 64],
      dshape: [100, 80],
    };
    const cfg =
      n.type === "portNode"
        ? [120, 52]
        : (dims[getCategory((n.data as NLNodeData).nodeType).shape] ?? [
            140, 72,
          ]);
    g.setNode(n.id, { width: cfg[0], height: cfg[1] });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    const cfg = n.type === "portNode" ? [120, 52] : [140, 72];
    return {
      ...n,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      position: { x: p.x - cfg[0] / 2, y: p.y - cfg[1] / 2 },
    };
  });
}

// ─── PARSER ───────────────────────────────────────────────────────────────────
function parseNetlist(
  netlist: any,
  activeSignals: Record<string, string>,
  catFilter: string,
  textFilter: string,
  showOnlyActive: boolean,
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const bitToSource: Record<string, string> = {};
  const bitToPort: Record<string, string> = {};
  const activePorts = new Set<string>();
  const edgeSet = new Set<string>();

  const modName = Object.keys(netlist.modules ?? {})[0];
  const mod = netlist.modules[modName];
  if (!mod)
    return { nodes: [], edges: [], modName: "", cellCount: 0, portCount: 0 };

  const activeKeys = Object.keys(activeSignals ?? {}).map((k) =>
    k.toLowerCase(),
  );
  const isPortActive = (name: string) =>
    activeKeys.some(
      (k) => k.endsWith(`.${name.toLowerCase()}`) || k === name.toLowerCase(),
    );

  const matchText = (name: string) =>
    !textFilter || name.toLowerCase().includes(textFilter.toLowerCase());
  const matchCat = (type: string) =>
    !catFilter || getCategory(type).badge === catFilter;

  // 1. Input ports
  Object.entries(mod.ports ?? {}).forEach(([pName, pData]: [string, any]) => {
    pData.bits.forEach((b: any) => {
      bitToPort[String(b)] = pName;
    });
    if (pData.direction === "input") {
      const active = isPortActive(pName);
      if (active) activePorts.add(pName);
      pData.bits.forEach((b: any) => {
        bitToSource[String(b)] = `port-${pName}`;
      });
      if (matchText(pName))
        nodes.push({
          id: `port-${pName}`,
          type: "portNode",
          data: {
            label: pName,
            category: "Port",
            nodeType: "input",
            cellName: pName,
            isActive: active,
            isDimmed: false,
            isHighlighted: false,
            ports: [{ name: pName, dir: "input" }],
            bits: pData.bits.length,
          } as NLNodeData,
          position: { x: 0, y: 0 },
        });
    }
  });

  // 2. Cells
  const isCellActive = (cd: any) => {
    for (const bits of Object.values(cd.connections) as any[]) {
      if (!Array.isArray(bits)) continue;
      for (const b of bits) {
        if (bitToPort[String(b)] && activePorts.has(bitToPort[String(b)]))
          return true;
      }
    }
    return false;
  };

  Object.entries(mod.cells ?? {}).forEach(([cName, cData]: [string, any]) => {
    const active = isCellActive(cData);
    const cfg = getCategory(cData.type);
    if (showOnlyActive && !active) return;
    if (!matchCat(cData.type)) return;
    if (!matchText(cName) && !matchText(cData.type)) return;
    const ports = Object.entries(cData.port_directions ?? {}).map(([k, v]) => ({
      name: k,
      dir: v as any,
    }));
    const maxBits = Math.max(
      ...Object.values(cData.connections ?? {}).map((b: any) =>
        Array.isArray(b) ? b.length : 1,
      ),
    );
    nodes.push({
      id: cName,
      type: "logicNode",
      data: {
        label: cData.type.replace(/^\$/, "").toUpperCase(),
        category: cData.type,
        nodeType: cData.type,
        cellName: cName,
        isActive: active,
        isDimmed: false,
        isHighlighted: false,
        ports,
        bits: maxBits,
      } as NLNodeData,
      position: { x: 0, y: 0 },
    });
    Object.entries(cData.connections ?? {}).forEach(
      ([port, bits]: [string, any]) => {
        if (cData.port_directions?.[port] === "output")
          bits.forEach((b: any) => {
            bitToSource[String(b)] = cName;
          });
      },
    );
  });

  // 3. Output ports
  Object.entries(mod.ports ?? {}).forEach(([pName, pData]: [string, any]) => {
    if (pData.direction === "output") {
      const active = activePorts.has(pName);
      if (matchText(pName))
        nodes.push({
          id: `port-${pName}`,
          type: "portNode",
          data: {
            label: pName,
            category: "Port",
            nodeType: "output",
            cellName: pName,
            isActive: active,
            isDimmed: false,
            isHighlighted: false,
            ports: [{ name: pName, dir: "output" }],
            bits: pData.bits.length,
          } as NLNodeData,
          position: { x: 0, y: 0 },
        });
    }
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const checkActive = (a: string, b: string) => {
    const na = nodes.find((n) => n.id === a)?.data as NLNodeData;
    const nb = nodes.find((n) => n.id === b)?.data as NLNodeData;
    return !!(na?.isActive && nb?.isActive);
  };

  // 4. Cell → cell edges
  Object.entries(mod.cells ?? {}).forEach(([cName, cData]: [string, any]) => {
    if (!nodeIds.has(cName)) return;
    Object.entries(cData.connections ?? {}).forEach(
      ([port, bits]: [string, any]) => {
        if (cData.port_directions?.[port] !== "input") return;
        bits.forEach((b: any) => {
          const src = bitToSource[String(b)];
          if (!src || src === "0" || src === "1" || !nodeIds.has(src)) return;
          const eid = `${src}→${cName}`;
          if (edgeSet.has(eid)) return;
          edgeSet.add(eid);
          const active = checkActive(src, cName);
          const busType = classifyBus(port);
          edges.push({
            id: `e-${eid}`,
            source: src,
            target: cName,
            type: "nlEdge",
            data: {
              isActive: active,
              bitWidth: Array.isArray(bits) ? bits.length : 1,
              busType,
              isHighlighted: false,
            } as NLEdgeData,
            markerEnd: {
              type: "arrowclosed" as any,
              width: 8,
              height: 8,
              color: active ? BUS_COLORS[busType] : "#cbd5e1",
            },
          });
        });
      },
    );
  });

  // 5. Cell → output port edges
  Object.entries(mod.ports ?? {}).forEach(([pName, pData]: [string, any]) => {
    if (pData.direction !== "output" || !nodeIds.has(`port-${pName}`)) return;
    pData.bits.forEach((b: any) => {
      const src = bitToSource[String(b)];
      if (!src || src === "0" || src === "1" || !nodeIds.has(src)) return;
      const eid = `${src}→port-${pName}`;
      if (edgeSet.has(eid)) return;
      edgeSet.add(eid);
      const active = checkActive(src, `port-${pName}`);
      edges.push({
        id: `e-${eid}`,
        source: src,
        target: `port-${pName}`,
        type: "nlEdge",
        data: {
          isActive: active,
          bitWidth: pData.bits.length,
          busType: "output",
          isHighlighted: false,
        } as NLEdgeData,
        markerEnd: {
          type: "arrowclosed" as any,
          width: 8,
          height: 8,
          color: active ? BUS_COLORS.output : "#cbd5e1",
        },
      });
    });
  });

  // Apply dimming
  const hasAnyActive = nodes.some((n) => (n.data as NLNodeData).isActive);
  if (hasAnyActive)
    nodes.forEach((n) => {
      (n.data as NLNodeData).isDimmed = !(n.data as NLNodeData).isActive;
    });

  return {
    nodes,
    edges,
    modName,
    cellCount: Object.keys(mod.cells ?? {}).length,
    portCount: Object.keys(mod.ports ?? {}).length,
  };
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function getNetlistStats(netlist: any) {
  if (!netlist?.modules) return null;
  const modName = Object.keys(netlist.modules)[0];
  const mod = netlist.modules[modName];
  if (!mod) return null;
  const cells = Object.entries(mod.cells ?? {});
  const ports = Object.entries(mod.ports ?? {});
  const categories: Record<string, number> = {};
  cells.forEach(([, cd]: [string, any]) => {
    const cat = getCategory((cd as any).type).badge;
    categories[cat] = (categories[cat] ?? 0) + 1;
  });
  return {
    modName,
    cellCount: cells.length,
    portCount: ports.length,
    categories,
    allPorts: ports,
  };
}

// ─── FIT VIEW BUTTON ──────────────────────────────────────────────────────────
function FitViewButton() {
  const { fitView } = useReactFlow();
  return (
    <button
      className="nl-btn"
      onClick={() => fitView({ padding: 0.15, duration: 400 })}
      title="Ajustar visualização"
    >
      <IcFit /> Fit
    </button>
  );
}

// Hook para fitView com delay após mudança de nós
function useDelayedFitView(nodes: Node[]) {
  const { fitView } = useReactFlow();
  const prevLen = useRef(0);
  useEffect(() => {
    if (nodes.length > 0 && nodes.length !== prevLen.current) {
      prevLen.current = nodes.length;
      const t = setTimeout(
        () => fitView({ padding: 0.15, duration: 400 }),
        120,
      );
      return () => clearTimeout(t);
    }
  }, [nodes.length, fitView]);
}

// ─── INNER COMPONENT (precisa de ReactFlowProvider) ───────────────────────────
function NetlistViewerInner({
  netlistJson,
  activeSignals = {},
}: NetlistViewerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useDelayedFitView(nodes);
  const [textFilter, setTextFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [parsedMeta, setParsedMeta] = useState<{
    modName: string;
    cellCount: number;
    portCount: number;
  } | null>(null);
  const stats = useMemo(() => getNetlistStats(netlistJson), [netlistJson]);

  useEffect(() => {
    injectNLCSS();
  }, []);

  useEffect(() => {
    if (!netlistJson?.modules) return;
    const {
      nodes: rawN,
      edges: rawE,
      modName,
      cellCount,
      portCount,
    } = parseNetlist(
      netlistJson,
      activeSignals,
      catFilter,
      textFilter,
      showOnlyActive,
    );
    const laid = layoutGraph(rawN, rawE);
    setNodes(laid);
    setEdges(rawE);
    setParsedMeta({ modName, cellCount, portCount });
    setSelectedNodeId(null);
  }, [
    netlistJson,
    activeSignals,
    catFilter,
    textFilter,
    showOnlyActive,
    setNodes,
    setEdges,
  ]);

  // Highlight 1-hop neighbors on node click
  const handleNodeClick = useCallback((_: any, node: Node) => {
    const nid = node.id;
    setSelectedNodeId((prev) => (prev === nid ? null : nid));
  }, []);

  // Apply highlight to nodes and edges
  const displayedNodes = useMemo(() => {
    if (!selectedNodeId)
      return nodes.map((n) => ({
        ...n,
        data: { ...n.data, isHighlighted: false },
      }));
    const connectedEdges = edges.filter(
      (e) => e.source === selectedNodeId || e.target === selectedNodeId,
    );
    const neighborIds = new Set<string>([selectedNodeId]);
    connectedEdges.forEach((e) => {
      neighborIds.add(e.source);
      neighborIds.add(e.target);
    });
    return nodes.map((n) => ({
      ...n,
      data: { ...n.data, isHighlighted: neighborIds.has(n.id) },
    }));
  }, [nodes, edges, selectedNodeId]);

  const displayedEdges = useMemo(() => {
    if (!selectedNodeId)
      return edges.map((e) => ({
        ...e,
        data: { ...e.data, isHighlighted: false },
      }));
    return edges.map((e) => ({
      ...e,
      data: {
        ...e.data,
        isHighlighted:
          e.source === selectedNodeId || e.target === selectedNodeId,
      },
    }));
  }, [edges, selectedNodeId]);

  const activeCount = nodes.filter(
    (n) => (n.data as NLNodeData).isActive,
  ).length;
  const hasSimulation = Object.keys(activeSignals).length > 0;

  if (!netlistJson) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
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
        <div
          style={{
            color: "#94a3b8",
            fontSize: 12,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          Execute a simulação para visualizar o netlist
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          background: "#f8fafc",
          minHeight: 0,
        }}
      >
        <div
          style={{ flex: 1, position: "relative", minHeight: 0 }}
          className="nl-canvas"
        >
          <ReactFlow
            nodes={displayedNodes}
            edges={displayedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            fitView
            minZoom={0.1}
            maxZoom={3}
            nodesConnectable={false}
            nodesDraggable={true}
            defaultEdgeOptions={{ type: "nlEdge" }}
          >
            <Background
              color="#e2e8f0"
              gap={24}
              size={1}
              variant={"dots" as any}
            />
            <Controls showInteractive={false} />
            {showMinimap && (
              <MiniMap
                nodeColor={(n) => {
                  const d = n.data as NLNodeData;
                  return d.nodeType === "input"
                    ? "#16a34a"
                    : d.nodeType === "output"
                      ? "#d97706"
                      : getCategory(d.nodeType).color;
                }}
                maskColor="rgba(241,245,249,0.7)"
              />
            )}

            {/* Toolbar top-left */}
            <Panel position="top-left">
              <div className="nl-toolbar">
                <input
                  className="nl-search"
                  placeholder="Filtrar células..."
                  value={textFilter}
                  onChange={(e) => setTextFilter(e.target.value)}
                />
                <div className="nl-sep" />
                <FitViewButton />
                <button
                  className={`nl-btn ${showMinimap ? "nl-btn-on" : ""}`}
                  onClick={() => setShowMinimap((p) => !p)}
                  title="Mini-mapa"
                >
                  <IcMap /> Mapa
                </button>
                <button
                  className={`nl-btn ${showInfo ? "nl-btn-on" : ""}`}
                  onClick={() => setShowInfo((p) => !p)}
                  title="Painel de informações"
                >
                  <IcInfo /> Info
                </button>
                {hasSimulation && (
                  <>
                    <div className="nl-sep" />
                    <button
                      className={`nl-btn ${showOnlyActive ? "nl-btn-on" : ""}`}
                      onClick={() => setShowOnlyActive((p) => !p)}
                      title="Mostrar apenas elementos ativos"
                    >
                      <IcFlash /> Ativos{" "}
                      {showOnlyActive && activeCount > 0 && `(${activeCount})`}
                    </button>
                  </>
                )}
                {selectedNodeId && (
                  <>
                    <div className="nl-sep" />
                    <button
                      className="nl-btn nl-btn-danger"
                      onClick={() => setSelectedNodeId(null)}
                      title="Limpar seleção"
                    >
                      <IcClose /> Limpar
                    </button>
                  </>
                )}
              </div>
            </Panel>

            {/* Category filter chips */}
            <Panel position="top-left" style={{ top: 58 }}>
              <div className="nl-cat-chips" style={{ maxWidth: 520 }}>
                <button
                  className={`nl-cat-chip ${!catFilter ? "nl-cat-chip-on" : ""}`}
                  style={
                    !catFilter
                      ? { background: "#374151", borderColor: "transparent" }
                      : {}
                  }
                  onClick={() => setCatFilter("")}
                >
                  <IcFilter style={{ display: "inline" }} /> ALL
                </button>
                {ALL_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    className={`nl-cat-chip ${catFilter === cat ? "nl-cat-chip-on" : ""}`}
                    style={
                      catFilter === cat
                        ? { background: CAT_COLORS[cat] }
                        : {
                            borderColor: `${CAT_COLORS[cat]}60`,
                            color: CAT_COLORS[cat],
                          }
                    }
                    onClick={() => setCatFilter((p) => (p === cat ? "" : cat))}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </Panel>

            {/* Stats top-right */}
            {parsedMeta && (
              <Panel
                position="top-right"
                style={{
                  marginRight: showInfo ? 238 : 0,
                  transition: "margin 0.2s",
                }}
              >
                <div className="nl-stats-bar">
                  <span>
                    Módulo:{" "}
                    <b style={{ color: "#2563eb" }}>{parsedMeta.modName}</b>
                  </span>
                  <span>
                    Células:{" "}
                    <b style={{ color: "#9333ea" }}>{parsedMeta.cellCount}</b>
                  </span>
                  <span>
                    Portas:{" "}
                    <b style={{ color: "#16a34a" }}>{parsedMeta.portCount}</b>
                  </span>
                  <span>
                    Nós: <b style={{ color: "#d97706" }}>{nodes.length}</b>
                  </span>
                  <span>
                    Arestas: <b style={{ color: "#0891b2" }}>{edges.length}</b>
                  </span>
                  {hasSimulation && activeCount > 0 && (
                    <span>
                      Ativos: <b style={{ color: "#16a34a" }}>{activeCount}</b>
                    </span>
                  )}
                </div>
              </Panel>
            )}

            {/* Bus legend bottom-left */}
            <Panel position="bottom-left">
              <div className="nl-legend">
                <span className="nl-legend-title">Barramentos</span>
                {Object.entries(BUS_LABELS).map(([key, label]) => (
                  <div className="nl-legend-item" key={key}>
                    <div
                      className="nl-legend-line"
                      style={{ background: BUS_COLORS[key] }}
                    />
                    <span style={{ color: "#374151" }}>{label}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Node type legend bottom-right */}
            <Panel
              position="bottom-right"
              style={{
                marginRight: showInfo ? 238 : 0,
                transition: "margin 0.2s",
              }}
            >
              <div className="nl-legend">
                <span className="nl-legend-title">Células</span>
                {Object.entries(CAT_COLORS)
                  .slice(0, 6)
                  .map(([cat, color]) => (
                    <div className="nl-legend-item" key={cat}>
                      <div
                        className="nl-legend-dot"
                        style={{ background: color }}
                      />
                      <span style={{ color: "#374151" }}>{cat}</span>
                    </div>
                  ))}
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Info panel */}
        {showInfo && stats && (
          <div className="nl-info">
            <div className="nl-info-hdr">
              <span className="nl-info-title">Netlist Info</span>
              <button
                className="nl-btn"
                style={{ padding: "3px 8px" }}
                onClick={() => setShowInfo(false)}
              >
                <IcClose />
              </button>
            </div>
            <div className="nl-info-body">
              <div
                style={{
                  color: "#9333ea",
                  fontSize: "9px",
                  fontWeight: 700,
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {stats.modName}
              </div>
              <div className="nl-info-stat">
                <div className="nl-info-stat-label">Total de Células</div>
                <div className="nl-info-stat-val">{stats.cellCount}</div>
              </div>
              <div className="nl-info-stat">
                <div className="nl-info-stat-label">Portas de E/S</div>
                <div className="nl-info-stat-val">{stats.portCount}</div>
              </div>
              {hasSimulation && (
                <div className="nl-info-stat">
                  <div className="nl-info-stat-label">Nós Ativos</div>
                  <div className="nl-info-stat-val green">{activeCount}</div>
                </div>
              )}
              <div className="nl-info-sec-label">Por Categoria</div>
              {Object.entries(stats.categories)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => (
                  <div
                    key={cat}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "3px 0",
                      borderBottom: "1px solid #f1f5f9",
                      fontSize: "9px",
                    }}
                  >
                    <span
                      style={{
                        color: CAT_COLORS[cat] ?? "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      {cat}
                    </span>
                    <span style={{ fontWeight: 700, color: "#374151" }}>
                      {count as number}
                    </span>
                  </div>
                ))}
              <div className="nl-info-sec-label">Portas do Módulo</div>
              <div className="nl-info-ports">
                {(stats.allPorts as any[]).map(
                  ([pName, pData]: [string, any]) => (
                    <div className="nl-info-port" key={pName}>
                      <span className="nl-info-port-name">{pName}</span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span style={{ color: "#94a3b8", fontSize: "8px" }}>
                          [{pData.bits?.length ?? 1}b]
                        </span>
                        <span
                          className={`nl-info-port-dir ${pData.direction === "input" ? "in" : "out"}`}
                        >
                          {pData.direction === "input" ? "IN" : "OUT"}
                        </span>
                      </div>
                    </div>
                  ),
                )}
              </div>
              {selectedNodeId && (
                <>
                  <div className="nl-info-sec-label">No Selecionado</div>
                  <div
                    style={{
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      borderRadius: 6,
                      padding: "8px 10px",
                      fontSize: "9px",
                    }}
                  >
                    <div
                      style={{
                        color: "#2563eb",
                        fontWeight: 700,
                        marginBottom: 4,
                      }}
                    >
                      {selectedNodeId.replace(/^\$/, "")}
                    </div>
                    <div style={{ color: "#64748b" }}>
                      Clique em outro nó para comparar, ou em Limpar para
                      desfazer.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ─── EXPORT COM PROVIDER ──────────────────────────────────────────────────────
export default function NetlistViewer(props: NetlistViewerProps) {
  return (
    <ReactFlowProvider>
      <NetlistViewerInner {...props} />
    </ReactFlowProvider>
  );
}
