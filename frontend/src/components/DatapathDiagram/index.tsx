import { useState, useCallback } from 'react';
import type { LogCiclo } from '../../../types';
import {
  RISCV_STAGES,
  PIPELINE_REGISTERS,
  MAIN_WIRES,
} from './riscv-stages';
import {
  mapCycleToHighlights,
  getStageClass,
  getWireClass,
  getPipelineRegClass,
} from './cycle-mapper';
import { getTooltip } from './tooltips';
import type { TooltipData } from './tooltips';

// ── Tipos internos ─────────────────────────────────────────────────────────

interface TooltipState {
  data: TooltipData;
  x: number;
  y: number;
}

interface Props {
  cycle: LogCiclo | null;
}

// ── Constantes de layout ───────────────────────────────────────────────────

const SVG_W = 1080;
const SVG_H = 340;
const REG_W = 16;

// ── Componente ────────────────────────────────────────────────────────────

export function DatapathDiagram({ cycle }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const highlights = cycle ? mapCycleToHighlights(cycle) : null;

  const showTooltip = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (!cycle) return;
      const data = getTooltip(id, cycle);
      if (!data) return;
      setTooltip({ data, x: e.clientX + 14, y: e.clientY - 10 });
    },
    [cycle],
  );

  const hideTooltip = useCallback(() => setTooltip(null), []);

  const moveTooltip = useCallback((e: React.MouseEvent) => {
    setTooltip((prev) =>
      prev ? { ...prev, x: e.clientX + 14, y: e.clientY - 10 } : null,
    );
  }, []);

  // ── Sem ciclo ainda ───────────────────────────────────────────────────────

  if (!cycle) {
    return (
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          padding: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '8px',
          color: 'var(--text-muted)',
          minHeight: '200px',
        }}
      >
        <span style={{ fontSize: '2rem', opacity: 0.4 }}>⬡</span>
        <p style={{ fontSize: '0.85rem' }}>
          Execute a simulação para ativar o diagrama
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Título */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        <span
          style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
          }}
        >
          Caminho de Dados — RISC-V 5 Estágios
        </span>
        {cycle.bolha === '1' && (
          <span
            style={{
              fontSize: '0.625rem',
              background: 'rgba(245,158,11,0.12)',
              color: 'var(--signal-bubble)',
              border: '1px solid var(--signal-bubble)',
              borderRadius: '4px',
              padding: '2px 6px',
              fontWeight: 600,
            }}
          >
            BOLHA
          </span>
        )}
        {cycle.flush === '1' && (
          <span
            style={{
              fontSize: '0.625rem',
              background: 'rgba(239,68,68,0.1)',
              color: 'var(--signal-flush)',
              border: '1px solid var(--signal-flush)',
              borderRadius: '4px',
              padding: '2px 6px',
              fontWeight: 600,
            }}
          >
            FLUSH
          </span>
        )}
      </div>

      {/* SVG Principal */}
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          style={{ display: 'block', minWidth: '700px' }}
          aria-label="Diagrama do caminho de dados RISC-V"
          role="img"
          onMouseMove={moveTooltip}
        >
          <defs>
            <marker
              id="arrow-active"
              markerWidth="7"
              markerHeight="7"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L7,3 z" fill="var(--signal-active)" />
            </marker>
            <marker
              id="arrow-inactive"
              markerWidth="7"
              markerHeight="7"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L7,3 z" fill="var(--border-subtle)" />
            </marker>
            <marker
              id="arrow-wb"
              markerWidth="7"
              markerHeight="7"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L7,3 z" fill="var(--stage-wb-border)" />
            </marker>
          </defs>

          {/* ── Wires ────────────────────────────────────────────────── */}
          {MAIN_WIRES.map((wire) => {
            const wh = highlights?.wires[wire.id];
            const cls = wh ? getWireClass(wh) : 'wire--inactive';
            const isActive = wh?.active ?? false;
            const arrowId = wire.color
              ? 'arrow-wb'
              : isActive
              ? 'arrow-active'
              : 'arrow-inactive';

            let d: string;
            if (wire.curved) {
              const mx = (wire.from.x + wire.to.x) / 2;
              const cy1 = wire.from.y;
              const cy2 = wire.to.y - 20;
              d = `M${wire.from.x},${wire.from.y} C${mx},${cy1} ${mx},${cy2} ${wire.to.x},${wire.to.y}`;
            } else {
              d = `M${wire.from.x},${wire.from.y} L${wire.to.x},${wire.to.y}`;
            }

            return (
              <g key={wire.id}>
                <path
                  d={d}
                  className={cls}
                  fill="none"
                  stroke={
                    wire.color ||
                    (isActive ? 'var(--signal-active)' : 'var(--border-subtle)')
                  }
                  strokeWidth={wire.dashed ? 1.5 : 2}
                  strokeDasharray={wire.dashed ? '5 4' : undefined}
                  opacity={wire.dashed && !isActive ? 0.3 : 1}
                  markerEnd={`url(#${arrowId})`}
                  onMouseEnter={(e) => showTooltip(e, wire.id)}
                  onMouseLeave={hideTooltip}
                  style={{ cursor: 'default' }}
                />
                {wire.label && isActive && (
                  <text
                    x={(wire.from.x + wire.to.x) / 2}
                    y={
                      wire.curved
                        ? Math.min(wire.from.y, wire.to.y) - 6
                        : wire.from.y - 6
                    }
                    textAnchor="middle"
                    style={{
                      fontSize: '9px',
                      fontFamily: 'var(--font-mono)',
                      fill: 'var(--text-muted)',
                    }}
                  >
                    {wire.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── Registradores de Pipeline ─────────────────────────── */}
          {PIPELINE_REGISTERS.map((reg) => {
            const rh = highlights?.pipelineRegs[reg.id];
            const cls = rh ? getPipelineRegClass(rh) : 'pipeline-reg';
            const fillColor = rh?.flushed
              ? 'rgba(239,68,68,0.18)'
              : rh?.stalled
              ? 'rgba(245,158,11,0.18)'
              : rh?.active
              ? 'rgba(37,99,235,0.08)'
              : 'var(--bg-tertiary)';
            const strokeColor = rh?.flushed
              ? 'var(--signal-flush)'
              : rh?.stalled
              ? 'var(--signal-bubble)'
              : rh?.active
              ? 'var(--signal-active)'
              : 'var(--border-default)';

            return (
              <g
                key={reg.id}
                className={cls}
                onMouseEnter={(e) => showTooltip(e, reg.id)}
                onMouseLeave={hideTooltip}
                style={{ cursor: 'default' }}
                role="img"
                aria-label={`Registrador de pipeline ${reg.label}`}
              >
                <rect
                  x={reg.x}
                  y={reg.y}
                  width={REG_W}
                  height={reg.height}
                  rx={3}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={1.5}
                />
                <text
                  x={reg.x + REG_W / 2}
                  y={reg.y + reg.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(-90, ${reg.x + REG_W / 2}, ${reg.y + reg.height / 2})`}
                  style={{
                    fontSize: '8px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    fill: strokeColor,
                  }}
                >
                  {reg.label}
                </text>
              </g>
            );
          })}

          {/* ── Estágios ─────────────────────────────────────────────── */}
          {RISCV_STAGES.map((stage) => {
            const sh = highlights?.stages[stage.id];
            const cls = sh ? getStageClass(sh) : 'datapath-stage';
            const bgColor = sh?.anomaly === 'bubble'
              ? 'rgba(245,158,11,0.12)'
              : sh?.anomaly === 'flush'
              ? 'rgba(239,68,68,0.12)'
              : stage.color;
            const strokeColor = sh?.anomaly === 'bubble'
              ? 'var(--signal-bubble)'
              : sh?.anomaly === 'flush'
              ? 'var(--signal-flush)'
              : sh?.active
              ? stage.borderColor
              : 'var(--border-default)';
            const strokeW =
              sh?.intensity === 'high' ? 2.5 :
              sh?.intensity === 'medium' ? 2 : 1.5;

            return (
              <g
                key={stage.id}
                className={cls}
                onMouseEnter={(e) => showTooltip(e, stage.id)}
                onMouseLeave={hideTooltip}
                role="img"
                aria-label={`Estágio ${stage.description}`}
                tabIndex={0}
              >
                {/* Retângulo principal do estágio */}
                <rect
                  x={stage.x}
                  y={stage.y}
                  width={stage.width}
                  height={stage.height}
                  rx={8}
                  fill={bgColor}
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                />

                {/* Label do estágio */}
                <text
                  x={stage.x + stage.width / 2}
                  y={stage.y + 20}
                  textAnchor="middle"
                  style={{
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fill: strokeColor,
                  }}
                >
                  {stage.label}
                </text>

                {/* Descrição */}
                <text
                  x={stage.x + stage.width / 2}
                  y={stage.y + 35}
                  textAnchor="middle"
                  style={{
                    fontSize: '8px',
                    fontFamily: 'var(--font-sans)',
                    fill: 'var(--text-muted)',
                  }}
                >
                  {stage.description}
                </text>

                {/* Subcomponentes */}
                {stage.subcomponents.map((sub) => {
                  const isSubActive = sh?.active ?? false;
                  return (
                    <g
                      key={sub.id}
                      onMouseEnter={(e) => {
                        e.stopPropagation();
                        showTooltip(e, sub.id);
                      }}
                      onMouseLeave={hideTooltip}
                      style={{ cursor: 'default' }}
                      role="img"
                      aria-label={sub.label}
                    >
                      <rect
                        x={sub.x}
                        y={sub.y}
                        width={sub.width}
                        height={sub.height}
                        rx={4}
                        fill={isSubActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)'}
                        stroke={isSubActive ? strokeColor : 'var(--border-subtle)'}
                        strokeWidth={isSubActive ? 1.5 : 1}
                      />
                      <text
                        x={sub.x + sub.width / 2}
                        y={sub.y + sub.height / 2 + 1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: isSubActive ? 600 : 400,
                          fill: isSubActive
                            ? 'var(--text-primary)'
                            : 'var(--text-muted)',
                        }}
                      >
                        {sub.label}
                      </text>
                    </g>
                  );
                })}

                {/* Label de estado (PC / instrução / resultado ULA) */}
                {sh?.label && (
                  <text
                    x={stage.x + stage.width / 2}
                    y={stage.y + stage.height - 10}
                    textAnchor="middle"
                    style={{
                      fontSize: '8px',
                      fontFamily: 'var(--font-mono)',
                      fill: strokeColor,
                      fontWeight: 600,
                    }}
                  >
                    {sh.label.length > 20
                      ? sh.label.slice(0, 20) + '…'
                      : sh.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Tooltip ──────────────────────────────────────────────── */}
      {tooltip && (
        <div
          className="datapath-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="datapath-tooltip__title">{tooltip.data.title}</div>
          {tooltip.data.value && (
            <div className="datapath-tooltip__value">{tooltip.data.value}</div>
          )}
          <div className="datapath-tooltip__explanation">
            {tooltip.data.explanation}
          </div>
          {tooltip.data.anomaly && (
            <div className="datapath-tooltip__anomaly">
              {tooltip.data.anomaly}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
