import React, {
  useMemo,
  useCallback,
  useState,
  useEffect,
  useRef,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
} from "@xyflow/react";
import type {
  Node,
  Edge,
  NodeProps,
  EdgeProps,
  NodeChange,
  XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./style.css";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
interface VCDVariable {
  size: string;
  var_type: string;
  references: string[];
}
interface VCDModule {
  variables: Record<string, VCDVariable>;
  subscopes: string[];
}
interface SimulationModules {
  [moduleName: string]: VCDModule;
}
interface Timeline {
  [timestamp: string]: Record<string, string>;
}
interface DatapathViewerProps {
  activeSignals?: Record<string, string>;
  activeElements?: string[];
  modules?: SimulationModules;
  timeline?: Timeline;
}
interface DatapathNodeData extends Record<string, unknown> {
  label: string;
  subLabel?: string;
  active: boolean;
  inactive: boolean;
  currentValues?: Record<string, string>;
  modulePath?: string;
}
interface DatapathEdgeData extends Record<string, unknown> {
  busWidth?: number;
  isControl?: boolean;
  active?: boolean;
  signalName?: string;
  edgeType?: "data" | "control" | "bus";
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS DE SINAL
// ─────────────────────────────────────────────────────────────────────────────
function isModuleActive(
  moduleName: string,
  activeSignals: Record<string, string>,
): boolean {
  const lower = moduleName.toLowerCase();
  for (const k of Object.keys(activeSignals)) {
    const segs = k.toLowerCase().split(".");
    if (segs.includes(lower)) return true;
  }
  return false;
}

function getModuleSignals(
  modulePath: string,
  activeSignals: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const lower = modulePath.toLowerCase();
  for (const [k, v] of Object.entries(activeSignals)) {
    if (k.toLowerCase().includes(lower)) {
      const short = k.split(".").pop() ?? k;
      result[short] = v;
    }
  }
  return result;
}

function formatValue(raw: string, base: "hex" | "bin" | "dec"): string {
  if (!raw || raw === "x" || raw === "z") return raw;
  if (raw.length === 1 && !/^[01]+$/.test(raw)) return raw;
  try {
    const n = parseInt(raw, 2);
    if (isNaN(n)) return raw;
    if (base === "hex")
      return (
        "0x" +
        n
          .toString(16)
          .toUpperCase()
          .padStart(Math.ceil(raw.length / 4), "0")
      );
    if (base === "dec") return String(n);
    return raw;
  } catch {
    return raw;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLTIP GLOBAL
// ─────────────────────────────────────────────────────────────────────────────
interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  active: boolean;
  signals: Record<string, string>;
  nodeType: string;
}

const TooltipCtx = React.createContext<{
  show: (s: Omit<TooltipState, "visible">) => void;
  hide: () => void;
}>({ show: () => {}, hide: () => {} });

function TooltipProvider({ children }: { children: React.ReactNode }) {
  const [tip, setTip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    label: "",
    active: false,
    signals: {},
    nodeType: "",
  });
  const [valBase, setValBase] = useState<"hex" | "bin" | "dec">("hex");

  const show = useCallback((s: Omit<TooltipState, "visible">) => {
    setTip({ visible: true, ...s });
  }, []);
  const hide = useCallback(() => setTip((p) => ({ ...p, visible: false })), []);

  return (
    <TooltipCtx.Provider value={{ show, hide }}>
      {children}
      {tip.visible && (
        <div
          className="dp-tooltip"
          style={{ left: tip.x + 16, top: tip.y - 10 }}
        >
          <div className="dp-tooltip-title">
            <span>{tip.label}</span>
            <span
              className={`dp-tooltip-badge ${tip.active ? "active" : "idle"}`}
              onClick={() =>
                setValBase((b) =>
                  b === "hex" ? "bin" : b === "bin" ? "dec" : "hex",
                )
              }
              style={{
                pointerEvents: "all",
                cursor: "pointer",
                userSelect: "none",
              }}
              title="Clique para trocar base"
            >
              {tip.active ? "ATIVO" : "IDLE"} · {valBase.toUpperCase()}
            </span>
          </div>
          {Object.keys(tip.signals).length > 0 && (
            <>
              <hr className="dp-tooltip-divider" />
              {Object.entries(tip.signals).map(([k, v]) => (
                <div className="dp-tooltip-row" key={k}>
                  <span className="dp-tooltip-sig">{k}</span>
                  <span className="dp-tooltip-val">
                    {formatValue(v, valBase)}
                  </span>
                </div>
              ))}
            </>
          )}
          <hr className="dp-tooltip-divider" />
          <div style={{ color: "#475569", fontSize: "8px" }}>
            {tip.nodeType} · Clique no badge p/ trocar base
          </div>
        </div>
      )}
    </TooltipCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE NODE WRAPPER (fornece hover, tooltip, estados visuais)
// ─────────────────────────────────────────────────────────────────────────────
function useNodeTip(data: DatapathNodeData, nodeType: string) {
  const { show, hide } = React.useContext(TooltipCtx);
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      show({
        x: e.clientX,
        y: e.clientY,
        label: data.label,
        active: data.active,
        signals: data.currentValues ?? {},
        nodeType,
      });
    },
    [data, nodeType, show],
  );
  const onMouseLeave = useCallback(() => hide(), [hide]);
  return { onMouseMove, onMouseLeave };
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE COMPONENTS — cada um com SVG canônico
// ─────────────────────────────────────────────────────────────────────────────

// PC — Registrador simples
const PcNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Program Counter");
  const color = "#2980b9";
  const glow = d.active ? `0 0 18px 4px ${color}80` : "none";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
      aria-label={`Program Counter ${d.active ? "ativo" : "inativo"}`}
    >
      <svg
        width="56"
        height="80"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 8px ${color})` : "none",
        }}
      >
        <rect
          x="2"
          y="2"
          width="52"
          height="76"
          rx="3"
          fill={d.active ? "#0f2744" : "#0c1a2e"}
          stroke={d.active ? "#e74c3c" : color}
          strokeWidth={d.active ? 2.5 : 1.5}
        />
        {/* register stripes */}
        {[16, 28, 40, 52, 64].map((y) => (
          <line
            key={y}
            x1="6"
            y1={y}
            x2="50"
            y2={y}
            stroke="rgba(41,128,185,0.18)"
            strokeWidth="0.8"
          />
        ))}
        <text
          x="28"
          y="44"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : "#60a5fa"}
          fontSize="11"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          PC
        </text>
      </svg>
      <Handle
        type="source"
        position={Position.Right}
        id="pc_out"
        style={{
          top: "50%",
          background: color,
          width: 8,
          height: 8,
          border: "2px solid #0c1a2e",
        }}
      />
    </div>
  );
});

// ADDER — soma com símbolo +
const AdderNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Somador");
  const color = "#3498db";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="56"
        height="56"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 7px ${color})` : "none",
        }}
      >
        <circle
          cx="28"
          cy="28"
          r="25"
          fill={d.active ? "#0f2744" : "#0c1a2e"}
          stroke={d.active ? "#e74c3c" : color}
          strokeWidth={d.active ? 2.5 : 1.5}
        />
        <text
          x="28"
          y="29"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : "#60a5fa"}
          fontSize="20"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          +
        </text>
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="a"
        style={{
          top: "30%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0c1a2e",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="b"
        style={{
          top: "70%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0c1a2e",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="sum"
        style={{
          top: "50%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0c1a2e",
        }}
      />
    </div>
  );
});

// INSTRUCTION MEMORY
const InstrMemNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Instruction Memory");
  const color = "#27ae60";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="110"
        height="130"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 9px ${color})` : "none",
        }}
      >
        <rect
          x="2"
          y="2"
          width="106"
          height="126"
          rx="4"
          fill={d.active ? "#071a10" : "#060f0b"}
          stroke={d.active ? "#e74c3c" : color}
          strokeWidth={d.active ? 2.5 : 1.5}
        />
        {/* memory cell stripes */}
        {[22, 36, 50, 64, 78, 92, 106].map((y) => (
          <line
            key={y}
            x1="6"
            y1={y}
            x2="106"
            y2={y}
            stroke="rgba(39,174,96,0.15)"
            strokeWidth="0.8"
          />
        ))}
        <line
          x1="2"
          y1="20"
          x2="108"
          y2="20"
          stroke={color}
          strokeWidth="0.8"
          opacity="0.5"
        />
        <text
          x="55"
          y="13"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : color}
          fontSize="8"
          fontFamily="JetBrains Mono"
          fontWeight="700"
          textTransform="uppercase"
        >
          Instruction Memory
        </text>
        <text
          x="55"
          y="70"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(39,174,96,0.45)"
          fontSize="24"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          IM
        </text>
        {d.subLabel && (
          <text
            x="55"
            y="116"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(39,174,96,0.5)"
            fontSize="8"
            fontFamily="JetBrains Mono"
          >
            {d.subLabel as string}
          </text>
        )}
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="address"
        style={{
          top: "40%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #060f0b",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="instruction"
        style={{
          top: "40%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #060f0b",
        }}
      />
    </div>
  );
});

// REGISTER FILE — com seção Read/Write
const RegisterFileNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Register File");
  const color = "#f39c12";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="120"
        height="160"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 9px ${color})` : "none",
        }}
      >
        <rect
          x="2"
          y="2"
          width="116"
          height="156"
          rx="4"
          fill={d.active ? "#1a0f00" : "#100b00"}
          stroke={d.active ? "#e74c3c" : color}
          strokeWidth={d.active ? 2.5 : 1.5}
        />
        {/* divider */}
        <line
          x1="2"
          y1="82"
          x2="118"
          y2="82"
          stroke={color}
          strokeWidth="1"
          opacity="0.5"
        />
        {/* READ section */}
        <text
          x="60"
          y="14"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize="7"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          READ
        </text>
        <text
          x="60"
          y="50"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(243,156,18,0.35)"
          fontSize="22"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          RF
        </text>
        {/* WRITE section */}
        <text
          x="60"
          y="94"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize="7"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          WRITE
        </text>
        <text
          x="60"
          y="136"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : color}
          fontSize="9"
          fontFamily="JetBrains Mono"
          fontWeight="600"
        >
          Registers
        </text>
      </svg>
      {/* READ inputs */}
      <Handle
        type="target"
        position={Position.Left}
        id="read_reg1"
        style={{
          top: "22%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #100b00",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="read_reg2"
        style={{
          top: "38%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #100b00",
        }}
      />
      {/* WRITE inputs */}
      <Handle
        type="target"
        position={Position.Left}
        id="write_reg"
        style={{
          top: "62%",
          background: "#e74c3c",
          width: 7,
          height: 7,
          border: "2px solid #100b00",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="write_data"
        style={{
          top: "78%",
          background: "#e74c3c",
          width: 7,
          height: 7,
          border: "2px solid #100b00",
        }}
      />
      {/* READ outputs */}
      <Handle
        type="source"
        position={Position.Right}
        id="read_data1"
        style={{
          top: "28%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #100b00",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="read_data2"
        style={{
          top: "44%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #100b00",
        }}
      />
      {/* RegWrite control */}
      <Handle
        type="target"
        position={Position.Top}
        id="reg_write"
        style={{
          left: "50%",
          background: "#e74c3c",
          width: 7,
          height: 7,
          border: "2px solid #100b00",
        }}
      />
    </div>
  );
});

// ALU — forma clássica em D / V-shape
const AluNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Arithmetic Logic Unit");
  const color = "#8e44ad";
  const stroke = d.active ? "#e74c3c" : color;
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="88"
        height="108"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 10px ${color})` : "none",
        }}
      >
        <path
          d="M 4,4 L 84,22 L 84,86 L 4,104 L 4,68 L 22,54 L 4,40 Z"
          fill={d.active ? "#1a0a2e" : "#100820"}
          stroke={stroke}
          strokeWidth={d.active ? 2.5 : 1.8}
          strokeLinejoin="round"
        />
        <text
          x="52"
          y="54"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : color}
          fontSize="13"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          ALU
        </text>
        {d.currentValues?.alu_ctrl && (
          <text
            x="52"
            y="70"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(142,68,173,0.7)"
            fontSize="7"
            fontFamily="JetBrains Mono"
          >
            ctrl:{d.currentValues.alu_ctrl}
          </text>
        )}
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="a"
        style={{
          top: "28%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #100820",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="b"
        style={{
          top: "72%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #100820",
        }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="alu_ctrl"
        style={{
          left: "62%",
          background: "#e74c3c",
          width: 7,
          height: 7,
          border: "2px solid #100820",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="result"
        style={{
          top: "46%",
          background: color,
          width: 8,
          height: 8,
          border: "2px solid #100820",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="zero"
        style={{
          top: "72%",
          background: "#3498db",
          width: 7,
          height: 7,
          border: "2px solid #100820",
        }}
      />
    </div>
  );
});

// MUX — trapézio canônico
const MuxNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Multiplexer");
  const color = "#e74c3c";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="34"
        height="88"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 8px ${color})` : "none",
        }}
      >
        <path
          d="M 4,6 L 30,14 L 30,74 L 4,82 Z"
          fill={d.active ? "#2d0808" : "#1a0505"}
          stroke={d.active ? "#f97316" : color}
          strokeWidth={d.active ? 2.5 : 1.8}
          strokeLinejoin="round"
        />
        <text
          x="17"
          y="44"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#f97316" : color}
          fontSize="7"
          fontFamily="JetBrains Mono"
          fontWeight="700"
          transform="rotate(-90,17,44)"
        >
          MUX
        </text>
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="in0"
        style={{
          top: "22%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #1a0505",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="in1"
        style={{
          top: "78%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #1a0505",
        }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="sel"
        style={{
          left: "50%",
          background: "#e67e22",
          width: 7,
          height: 7,
          border: "2px solid #1a0505",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{
          top: "50%",
          background: color,
          width: 8,
          height: 8,
          border: "2px solid #1a0505",
        }}
      />
    </div>
  );
});

// DATA MEMORY — listras cruzadas
const DataMemNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Data Memory");
  const color = "#1abc9c";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="110"
        height="140"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 9px ${color})` : "none",
        }}
      >
        <rect
          x="2"
          y="2"
          width="106"
          height="136"
          rx="4"
          fill={d.active ? "#001a14" : "#000f0c"}
          stroke={d.active ? "#e74c3c" : color}
          strokeWidth={d.active ? 2.5 : 1.5}
        />
        {/* horizontal stripes */}
        {[22, 36, 50, 64, 78, 92, 106, 120].map((y) => (
          <line
            key={y}
            x1="6"
            y1={y}
            x2="106"
            y2={y}
            stroke="rgba(26,188,156,0.1)"
            strokeWidth="0.8"
          />
        ))}
        {/* vertical stripes */}
        {[28, 52, 76].map((x) => (
          <line
            key={x}
            x1={x}
            y1="22"
            x2={x}
            y2="136"
            stroke="rgba(26,188,156,0.08)"
            strokeWidth="0.8"
          />
        ))}
        <line
          x1="2"
          y1="20"
          x2="108"
          y2="20"
          stroke={color}
          strokeWidth="0.8"
          opacity="0.5"
        />
        <text
          x="55"
          y="13"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : color}
          fontSize="7.5"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          Data Memory
        </text>
        <text
          x="55"
          y="78"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(26,188,156,0.3)"
          fontSize="22"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          DM
        </text>
        <text
          x="55"
          y="122"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(26,188,156,0.45)"
          fontSize="7"
          fontFamily="JetBrains Mono"
        >
          Read / Write
        </text>
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="address"
        style={{
          top: "35%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #000f0c",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="write_data"
        style={{
          top: "55%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #000f0c",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="read_data"
        style={{
          top: "45%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #000f0c",
        }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="mem_read"
        style={{
          left: "35%",
          background: "#e74c3c",
          width: 7,
          height: 7,
          border: "2px solid #000f0c",
        }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="mem_write"
        style={{
          left: "65%",
          background: "#e74c3c",
          width: 7,
          height: 7,
          border: "2px solid #000f0c",
        }}
      />
    </div>
  );
});

// CONTROL UNIT — elipse dupla borda
const ControlNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Control Unit");
  const color = "#c0392b";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="130"
        height="68"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 12px ${color})` : "none",
        }}
      >
        {/* outer ellipse */}
        <ellipse
          cx="65"
          cy="34"
          rx="62"
          ry="30"
          fill={d.active ? "#1a0504" : "#0f0302"}
          stroke={d.active ? "#e74c3c" : color}
          strokeWidth={d.active ? 2.5 : 1.8}
        />
        {/* inner ellipse */}
        <ellipse
          cx="65"
          cy="34"
          rx="54"
          ry="23"
          fill="none"
          stroke={d.active ? "rgba(231,76,60,0.3)" : "rgba(192,57,43,0.25)"}
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text
          x="65"
          y="34"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : color}
          fontSize="11"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          Control
        </text>
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="opcode"
        style={{
          top: "50%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0f0302",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="reg_dst"
        style={{
          top: "15%",
          background: color,
          width: 6,
          height: 6,
          border: "2px solid #0f0302",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="alu_src"
        style={{
          top: "32%",
          background: color,
          width: 6,
          height: 6,
          border: "2px solid #0f0302",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="mem_to_reg"
        style={{
          top: "50%",
          background: color,
          width: 6,
          height: 6,
          border: "2px solid #0f0302",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="reg_write_ctrl"
        style={{
          top: "68%",
          background: color,
          width: 6,
          height: 6,
          border: "2px solid #0f0302",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="mem_read_ctrl"
        style={{
          top: "85%",
          background: color,
          width: 6,
          height: 6,
          border: "2px solid #0f0302",
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="branch_ctrl"
        style={{
          left: "40%",
          background: color,
          width: 6,
          height: 6,
          border: "2px solid #0f0302",
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="mem_write_ctrl"
        style={{
          left: "60%",
          background: color,
          width: 6,
          height: 6,
          border: "2px solid #0f0302",
        }}
      />
    </div>
  );
});

// SIGN EXTEND
const SignExtNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Sign Extend");
  const color = "#7f8c8d";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="72"
        height="48"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 6px ${color})` : "none",
        }}
      >
        <rect
          x="2"
          y="2"
          width="68"
          height="44"
          rx="3"
          fill={d.active ? "#111318" : "#0a0c0f"}
          stroke={d.active ? "#e74c3c" : color}
          strokeWidth={d.active ? 2 : 1.2}
        />
        <text
          x="36"
          y="18"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : "#94a3b8"}
          fontSize="7"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          Sign
        </text>
        <text
          x="36"
          y="32"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : "#94a3b8"}
          fontSize="7"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          Extend
        </text>
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{
          top: "50%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0a0c0f",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{
          top: "50%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0a0c0f",
        }}
      />
    </div>
  );
});

// SHIFT LEFT 2
const ShiftLeftNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Shift Left 2");
  const color = "#7f8c8d";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="72"
        height="48"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 6px ${color})` : "none",
        }}
      >
        <rect
          x="2"
          y="2"
          width="68"
          height="44"
          rx="3"
          fill={d.active ? "#111318" : "#0a0c0f"}
          stroke={d.active ? "#e74c3c" : color}
          strokeWidth={d.active ? 2 : 1.2}
        />
        <text
          x="36"
          y="18"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : "#94a3b8"}
          fontSize="11"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          {"<<"}
        </text>
        <text
          x="36"
          y="34"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : "#64748b"}
          fontSize="7"
          fontFamily="JetBrains Mono"
        >
          Shift Left 2
        </text>
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{
          top: "50%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0a0c0f",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{
          top: "50%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0a0c0f",
        }}
      />
    </div>
  );
});

// AND GATE — forma canônica D-shape
const AndGateNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "AND Gate");
  const color = "#e67e22";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="72"
        height="68"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 7px ${color})` : "none",
        }}
      >
        <path
          d="M 4,4 L 36,4 Q 68,4 68,34 Q 68,64 36,64 L 4,64 Z"
          fill={d.active ? "#1a0a00" : "#0f0600"}
          stroke={d.active ? "#e74c3c" : color}
          strokeWidth={d.active ? 2.5 : 1.8}
        />
        <text
          x="30"
          y="34"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#e74c3c" : color}
          fontSize="9"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          &amp;
        </text>
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="in0"
        style={{
          top: "30%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0f0600",
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="in1"
        style={{
          top: "70%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0f0600",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{
          top: "50%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #0f0600",
        }}
      />
    </div>
  );
});

// BLOCO GENÉRICO (fallback)
const GenericBlockNode = React.memo(({ data }: NodeProps) => {
  const d = data as DatapathNodeData;
  const { onMouseMove, onMouseLeave } = useNodeTip(d, "Module");
  const color = "#475569";
  return (
    <div
      className="dp-node-wrap"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ opacity: d.inactive ? 0.38 : 1 }}
    >
      <svg
        width="100"
        height="64"
        style={{
          display: "block",
          filter: d.active ? `drop-shadow(0 0 7px #60a5fa)` : "none",
        }}
      >
        <rect
          x="2"
          y="2"
          width="96"
          height="60"
          rx="4"
          fill={d.active ? "#0f1a2e" : "#080e1c"}
          stroke={d.active ? "#e74c3c" : color}
          strokeWidth={d.active ? 2.5 : 1.5}
        />
        <text
          x="50"
          y="32"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={d.active ? "#60a5fa" : "#64748b"}
          fontSize="10"
          fontFamily="JetBrains Mono"
          fontWeight="700"
        >
          {(d.label as string).substring(0, 12)}
        </text>
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{
          top: "50%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #080e1c",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{
          top: "50%",
          background: color,
          width: 7,
          height: 7,
          border: "2px solid #080e1c",
        }}
      />
    </div>
  );
});

