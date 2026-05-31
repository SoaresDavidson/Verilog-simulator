import { useState, useMemo } from "react";
import { useSession } from "../../context/SessionContext";
import type { NetlistNode } from "../../types";
import "./style.css";

// ── Constantes ────────────────────────────────────────────────────────────

const NODE_W = 130;
const NODE_H = 50;
const COL_GAP = 70;
const ROW_GAP = 44;

// ── Tipagem de grupo ──────────────────────────────────────────────────────

interface NodeGroup {
  type: string;
  nodes: NetlistNode[];
  color: string;
  borderColor: string;
}

// ── Categorização de nós ──────────────────────────────────────────────────

function categorizeNode(type: string): {
  color: string;
  borderColor: string;
} {
  const t = type.toLowerCase();
  if (t.includes("dff") || t.includes("reg") || t.includes("flip"))
    return { color: "var(--stage-id)", borderColor: "var(--stage-id-border)" };
  if (
    t.includes("and") ||
    t.includes("or") ||
    t.includes("not") ||
    t.includes("xor") ||
    t.includes("nand") ||
    t.includes("nor")
  )
    return { color: "var(--stage-ex)", borderColor: "var(--stage-ex-border)" };
  if (t.includes("mux") || t.includes("sel"))
    return {
      color: "var(--stage-mem)",
      borderColor: "var(--stage-mem-border)",
    };
  if (t.includes("mem") || t.includes("ram") || t.includes("rom"))
    return { color: "var(--stage-if)", borderColor: "var(--stage-if-border)" };
  return { color: "var(--bg-tertiary)", borderColor: "var(--border-default)" };
}

function groupNodesByType(nodes: NetlistNode[]): NodeGroup[] {
  if (!nodes || !Array.isArray(nodes)) return []; // <-- Linha de segurança adicionada

  const map = new Map<string, NetlistNode[]>();
  for (const node of nodes) {
    const t = node.type ?? "desconhecido";
    if (!map.has(t)) map.set(t, []);
    map.get(t)!.push(node);
  }
  return Array.from(map.entries()).map(([type, groupNodes]) => ({
    type,
    nodes: groupNodes,
    ...categorizeNode(type),
  }));
}

// ── Layout ────────────────────────────────────────────────────────────────

function layoutNodes(nodes: NetlistNode[], colSize = 5) {
  return nodes.map((n, i) => ({
    ...n,
    x: Math.floor(i / colSize) * (NODE_W + COL_GAP) + 20,
    y: (i % colSize) * (NODE_H + ROW_GAP) + 20,
  }));
}

// ── Componente ────────────────────────────────────────────────────────────

