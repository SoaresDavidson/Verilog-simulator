import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  Panel,
  BaseEdge,
  getSmoothStepPath,
  EdgeLabelRenderer,
} from "@xyflow/react";
import type { Node, Edge, NodeProps, EdgeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as dagre from "dagre";

// ─── ESTILOS INJETADOS ────────────────────────────────────────────────────────
const NL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Syne:wght@700;800&display=swap');

@keyframes nl-flow { 0% { stroke-dashoffset: 20; } 100% { stroke-dashoffset: 0; } }
@keyframes nl-glow-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
@keyframes nl-node-pop { from { opacity:0; transform:scale(0.85); } to { opacity:1; transform:scale(1); } }

.nl-node { animation: nl-node-pop 0.18s cubic-bezier(.34,1.56,.64,1) both; font-family: 'JetBrains Mono', monospace; }
.nl-edge-active { stroke-dasharray: 8 4; animation: nl-flow 0.5s linear infinite; }
.nl-edge-ctrl   { stroke-dasharray: 5 3; animation: nl-flow 1s linear infinite; }

.nl-toolbar {
  display: flex; align-items: center; gap: 6px;
  background: rgba(9,14,28,0.95); border: 1px solid rgba(148,163,184,0.15);
  border-radius: 10px; padding: 6px 10px;
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  font-family: 'JetBrains Mono', monospace;
}
.nl-btn {
  font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 600;
  letter-spacing: 0.04em; padding: 5px 10px; border-radius: 6px;
  border: 1px solid rgba(148,163,184,0.18);
  background: rgba(20,30,55,0.9); color: #94a3b8;
  cursor: pointer; transition: all 0.14s; white-space: nowrap;
}
.nl-btn:hover { background: rgba(40,58,90,0.95); color: #e2e8f0; border-color: rgba(148,163,184,0.35); }
.nl-btn-on { background: rgba(37,99,235,0.2); color: #60a5fa; border-color: rgba(37,99,235,0.45); }
.nl-sep { width: 1px; height: 18px; background: rgba(148,163,184,0.12); }

.nl-search {
  background: rgba(20,30,55,0.9); border: 1px solid rgba(148,163,184,0.18);
  border-radius: 6px; color: #e2e8f0; font-family: 'JetBrains Mono', monospace;
  font-size: 9px; padding: 5px 9px; outline: none; width: 160px;
  transition: border-color 0.14s;
}
.nl-search:focus { border-color: rgba(37,99,235,0.5); }
.nl-search::placeholder { color: #334155; }

.nl-legend {
  display: flex; gap: 14px; align-items: center;
  background: rgba(9,14,28,0.92); border: 1px solid rgba(148,163,184,0.1);
  border-radius: 8px; padding: 6px 12px;
  font-family: 'JetBrains Mono', monospace; font-size: 8px; color: #475569;
}
.nl-legend-item { display: flex; align-items: center; gap: 5px; }
.nl-legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

.nl-tooltip {
  position: fixed; z-index: 9999; pointer-events: none;
  background: rgba(9,14,28,0.98); border: 1px solid rgba(148,163,184,0.18);
  border-radius: 8px; padding: 10px 14px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.6);
  min-width: 190px; max-width: 260px;
  font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #94a3b8;
}
.nl-tt-title { font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 800; color: #f1f5f9; margin-bottom: 5px; }
.nl-tt-badge { display: inline-block; font-size: 7.5px; font-weight: 700; padding: 2px 6px; border-radius: 3px; letter-spacing: 0.06em; margin-bottom: 6px; }
.nl-tt-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
.nl-tt-key { color: #64748b; }
.nl-tt-val { color: #34d399; font-weight: 600; }
.nl-tt-div { border: none; border-top: 1px solid rgba(148,163,184,0.1); margin: 5px 0; }

/* Info panel */
.nl-info {
  position: absolute; top: 0; right: 0; width: 240px; height: 100%;
  background: rgba(9,14,28,0.97); border-left: 1px solid rgba(148,163,184,0.1);
  font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: #94a3b8;
  display: flex; flex-direction: column;
  box-shadow: -8px 0 32px rgba(0,0,0,0.5); z-index: 50;
}
.nl-info-hdr {
  padding: 12px 14px; border-bottom: 1px solid rgba(148,163,184,0.1);
  display: flex; justify-content: space-between; align-items: center;
}
.nl-info-title { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 800; color: #e2e8f0; letter-spacing: 0.08em; text-transform: uppercase; }
.nl-info-body { flex: 1; overflow-y: auto; padding: 12px; }
.nl-info-body::-webkit-scrollbar { width: 2px; }
.nl-info-body::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.15); border-radius: 1px; }
.nl-info-stat { background: rgba(20,30,55,0.6); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
.nl-info-stat-label { font-size: 8px; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px; }
.nl-info-stat-val { font-size: 14px; font-weight: 700; color: #60a5fa; }
.nl-info-ports { margin-top: 10px; }
.nl-info-port { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(148,163,184,0.05); }
.nl-info-port:last-child { border: none; }
.nl-info-port-name { color: #94a3b8; }
.nl-info-port-dir { font-size: 8px; padding: 1px 5px; border-radius: 2px; font-weight: 700; }
.nl-info-port-dir.in  { background: rgba(34,197,94,0.15); color: #4ade80; }
.nl-info-port-dir.out { background: rgba(245,158,11,0.15); color: #fbbf24; }

/* ReactFlow overrides */
.nl-canvas .react-flow__controls {
  background: rgba(9,14,28,0.95) !important; border: 1px solid rgba(148,163,184,0.12) !important;
  border-radius: 8px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
}
.nl-canvas .react-flow__controls-button {
  background: transparent !important; border-color: rgba(148,163,184,0.08) !important;
  fill: #475569 !important;
}
.nl-canvas .react-flow__controls-button:hover { background: rgba(30,45,80,0.7) !important; fill: #94a3b8 !important; }
.nl-canvas .react-flow__background { opacity: 0.5 !important; }
`;

function injectNLCSS() {
  if (document.getElementById("nl-styles")) return;
  const s = document.createElement("style");
  s.id = "nl-styles";
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
  ports: Array<{ name: string; dir: "input" | "output" }>;
  bits: number;
}

interface NLEdgeData extends Record<string, unknown> {
  isActive: boolean;
  bitWidth?: number;
}

// ─── CATEGORIA → VISUAL ───────────────────────────────────────────────────────
interface CategoryConfig {
  color: string;
  bg: string;
  badge: string;
  shape: "rect" | "trapezoid" | "diamond" | "ellipse" | "dshape";
}

function getCategory(type: string): CategoryConfig {
  const t = type.toLowerCase().replace(/^\$/, "");
  if (/^(dff|sdff|adff|dffe)/.test(t))
    return { color: "#f59e0b", bg: "#1a1000", badge: "DFF", shape: "rect" };
  if (/^(mux|pmux|ternary)/.test(t))
    return {
      color: "#a855f7",
      bg: "#130a20",
      badge: "MUX",
      shape: "trapezoid",
    };
  if (/^(add|sub)/.test(t))
    return { color: "#22c55e", bg: "#061408", badge: "ARITH", shape: "dshape" };
  if (/^(mul|div)/.test(t))
    return { color: "#10b981", bg: "#041210", badge: "ARITH", shape: "dshape" };
  if (/^(and|or|xor|not|nand|nor)/.test(t))
    return { color: "#3b82f6", bg: "#050f20", badge: "GATE", shape: "ellipse" };
  if (/^(shl|shr|sshl|sshr)/.test(t))
    return {
      color: "#06b6d4",
      bg: "#031014",
      badge: "SHIFT",
      shape: "diamond",
    };
  if (/^(lt|le|gt|ge|eq|ne)/.test(t))
    return { color: "#ec4899", bg: "#180810", badge: "CMP", shape: "diamond" };
  if (/^(reduce)/.test(t))
    return {
      color: "#f97316",
      bg: "#180900",
      badge: "REDUCE",
      shape: "ellipse",
    };
  if (/^(mem|memrd|memwr)/.test(t))
    return { color: "#14b8a6", bg: "#03120f", badge: "MEM", shape: "rect" };
  return { color: "#64748b", bg: "#0c1118", badge: "CELL", shape: "rect" };
}

// ─── TOOLTIP GLOBAL ───────────────────────────────────────────────────────────
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
              background: `${tip.color}20`,
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
              style={{ color: tip.isActive ? "#34d399" : "#475569" }}
            >
              {tip.isActive ? "● ativo" : "○ idle"}
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
                      background:
                        p.dir === "input"
                          ? "rgba(34,197,94,0.15)"
                          : "rgba(245,158,11,0.15)",
                      color: p.dir === "input" ? "#4ade80" : "#fbbf24",
                    }}
                  >
                    {p.dir.toUpperCase()}
                  </span>
                </div>
              ))}
              {tip.ports.length > 5 && (
                <div
                  style={{ color: "#334155", fontSize: "8px", marginTop: 3 }}
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

// ─── NODE SHAPES ──────────────────────────────────────────────────────────────
const NodeShapeRect = ({
  color,
  bg,
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
      rx="5"
      fill={bg}
      stroke={
        isActive
          ? color
          : isDimmed
            ? "rgba(71,85,105,0.3)"
            : "rgba(71,85,105,0.55)"
      }
      strokeWidth={isActive ? 2.5 : 1.5}
      style={{
        filter: isActive ? `drop-shadow(0 0 10px ${color}70)` : "none",
        transition: "all 0.2s",
      }}
    />
    {isActive && (
      <rect
        x="1.5"
        y="1.5"
        width={w - 3}
        height={4}
        rx="2"
        fill={color}
        opacity="0.7"
      />
    )}
  </svg>
);

const NodeShapeTrapezoid = ({
  color,
  bg,
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
      fill={bg}
      stroke={
        isActive
          ? color
          : isDimmed
            ? "rgba(71,85,105,0.3)"
            : "rgba(71,85,105,0.55)"
      }
      strokeWidth={isActive ? 2.5 : 1.5}
      style={{
        filter: isActive ? `drop-shadow(0 0 9px ${color}70)` : "none",
        transition: "all 0.2s",
      }}
    />
  </svg>
);

const NodeShapeDiamond = ({
  color,
  bg,
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
      fill={bg}
      stroke={
        isActive
          ? color
          : isDimmed
            ? "rgba(71,85,105,0.3)"
            : "rgba(71,85,105,0.55)"
      }
      strokeWidth={isActive ? 2.5 : 1.5}
      style={{
        filter: isActive ? `drop-shadow(0 0 9px ${color}70)` : "none",
        transition: "all 0.2s",
      }}
    />
  </svg>
);

const NodeShapeEllipse = ({
  color,
  bg,
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
      fill={bg}
      stroke={
        isActive
          ? color
          : isDimmed
            ? "rgba(71,85,105,0.3)"
            : "rgba(71,85,105,0.55)"
      }
      strokeWidth={isActive ? 2.5 : 1.5}
      style={{
        filter: isActive ? `drop-shadow(0 0 9px ${color}70)` : "none",
        transition: "all 0.2s",
      }}
    />
  </svg>
);

const NodeShapeDShape = ({
  color,
  bg,
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
      fill={bg}
      stroke={
        isActive
          ? color
          : isDimmed
            ? "rgba(71,85,105,0.3)"
            : "rgba(71,85,105,0.55)"
      }
      strokeWidth={isActive ? 2.5 : 1.5}
      strokeLinejoin="round"
      style={{
        filter: isActive ? `drop-shadow(0 0 10px ${color}70)` : "none",
        transition: "all 0.2s",
      }}
    />
  </svg>
);

// ─── PORT NODE (entradas/saídas do módulo) ────────────────────────────────────
const PortNode = React.memo(({ data }: NodeProps) => {
  const d = data as NLNodeData;
  const { show, hide } = React.useContext(TooltipCtx);
  const isIn = d.nodeType === "input";
  const color = isIn ? "#22c55e" : "#f59e0b";
  const bg = isIn ? "#041208" : "#100800";

  return (
    <div
      className="nl-node"
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
      style={{
        opacity: d.isDimmed ? 0.28 : 1,
        transition: "opacity 0.2s",
        position: "relative",
        width: 120,
        height: 52,
      }}
      aria-label={`Port ${d.label} ${isIn ? "input" : "output"}`}
    >
      <NodeShapeRect
        color={color}
        bg={bg}
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
          gap: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              fontSize: "7px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              background: `${color}20`,
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
                boxShadow: `0 0 6px ${color}`,
              }}
            />
          )}
        </div>
        <div
          style={{
            fontSize: "10px",
            fontWeight: 700,
            color: d.isActive ? color : "#e2e8f0",
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
            border: `2px solid ${bg}`,
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
            border: `2px solid ${bg}`,
          }}
        />
      )}
    </div>
  );
});

// ─── LOGIC NODE (células internas) ────────────────────────────────────────────
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
      style={{
        opacity: d.isDimmed ? 0.2 : 1,
        transition: "opacity 0.2s, transform 0.2s",
        transform: d.isActive ? "scale(1.02)" : "scale(1)",
        position: "relative",
        width: w,
        height: h,
      }}
      aria-label={`${cfg.badge} cell ${d.cellName}`}
    >
      <Shape
        color={cfg.color}
        bg={cfg.bg}
        isActive={d.isActive}
        isDimmed={d.isDimmed}
        w={w}
        h={h}
      />

      {/* Label content */}
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
            background: d.isActive ? cfg.color : "rgba(71,85,105,0.4)",
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
            color: d.isActive ? cfg.color : "#cbd5e1",
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
              color: "#334155",
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
          border: `2px solid ${cfg.bg}`,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: cfg.color,
          width: 8,
          height: 8,
          border: `2px solid ${cfg.bg}`,
        }}
      />
    </div>
  );
});

const NODE_TYPES = { portNode: PortNode, logicNode: LogicNode };

// ─── CUSTOM EDGE ──────────────────────────────────────────────────────────────
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
    const color = d.isActive ? "#3b82f6" : "rgba(71,85,105,0.4)";
    const w = d.isActive ? 2.5 : 1.2;
    return (
      <>
        <BaseEdge
          id={id}
          path={path}
          markerEnd={markerEnd}
          className={d.isActive ? "nl-edge-active" : ""}
          style={{
            stroke: color,
            strokeWidth: w,
            filter: d.isActive ? "drop-shadow(0 0 4px #3b82f6)" : "none",
            strokeDasharray: d.isActive ? "8 4" : "none",
            transition: "stroke 0.2s, stroke-width 0.2s",
          }}
        />
        {d.isActive && d.bitWidth && d.bitWidth > 1 && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: "absolute",
                pointerEvents: "none",
                transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`,
                fontFamily: "JetBrains Mono",
                fontSize: "7px",
                fontWeight: 700,
                color: "#3b82f6",
                background: "#050c1a",
                padding: "1px 4px",
                borderRadius: 3,
                border: "1px solid rgba(59,130,246,0.35)",
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

// ─── AUTO-LAYOUT (DAGRE) ──────────────────────────────────────────────────────
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
  filter: string,
  showDimmed: boolean,
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const bitToSource: Record<string, string> = {};
  const bitToPort: Record<string, string> = {};
  const activePorts = new Set<string>();
  const edgeSet = new Set<string>();

  const modName = Object.keys(netlist.modules ?? {})[0];
  const mod = netlist.modules[modName];
  if (!mod) return { nodes: [], edges: [] };

  const activeKeys = Object.keys(activeSignals ?? {}).map((k) =>
    k.toLowerCase(),
  );
  const isPortActive = (name: string) =>
    activeKeys.some(
      (k) => k.endsWith(`.${name.toLowerCase()}`) || k === name.toLowerCase(),
    );

  const flt = filter.toLowerCase();
  const matchFilter = (name: string) =>
    !flt || name.toLowerCase().includes(flt);

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
      if (matchFilter(pName))
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
    const ports = Object.entries(cData.port_directions ?? {}).map(([k, v]) => ({
      name: k,
      dir: v as any,
    }));
    const maxBits = Math.max(
      ...Object.values(cData.connections ?? {}).map((b: any) =>
        Array.isArray(b) ? b.length : 1,
      ),
    );

    if (matchFilter(cName) || matchFilter(cData.type)) {
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
          ports,
          bits: maxBits,
        } as NLNodeData,
        position: { x: 0, y: 0 },
      });
    }

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
      if (matchFilter(pName))
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
          edges.push({
            id: `e-${eid}`,
            source: src,
            target: cName,
            type: "nlEdge",
            data: {
              isActive: active,
              bitWidth: Array.isArray(bits) ? bits.length : 1,
            } as NLEdgeData,
            markerEnd: {
              type: "arrowclosed" as any,
              width: 9,
              height: 9,
              color: active ? "#3b82f6" : "rgba(71,85,105,0.4)",
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
        data: { isActive: active, bitWidth: pData.bits.length } as NLEdgeData,
        markerEnd: {
          type: "arrowclosed" as any,
          width: 9,
          height: 9,
          color: active ? "#22c55e" : "rgba(71,85,105,0.4)",
        },
      });
    });
  });

  // Apply dimming: if anything is active, dim everything else
  const hasAnyActive = nodes.some((n) => (n.data as NLNodeData).isActive);
  if (hasAnyActive) {
    nodes.forEach((n) => {
      (n.data as NLNodeData).isDimmed = !(n.data as NLNodeData).isActive;
    });
  }
  if (!showDimmed && hasAnyActive) {
    // filter to only active + 1-hop neighbors
    const activeNodeIds = new Set(
      nodes.filter((n) => (n.data as NLNodeData).isActive).map((n) => n.id),
    );
    edges.forEach((e) => {
      if (e.data && (e.data as NLEdgeData).isActive) {
        activeNodeIds.add(e.source);
        activeNodeIds.add(e.target);
      }
    });
  }

  return { nodes, edges };
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
    const cat = getCategory(cd.type).badge;
    categories[cat] = (categories[cat] ?? 0) + 1;
  });
  return {
    modName,
    cellCount: cells.length,
    portCount: ports.length,
    categories,
    inputPorts: ports.filter(
      ([, pd]: [string, any]) => pd.direction === "input",
    ).length,
    outputPorts: ports.filter(
      ([, pd]: [string, any]) => pd.direction === "output",
    ).length,
    allPorts: ports,
  };
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function NetlistViewer({
  netlistJson,
  activeSignals = {},
}: NetlistViewerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [filter, setFilter] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [layout, setLayout] = useState<"LR" | "TB">("LR");
  const stats = useMemo(() => getNetlistStats(netlistJson), [netlistJson]);

  useEffect(() => {
    injectNLCSS();
  }, []);

  useEffect(() => {
    if (!netlistJson?.modules) return;
    const { nodes: rawN, edges: rawE } = parseNetlist(
      netlistJson,
      activeSignals,
      filter,
      !showOnlyActive,
    );
    const laid = layoutGraph(rawN, rawE);
    setNodes(laid);
    setEdges(rawE);
  }, [
    netlistJson,
    activeSignals,
    filter,
    showOnlyActive,
    layout,
    setNodes,
    setEdges,
  ]);

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
          background: "#050c1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#1e3a5f"
          strokeWidth="1.5"
        >
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
        </svg>
        <div style={{ color: "#1e3a5f", fontSize: 11 }}>
          Mapeie o netlist para visualizar o circuito
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
          background: "#050c1a",
        }}
      >
        <div style={{ flex: 1, position: "relative" }} className="nl-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            fitView
            minZoom={0.15}
            maxZoom={3}
            nodesConnectable={false}
            nodesDraggable={true}
            defaultEdgeOptions={{ type: "nlEdge" }}
          >
            <Background
              color="#0a1628"
              gap={24}
              size={1}
              variant={"dots" as any}
            />
            <Controls showInteractive={false} />

            {/* Toolbar */}
            <Panel position="top-left">
              <div className="nl-toolbar">
                <input
                  className="nl-search"
                  placeholder="Filtrar células..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <div className="nl-sep" />
                <button
                  className={`nl-btn ${showOnlyActive ? "nl-btn-on" : ""}`}
                  onClick={() => setShowOnlyActive((p) => !p)}
                  title="Mostrar apenas elementos ativos"
                >
                  ⚡ Ativos
                </button>
                <button
                  className={`nl-btn ${showInfo ? "nl-btn-on" : ""}`}
                  onClick={() => setShowInfo((p) => !p)}
                >
                  ◧ Info
                </button>
                {hasSimulation && (
                  <>
                    <div className="nl-sep" />
                    <div
                      style={{
                        fontFamily: "JetBrains Mono",
                        fontSize: "9px",
                        color: "#22c55e",
                        fontWeight: 700,
                      }}
                    >
                      {activeCount} ativos
                    </div>
                  </>
                )}
              </div>
            </Panel>

            {/* Legend */}
            <Panel position="bottom-left">
              <div className="nl-legend">
                {[
                  { label: "DFF", color: "#f59e0b" },
                  { label: "MUX", color: "#a855f7" },
                  { label: "ARITH", color: "#22c55e" },
                  { label: "GATE", color: "#3b82f6" },
                  { label: "SHIFT", color: "#06b6d4" },
                  { label: "CMP", color: "#ec4899" },
                  { label: "MEM", color: "#14b8a6" },
                ].map(({ label, color }) => (
                  <div className="nl-legend-item" key={label}>
                    <div
                      className="nl-legend-dot"
                      style={{ background: color }}
                    />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Stats pill */}
            {stats && (
              <Panel
                position="top-right"
                style={{
                  marginRight: showInfo ? 248 : 0,
                  transition: "margin 0.2s",
                }}
              >
                <div
                  style={{
                    fontFamily: "JetBrains Mono",
                    fontSize: "9px",
                    color: "#475569",
                    background: "rgba(9,14,28,0.92)",
                    border: "1px solid rgba(148,163,184,0.1)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    display: "flex",
                    gap: 14,
                  }}
                >
                  <span>
                    Módulo: <b style={{ color: "#60a5fa" }}>{stats.modName}</b>
                  </span>
                  <span>
                    Células:{" "}
                    <b style={{ color: "#a855f7" }}>{stats.cellCount}</b>
                  </span>
                  <span>
                    Portas:{" "}
                    <b style={{ color: "#22c55e" }}>{stats.portCount}</b>
                  </span>
                  <span>
                    Nós: <b style={{ color: "#f59e0b" }}>{nodes.length}</b>
                  </span>
                  <span>
                    Arestas: <b style={{ color: "#06b6d4" }}>{edges.length}</b>
                  </span>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Info panel */}
        {showInfo && stats && (
          <div className="nl-info">
            <div className="nl-info-hdr">
              <span className="nl-info-title">Netlist Info</span>
              <button
                className="nl-btn"
                style={{ padding: "2px 7px" }}
                onClick={() => setShowInfo(false)}
              >
                ✕
              </button>
            </div>
            <div className="nl-info-body">
              <div
                style={{
                  color: "#a855f7",
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
                  <div
                    className="nl-info-stat-val"
                    style={{ color: "#22c55e" }}
                  >
                    {activeCount}
                  </div>
                </div>
              )}

              <div
                style={{
                  fontSize: "8px",
                  color: "#475569",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "12px 0 6px",
                }}
              >
                Por Categoria
              </div>
              {Object.entries(stats.categories)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => (
                  <div
                    key={cat}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "3px 0",
                      borderBottom: "1px solid rgba(148,163,184,0.05)",
                      fontSize: "9px",
                    }}
                  >
                    <span style={{ color: "#64748b" }}>{cat}</span>
                    <span style={{ fontWeight: 700, color: "#94a3b8" }}>
                      {count}
                    </span>
                  </div>
                ))}

              <div
                style={{
                  fontSize: "8px",
                  color: "#475569",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "12px 0 6px",
                }}
              >
                Portas do Módulo
              </div>
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
                        <span style={{ color: "#334155", fontSize: "8px" }}>
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
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