const NODE_TYPES = {
  pc: PcNode,
  adder: AdderNode,
  instrMem: InstrMemNode,
  regFile: RegisterFileNode,
  alu: AluNode,
  mux: MuxNode,
  dataMem: DataMemNode,
  control: ControlNode,
  signExt: SignExtNode,
  shiftLeft: ShiftLeftNode,
  andGate: AndGateNode,
  generic: GenericBlockNode,
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM EDGES
// ─────────────────────────────────────────────────────────────────────────────
const DataEdge = React.memo(
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
    const d = (data ?? {}) as DatapathEdgeData;
    const [path, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    const isActive = d.active;
    const isControl = d.isControl;
    const isBus = (d.busWidth ?? 1) > 1;

    const strokeColor = isControl
      ? isActive
        ? "#e74c3c"
        : "rgba(192,57,43,0.45)"
      : isBus
        ? isActive
          ? "#3b82f6"
          : "rgba(37,99,235,0.5)"
        : isActive
          ? "#60a5fa"
          : "#334155";

    const strokeW = isBus ? 3.5 : isControl ? 1.5 : isActive ? 2.5 : 1.5;

    const edgeClass = isControl
      ? isActive
        ? "dp-edge-ctrl-active"
        : "dp-edge-ctrl-always"
      : isActive
        ? "dp-edge-data-active"
        : "";

    return (
      <>
        <BaseEdge
          id={id}
          path={path}
          markerEnd={markerEnd}
          className={edgeClass}
          style={{
            stroke: strokeColor,
            strokeWidth: strokeW,
            opacity: isActive ? 1 : 0.5,
            filter:
              isActive && !isControl
                ? `drop-shadow(0 0 4px ${strokeColor})`
                : "none",
            transition: "stroke 0.2s, stroke-width 0.2s, opacity 0.2s",
          }}
        />
        {isBus && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: "none",
                fontFamily: "JetBrains Mono",
                fontSize: "8px",
                fontWeight: 700,
                color: strokeColor,
                background: "#080e1c",
                padding: "1px 4px",
                borderRadius: "3px",
                border: `1px solid ${strokeColor}40`,
              }}
            >
              [{d.busWidth! - 1}:0]
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);

const EDGE_TYPES = { dataEdge: DataEdge };

// ─────────────────────────────────────────────────────────────────────────────
// HARDCODED MIPS SINGLE-CYCLE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────
const MIPS_NODES: Node[] = [
  {
    id: "pc",
    type: "pc",
    position: { x: 40, y: 280 },
    data: { label: "PC", active: false, inactive: false },
  },
  {
    id: "adder_pc4",
    type: "adder",
    position: { x: 40, y: 120 },
    data: { label: "Add", active: false, inactive: false },
  },
  {
    id: "imem",
    type: "instrMem",
    position: { x: 160, y: 230 },
    data: { label: "Instruction\nMemory", active: false, inactive: false },
  },
  {
    id: "control",
    type: "control",
    position: { x: 360, y: 40 },
    data: { label: "Control", active: false, inactive: false },
  },
  {
    id: "regfile",
    type: "regFile",
    position: { x: 390, y: 215 },
    data: { label: "Registers", active: false, inactive: false },
  },
  {
    id: "sign_ext",
    type: "signExt",
    position: { x: 390, y: 440 },
    data: { label: "Sign Ext", active: false, inactive: false },
  },
  {
    id: "shift_left",
    type: "shiftLeft",
    position: { x: 390, y: 510 },
    data: { label: "Shift Left", active: false, inactive: false },
  },
  {
    id: "mux_alu_b",
    type: "mux",
    position: { x: 560, y: 330 },
    data: { label: "Mux", active: false, inactive: false },
  },
  {
    id: "alu",
    type: "alu",
    position: { x: 660, y: 230 },
    data: { label: "ALU", active: false, inactive: false },
  },
  {
    id: "and_gate",
    type: "andGate",
    position: { x: 660, y: 470 },
    data: { label: "AND", active: false, inactive: false },
  },
  {
    id: "adder_br",
    type: "adder",
    position: { x: 550, y: 510 },
    data: { label: "Add", active: false, inactive: false },
  },
  {
    id: "dmem",
    type: "dataMem",
    position: { x: 820, y: 220 },
    data: { label: "Data\nMemory", active: false, inactive: false },
  },
  {
    id: "mux_pc",
    type: "mux",
    position: { x: 150, y: 100 },
    data: { label: "Mux", active: false, inactive: false },
  },
  {
    id: "mux_wb",
    type: "mux",
    position: { x: 1000, y: 280 },
    data: { label: "Mux", active: false, inactive: false },
  },
  {
    id: "mux_rd",
    type: "mux",
    position: { x: 560, y: 190 },
    data: { label: "Mux", active: false, inactive: false },
  },
];

const MIPS_EDGES: Edge[] = [
  // Fetch
  {
    id: "e-pc-imem",
    source: "pc",
    sourceHandle: "pc_out",
    target: "imem",
    targetHandle: "address",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-pc-adder",
    source: "pc",
    sourceHandle: "pc_out",
    target: "adder_pc4",
    targetHandle: "a",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-adder4-muxpc",
    source: "adder_pc4",
    sourceHandle: "sum",
    target: "mux_pc",
    targetHandle: "in0",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-const4-adder",
    source: "adder_pc4",
    sourceHandle: "b",
    target: "adder_pc4",
    targetHandle: "b",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data" },
  },
  // Decode
  {
    id: "e-imem-ctrl",
    source: "imem",
    sourceHandle: "instruction",
    target: "control",
    targetHandle: "opcode",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 6 },
  },
  {
    id: "e-imem-rr1",
    source: "imem",
    sourceHandle: "instruction",
    target: "regfile",
    targetHandle: "read_reg1",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 5 },
  },
  {
    id: "e-imem-rr2",
    source: "imem",
    sourceHandle: "instruction",
    target: "regfile",
    targetHandle: "read_reg2",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 5 },
  },
  {
    id: "e-imem-se",
    source: "imem",
    sourceHandle: "instruction",
    target: "sign_ext",
    targetHandle: "in",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 16 },
  },
  {
    id: "e-imem-muxrd",
    source: "imem",
    sourceHandle: "instruction",
    target: "mux_rd",
    targetHandle: "in0",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 5 },
  },
  // Execute
  {
    id: "e-reg-aluA",
    source: "regfile",
    sourceHandle: "read_data1",
    target: "alu",
    targetHandle: "a",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-reg-muxB",
    source: "regfile",
    sourceHandle: "read_data2",
    target: "mux_alu_b",
    targetHandle: "in0",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-se-muxB",
    source: "sign_ext",
    sourceHandle: "out",
    target: "mux_alu_b",
    targetHandle: "in1",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-muxB-alu",
    source: "mux_alu_b",
    sourceHandle: "out",
    target: "alu",
    targetHandle: "b",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-se-sl",
    source: "sign_ext",
    sourceHandle: "out",
    target: "shift_left",
    targetHandle: "in",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-sl-addbr",
    source: "shift_left",
    sourceHandle: "out",
    target: "adder_br",
    targetHandle: "a",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  // Memory
  {
    id: "e-alu-dmem",
    source: "alu",
    sourceHandle: "result",
    target: "dmem",
    targetHandle: "address",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-alu-muxwb0",
    source: "alu",
    sourceHandle: "result",
    target: "mux_wb",
    targetHandle: "in0",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-reg-dmem",
    source: "regfile",
    sourceHandle: "read_data2",
    target: "dmem",
    targetHandle: "write_data",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-zero-and",
    source: "alu",
    sourceHandle: "zero",
    target: "and_gate",
    targetHandle: "in0",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data" },
  },
  // Write Back
  {
    id: "e-dmem-muxwb",
    source: "dmem",
    sourceHandle: "read_data",
    target: "mux_wb",
    targetHandle: "in1",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
  },
  {
    id: "e-muxwb-reg",
    source: "mux_wb",
    sourceHandle: "out",
    target: "regfile",
    targetHandle: "write_data",
    type: "dataEdge",
    data: { isControl: false, active: false, edgeType: "data", busWidth: 32 },
    style: { opacity: 0.7 },
  },
  // Control signals
  {
    id: "c-regwrite",
    source: "control",
    sourceHandle: "reg_write_ctrl",
    target: "regfile",
    targetHandle: "reg_write",
    type: "dataEdge",
    data: { isControl: true, active: false, edgeType: "control" },
  },
  {
    id: "c-alusrc",
    source: "control",
    sourceHandle: "alu_src",
    target: "mux_alu_b",
    targetHandle: "sel",
    type: "dataEdge",
    data: { isControl: true, active: false, edgeType: "control" },
  },
  {
    id: "c-memread",
    source: "control",
    sourceHandle: "mem_read_ctrl",
    target: "dmem",
    targetHandle: "mem_read",
    type: "dataEdge",
    data: { isControl: true, active: false, edgeType: "control" },
  },
  {
    id: "c-memwrite",
    source: "control",
    sourceHandle: "mem_write_ctrl",
    target: "dmem",
    targetHandle: "mem_write",
    type: "dataEdge",
    data: { isControl: true, active: false, edgeType: "control" },
  },
  {
    id: "c-branch-and",
    source: "control",
    sourceHandle: "branch_ctrl",
    target: "and_gate",
    targetHandle: "in1",
    type: "dataEdge",
    data: { isControl: true, active: false, edgeType: "control" },
  },
  {
    id: "c-memtoreg",
    source: "control",
    sourceHandle: "mem_to_reg",
    target: "mux_wb",
    targetHandle: "sel",
    type: "dataEdge",
    data: { isControl: true, active: false, edgeType: "control" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE STAGES
// ─────────────────────────────────────────────────────────────────────────────
const PIPELINE_STAGES = {
  IF: {
    nodes: ["pc", "adder_pc4", "imem", "mux_pc"],
    edges: ["e-pc-imem", "e-pc-adder", "e-adder4-muxpc"],
    color: "#3b82f6",
    label: "IF — Fetch",
  },
  ID: {
    nodes: ["imem", "control", "regfile", "sign_ext", "mux_rd"],
    edges: [
      "e-imem-ctrl",
      "e-imem-rr1",
      "e-imem-rr2",
      "e-imem-se",
      "e-imem-muxrd",
      "c-regwrite",
    ],
    color: "#22c55e",
    label: "ID — Decode",
  },
  EX: {
    nodes: ["regfile", "mux_alu_b", "alu", "shift_left", "adder_br"],
    edges: [
      "e-reg-aluA",
      "e-reg-muxB",
      "e-se-muxB",
      "e-muxB-alu",
      "e-se-sl",
      "e-sl-addbr",
      "c-alusrc",
    ],
    color: "#a855f7",
    label: "EX — Execute",
  },
  MEM: {
    nodes: ["alu", "dmem", "and_gate"],
    edges: [
      "e-alu-dmem",
      "e-alu-muxwb0",
      "e-reg-dmem",
      "e-zero-and",
      "c-memread",
      "c-memwrite",
      "c-branch-and",
    ],
    color: "#f59e0b",
    label: "MEM — Memory",
  },
  WB: {
    nodes: ["dmem", "mux_wb", "regfile"],
    edges: ["e-dmem-muxwb", "e-muxwb-reg", "c-memtoreg"],
    color: "#ef4444",
    label: "WB — Write Back",
  },
};

function detectActiveStage(
  activeSignals: Record<string, string>,
): keyof typeof PIPELINE_STAGES | null {
  const vals = Object.entries(activeSignals);
  const has = (name: string) =>
    vals.some(([k]) => k.toLowerCase().includes(name));
  const val = (name: string) =>
    vals.find(([k]) => k.toLowerCase().includes(name))?.[1];

  if (has("mem_read") && val("mem_read") === "1") return "MEM";
  if (has("mem_write") && val("mem_write") === "1") return "MEM";
  if (has("reg_write") && val("reg_write") === "1") return "WB";
  if (has("alu_result") || has("alu.result")) return "EX";
  if (has("opcode") || has("control")) return "ID";
  if (has("pc")) return "IF";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL INSPECTOR PANEL
// ─────────────────────────────────────────────────────────────────────────────
function SignalInspector({
  modules,
  activeSignals,
  currentTimestamp,
  currentCycle,
  totalCycles,
  onClose,
}: {
  modules?: SimulationModules;
  activeSignals: Record<string, string>;
  currentTimestamp: number;
  currentCycle: number;
  totalCycles: number;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [valBase, setValBase] = useState<"hex" | "bin" | "dec">("hex");

  const toggleMod = (name: string) =>
    setCollapsed((p) => ({ ...p, [name]: !p[name] }));

  const moduleList = useMemo(() => {
    if (!modules) return [];
    return Object.entries(modules)
      .map(([name, mod]) => ({
        name,
        signals: Object.entries(mod.variables ?? {}).filter(
          ([sigName]) =>
            !search || sigName.toLowerCase().includes(search.toLowerCase()),
        ),
      }))
      .filter((m) => m.signals.length > 0);
  }, [modules, search]);

  return (
    <div className="dp-inspector">
      <div className="dp-inspector-header">
        <span className="dp-inspector-title">Signal Inspector</span>
        <button
          className="dp-btn"
          onClick={onClose}
          style={{ padding: "3px 8px" }}
        >
          ✕
        </button>
      </div>
      <div className="dp-inspector-body">
        <div className="dp-insp-meta">
          <div>
            Tempo: <span>{currentTimestamp.toLocaleString()} ps</span>
          </div>
          <div>
            Ciclo: <span>{currentCycle}</span> / <span>{totalCycles}</span>
          </div>
          <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
            {(["hex", "bin", "dec"] as const).map((b) => (
              <button
                key={b}
                className={`dp-btn ${valBase === b ? "dp-btn-active" : ""}`}
                style={{ padding: "2px 6px", fontSize: "8px" }}
                onClick={() => setValBase(b)}
              >
                {b.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <input
          className="dp-search"
          placeholder="Buscar sinal..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {moduleList.map(({ name, signals }) => (
          <div className="dp-module-block" key={name}>
            <div className="dp-module-header" onClick={() => toggleMod(name)}>
              <span className="dp-module-name">{name}</span>
              <span style={{ color: "#475569", fontSize: "9px" }}>
                {collapsed[name] ? "▶" : "▼"} {signals.length}
              </span>
            </div>
            {!collapsed[name] &&
              signals.map(([sigName, sigInfo]) => {
                const fullPath = `${name}.${sigName}`;
                const rawVal =
                  activeSignals[fullPath] ?? activeSignals[sigName] ?? "—";
                const isActive = rawVal !== "—";
                return (
                  <div className="dp-signal-row" key={sigName}>
                    <span className="dp-signal-name">{sigName}</span>
                    <span className="dp-signal-size">[{sigInfo.size}]</span>
                    <span
                      className={`dp-signal-val ${isActive ? "active" : ""}`}
                    >
                      {isActive ? formatValue(rawVal, valBase) : "—"}
                    </span>
                  </div>
                );
              })}
          </div>
        ))}
        {moduleList.length === 0 && (
          <div
            style={{
              color: "#334155",
              textAlign: "center",
              paddingTop: 20,
              fontSize: "9px",
            }}
          >
            {modules
              ? "Nenhum sinal encontrado"
              : "Execute a simulação para ver os sinais"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INNER FLOW COMPONENT (dentro do ReactFlowProvider)
// ─────────────────────────────────────────────────────────────────────────────
function DatapathInner({
  activeSignals = {},
  activeElements = [],
  modules,
  timeline,
}: DatapathViewerProps) {
  const rfInstance = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showInspector, setShowInspector] = useState(false);
  const [currentCycle, setCurrentCycle] = useState(0);
  const [totalCycles, setTotalCycles] = useState(0);
  const [activeStage, setActiveStage] = useState<
    keyof typeof PIPELINE_STAGES | null
  >(null);
  const [stageHighlight, setStageHighlight] = useState(false);
  const savedPositions = useRef<Record<string, XYPosition>>({});

  // Load saved positions from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("datapath-layout-v2");
      if (saved) savedPositions.current = JSON.parse(saved);
    } catch {}
  }, []);

  // Compute total clock cycles from timeline
  useEffect(() => {
    if (!timeline) return;
    let edges = 0,
      prev = "0";
    for (const changes of Object.values(timeline)) {
      for (const [k, v] of Object.entries(changes)) {
        if (/clk|clock/i.test(k)) {
          if (prev === "0" && v === "1") edges++;
          prev = v;
        }
      }
    }
    setTotalCycles(edges);
  }, [timeline]);

  // Build nodes with active state
  const computedNodes = useMemo(() => {
    const hasSimulation = Object.keys(activeSignals).length > 0;
    const stage = detectActiveStage(activeSignals);
    const stageNodes = stage ? PIPELINE_STAGES[stage].nodes : [];

    return MIPS_NODES.map((n) => {
      const pos = savedPositions.current[n.id] ?? n.position;
      const isActive =
        activeElements.includes(n.id) || isModuleActive(n.id, activeSignals);
      const isInactive = hasSimulation && !isActive;
      const isStageHighlighted = stageHighlight && stageNodes.includes(n.id);
      const signals = getModuleSignals(n.id, activeSignals);

      return {
        ...n,
        position: pos,
        draggable: true,
        data: {
          ...n.data,
          active: isActive || isStageHighlighted,
          inactive: isInactive && !isStageHighlighted,
          currentValues: signals,
          modulePath: n.id,
        },
      };
    });
  }, [activeSignals, activeElements, stageHighlight]);

  // Build edges with active state
  const computedEdges = useMemo(() => {
    const stage = detectActiveStage(activeSignals);
    const stageEdges = stage ? PIPELINE_STAGES[stage].edges : [];
    const hasSimulation = Object.keys(activeSignals).length > 0;

    return MIPS_EDGES.map((e) => {
      const isActive =
        activeElements.includes(e.id) || stageEdges.includes(e.id);
      const isCtrl = (e.data as DatapathEdgeData)?.isControl ?? false;

      return {
        ...e,
        data: {
          ...e.data,
          active: isActive,
          isControl: isCtrl,
        },
        markerEnd: {
          type: "arrowclosed" as const,
          width: 10,
          height: 10,
          color: isActive ? (isCtrl ? "#e74c3c" : "#60a5fa") : "#334155",
        },
        style: {
          opacity: hasSimulation && !isActive ? 0.25 : 1,
        },
      };
    });
  }, [activeSignals, activeElements, stageHighlight]);

  // Detect active stage
  useEffect(() => {
    setActiveStage(detectActiveStage(activeSignals));
  }, [activeSignals]);

  // Sync to ReactFlow state
  useEffect(() => {
    setNodes(computedNodes);
  }, [computedNodes, setNodes]);
  useEffect(() => {
    setEdges(computedEdges);
  }, [computedEdges, setEdges]);

  // Save positions on drag
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      const finished = changes.filter(
        (c): c is NodeChange & { type: "position"; dragging: boolean } =>
          c.type === "position" && (c as any).dragging === false,
      );
      if (finished.length > 0) {
        setNodes((prev) => {
          const positions: Record<string, XYPosition> = {};
          prev.forEach((n) => {
            positions[n.id] = n.position;
          });
          savedPositions.current = positions;
          try {
            localStorage.setItem(
              "datapath-layout-v2",
              JSON.stringify(positions),
            );
          } catch {}
          return prev;
        });
      }
    },
    [onNodesChange, setNodes],
  );

  const resetLayout = useCallback(() => {
    savedPositions.current = {};
    try {
      localStorage.removeItem("datapath-layout-v2");
    } catch {}
    setNodes(
      MIPS_NODES.map((n) => ({
        ...n,
        draggable: true,
        data: { ...n.data, active: false, inactive: false },
      })),
    );
    setTimeout(() => rfInstance.fitView({ padding: 0.12, duration: 400 }), 100);
  }, [rfInstance, setNodes]);

  const fitView = useCallback(() => {
    rfInstance.fitView({ padding: 0.1, duration: 400 });
  }, [rfInstance]);

  // Delay initial fitView so ReactFlow has time to measure container dimensions
  useEffect(() => {
    const t = setTimeout(() => {
      rfInstance.fitView({ padding: 0.12, duration: 300 });
    }, 150);
    return () => clearTimeout(t);
  }, [rfInstance]);

  const stageBadge = activeStage ? PIPELINE_STAGES[activeStage] : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: "#050c1a",
        minHeight: 0,
      }}
    >
      {/* Main canvas */}
      <div style={{ flex: 1, position: "relative" }} className="dp-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          minZoom={0.25}
          maxZoom={2.5}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          defaultEdgeOptions={{ type: "dataEdge" }}
        >
          <Background
            color="#0f1e35"
            gap={28}
            size={1}
            variant={"dots" as any}
          />
          <Controls showInteractive={false} />

          {/* Toolbar */}
          <Panel position="top-left">
            <div className="dp-toolbar">
              <button
                className="dp-btn"
                onClick={resetLayout}
                title="Reset posições"
              >
                ⟳ Reset
              </button>
              <button
                className="dp-btn"
                onClick={fitView}
                title="Auto-fit view"
              >
                ⊙ Fit
              </button>
              <div className="dp-sep" />
              <button
                className={`dp-btn ${stageHighlight ? "dp-btn-active" : ""}`}
                onClick={() => setStageHighlight((p) => !p)}
                title="Destacar estágio ativo"
              >
                ⚡ Estágio
              </button>
              <button
                className={`dp-btn ${showInspector ? "dp-btn-active" : ""}`}
                onClick={() => setShowInspector((p) => !p)}
              >
                {showInspector ? "✕" : "◧"} Inspector
              </button>
              {stageBadge && (
                <>
                  <div className="dp-sep" />
                  <div
                    className="dp-stage-badge"
                    style={{
                      background: `${stageBadge.color}22`,
                      color: stageBadge.color,
                      border: `1px solid ${stageBadge.color}55`,
                    }}
                  >
                    {stageBadge.label}
                  </div>
                </>
              )}
            </div>
          </Panel>

          {/* Legend */}
          <Panel position="bottom-left">
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                background: "rgba(5,12,26,0.88)",
                border: "1px solid rgba(148,163,184,0.1)",
                borderRadius: "8px",
                padding: "6px 12px",
                fontFamily: "JetBrains Mono",
                fontSize: "8px",
                color: "#475569",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="20" height="4">
                  <line
                    x1="0"
                    y1="2"
                    x2="20"
                    y2="2"
                    stroke="#60a5fa"
                    strokeWidth="2.5"
                  />
                </svg>
                Dado
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="20" height="4">
                  <line
                    x1="0"
                    y1="2"
                    x2="20"
                    y2="2"
                    stroke="#e74c3c"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                  />
                </svg>
                Controle
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg width="20" height="6">
                  <line
                    x1="0"
                    y1="3"
                    x2="20"
                    y2="3"
                    stroke="#3b82f6"
                    strokeWidth="3.5"
                  />
                </svg>
                Barramento
              </span>
              <span style={{ color: "#334155" }}>
                · Arraste os nós livremente
              </span>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Signal Inspector */}
      {showInspector && (
        <SignalInspector
          modules={modules}
          activeSignals={activeSignals}
          currentTimestamp={0}
          currentCycle={currentCycle}
          totalCycles={totalCycles}
          onClose={() => setShowInspector(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT DEFAULT — envolto no Provider obrigatório
// ─────────────────────────────────────────────────────────────────────────────
export default function DatapathViewer(props: DatapathViewerProps) {
  return (
    <ReactFlowProvider>
      <TooltipProvider>
        <DatapathInner {...props} />
      </TooltipProvider>
    </ReactFlowProvider>
  );
}