export function NetlistGraph() {
  const { netlist, appState } = useSession();
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());

  const groups = useMemo(
    () => (netlist ? groupNodesByType(netlist.nodes) : []),
    [netlist],
  );

  const allTypes = useMemo(() => groups.map((g) => g.type), [groups]);

  function toggleType(type: string) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const filteredNodes = useMemo(() => {
    if (!netlist || !netlist.nodes) return []; // <-- Agora também verifica os nodes
    return netlist.nodes.filter((n) => {
      const matchSearch =
        !search ||
        n.id.toLowerCase().includes(search.toLowerCase()) ||
        (n.type ?? "").toLowerCase().includes(search.toLowerCase());
      const matchType =
        activeTypes.size === 0 || activeTypes.has(n.type ?? "desconhecido");
      return matchSearch && matchType;
    });
  }, [netlist, search, activeTypes]);

  const laidOut = useMemo(() => layoutNodes(filteredNodes), [filteredNodes]);
  const nodeMap = useMemo(
    () => Object.fromEntries(laidOut.map((n) => [n.id, n])),
    [laidOut],
  );

  const svgW = laidOut.length
    ? Math.max(...laidOut.map((n) => n.x + NODE_W)) + 40
    : 400;
  const svgH = laidOut.length
    ? Math.max(...laidOut.map((n) => n.y + NODE_H)) + 40
    : 200;

  // ── Vazio ────────────────────────────────────────────────────────────────
  console.log("DEBUG NETLIST:", {
    netlist,
    quantidadeDeNos: netlist?.nodes?.length,
    quantidadeDeArestas: netlist?.edges?.length,
    primeiroNo: netlist?.nodes?.[0],
    primeiraAresta: netlist?.edges?.[0],
  });

  if (!netlist) {
    return (
      <div className="empty-state">
        <span className="empty-icon" aria-hidden="true">
          ⬡
        </span>
        <p>Execute a síntese para visualizar o netlist</p>
        <p className="empty-hint">
          {appState === "uploaded"
            ? 'Clique em "Sintetizar" no painel esquerdo'
            : "Envie o projeto primeiro"}
        </p>
      </div>
    );
  }

  return (
    <div className="netlist-graph">
      {/* Controles */}
      <div className="netlist-controls">
        <input
          className="netlist-search"
          type="search"
          placeholder="Buscar nó por nome ou tipo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar nó no netlist"
        />

        <span className="netlist-count">
          {filteredNodes.length}/{netlist.nodes?.length || 0} nós
        </span>
      </div>

      {/* Filtros por tipo */}
      <div className="netlist-type-filters">
        {allTypes.map((type) => {
          const { borderColor } = categorizeNode(type);
          const active = activeTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className="netlist-type-btn"
              style={{
                border: `1px solid ${active ? borderColor : "var(--border-subtle)"}`,
                background: active ? `${borderColor}22` : "var(--bg-secondary)",
                color: active ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              {type}
            </button>
          );
        })}
        {activeTypes.size > 0 && (
          <button
            onClick={() => setActiveTypes(new Set())}
            className="netlist-clear-filters-btn"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* SVG do grafo */}
      <div className="netlist-svg-container">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          width={Math.max(svgW, 600)}
          className="netlist-svg"
          aria-label="Grafo do netlist sintetizado"
          role="img"
        >
          <defs>
            <marker
              id="arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path
                d="M0,0 L0,6 L8,3 z"
                fill="var(--signal-active)"
                opacity="0.6"
              />
            </marker>
          </defs>

          {/* Arestas */}
          {/* Arestas */}
          {(netlist.edges || []).map((e, i) => {
            // <-- Array de fallback "|| []" adicionado
            const from = nodeMap[e.from];
            const to = nodeMap[e.to];
            if (!from || !to) return null;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                className="netlist-wire"
                markerEnd="url(#arrow)"
              >
                <title>{e.net}</title>
              </path>
            );
          })}

          {/* Nós */}
          {laidOut.map((n) => {
            const { color, borderColor } = categorizeNode(n.type ?? "");
            return (
              <g
                key={n.id}
                className="netlist-node"
                transform={`translate(${n.x},${n.y})`}
                role="img"
                aria-label={`Nó ${n.id} tipo ${n.type}`}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={5}
                  fill={color}
                  stroke={borderColor}
                  strokeWidth={1.5}
                  className="netlist-node-rect"
                />
                <text
                  x={NODE_W / 2}
                  y={NODE_H / 2 - 6}
                  textAnchor="middle"
                  className="netlist-node-id"
                >
                  {n.id.length > 16 ? n.id.slice(0, 16) + "…" : n.id}
                </text>
                <text
                  x={NODE_W / 2}
                  y={NODE_H / 2 + 9}
                  textAnchor="middle"
                  className="netlist-node-type"
                >
                  {n.type ?? "desconhecido"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Resumo dos grupos */}
      <div className="netlist-groups-summary">
        {groups.map((g) => (
          <div key={g.type} className="netlist-group-item">
            <span
              className="netlist-group-color-box"
              style={{
                background: g.color,
                border: `1px solid ${g.borderColor}`,
              }}
            />
            {g.type} ({g.nodes.length})
          </div>
        ))}
      </div>
    </div>
  );
}
