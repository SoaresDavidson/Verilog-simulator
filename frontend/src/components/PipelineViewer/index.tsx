import { useState, useEffect, useCallback } from "react";
import { useSession } from "../../context/SessionContext";
import { CycleInspector } from "../CycleInspector";
import { DatapathDiagram } from "../DatapathDiagram";
import "./style.css";

export function PipelineViewer() {
  const { cycles, currentCycle, setCycle, appState } = useSession();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600); // ms por ciclo

  // ── Auto-play ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setCycle((prev: number) => {
        if (prev >= cycles.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, speed);
    return () => clearInterval(timer);
  }, [playing, speed, cycles.length, setCycle]);

  const prevCycle = useCallback(() => {
    if (currentCycle > 0) setCycle(currentCycle - 1);
  }, [currentCycle, setCycle]);

  const nextCycle = useCallback(() => {
    if (currentCycle < cycles.length - 1) setCycle(currentCycle + 1);
  }, [currentCycle, cycles.length, setCycle]);

  // ── Vazio ─────────────────────────────────────────────────────────────────
  if (!cycles.length) {
    return (
      <div className="empty-state">
        <span className="empty-icon" aria-hidden="true">
          ◫
        </span>
        <p>Nenhuma simulação carregada</p>
        <p className="empty-hint">
          {appState === "synthesized"
            ? "Execute a simulação para visualizar o pipeline"
            : "Envie um projeto e execute a síntese primeiro"}
        </p>
      </div>
    );
  }

  const c = cycles[currentCycle];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="pipeline-viewer">
      {/* Diagrama do caminho de dados */}
      <div className="datapath-container">
        <DatapathDiagram cycle={c} />
      </div>

      {/* Controles */}
      <div className="cycle-controls">
        <button
          className="cycle-nav"
          disabled={currentCycle === 0}
          onClick={prevCycle}
          aria-label="Ciclo anterior"
        >
          ◀ Anterior
        </button>

        <span className="cycle-counter">
          Ciclo <strong>{c.ciclo}</strong>
          <span className="cycle-counter-total">
            {" "}
            / {cycles.length}
          </span>
        </span>

        <button
          className="cycle-nav"
          disabled={currentCycle === cycles.length - 1}
          onClick={nextCycle}
          aria-label="Próximo ciclo"
        >
          Próximo ▶
        </button>

        <button
          className={`play-btn${playing ? " play-btn--playing" : ""}`}
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pausar" : "Reproduzir ciclos"}
        >
          {playing ? "⏸ Pausar" : "▶ Play"}
        </button>

        <label className="speed-control" aria-label="Velocidade de reprodução">
          <span>Vel.</span>
          <input
            type="range"
            min={100}
            max={2000}
            step={100}
            value={2100 - speed}
            onChange={(e) => setSpeed(2100 - Number(e.target.value))}
          />
        </label>
      </div>

      {/* Timeline */}
      <div
        className="cycle-timeline"
        role="listbox"
        aria-label="Navegação por ciclos"
      >
        {cycles.map((cy, i) => {
          let variant = "";
          if (cy.bolha === "1") variant = "cycle-tick--bubble";
          if (cy.flush === "1") variant = "cycle-tick--flush";
          const icon =
            cy.flush === "1" ? "✕" : cy.bolha === "1" ? "⚠" : cy.ciclo;
          return (
            <button
              key={cy.ciclo}
              className={`cycle-tick ${variant}${i === currentCycle ? " cycle-tick--active" : ""}`}
              onClick={() => setCycle(i)}
              title={`Ciclo ${cy.ciclo}${cy.instrucao ? ` — ${cy.instrucao}` : ""}${cy.bolha === "1" ? " [BOLHA]" : ""}${cy.flush === "1" ? " [FLUSH]" : ""}`}
              aria-selected={i === currentCycle}
              role="option"
            >
              {icon}
            </button>
          );
        })}
      </div>

      {/* Legenda da timeline */}
      <div className="timeline-legend">
        <span className="legend-item legend-item--active">Ativo</span>
        <span className="legend-item legend-item--bubble">Bolha (⚠)</span>
        <span className="legend-item legend-item--flush">Flush (✕)</span>
      </div>

      {/* Inspetor de ciclo */}
      <div className="pipeline-bottom">
        <CycleInspector cycle={c} />
      </div>
    </div>
  );
}
