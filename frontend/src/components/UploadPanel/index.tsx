import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { useSession } from "../../context/SessionContext";
import "./style.css";

// ── Tipos ─────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "loading" | "done" | "error";

interface Step {
  id: number;
  title: string;
  desc: string | null;
  status: StepStatus;
}

// ── Ícone de step ──────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "loading")
    return <span className="spinner" aria-label="Carregando" />;
  if (status === "done")
    return (
      <span className="step-check">✓</span>
    );
  if (status === "error")
    return (
      <span className="step-x">
        ✕
      </span>
    );
  return (
    <span className="step-bullet" />
  );
}

// ── Componente ────────────────────────────────────────────────────────────

export function UploadPanel() {
  const {
    upload,
    doSynthesize,
    doSimulate,
    doDelete,
    doClean,
    appState,
    projectId,
    netlist,
    cycles,
  } = useSession();

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sessionExpanded, setSessionExpanded] = useState(false);

  const busy =
    appState === "uploading" ||
    appState === "synthesizing" ||
    appState === "simulating";

  // ── Cópia do project_id ───────────────────────────────────────────────────
  async function copyId() {
    if (!projectId) return;
    await navigator.clipboard.writeText(projectId);
  }

  // ── Arquivo ───────────────────────────────────────────────────────────────
  function pickFile(f: File) {
    if (!f.name.endsWith(".zip")) return;
    setFile(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
  }

  // ── Step flow ─────────────────────────────────────────────────────────────
  function getStepStatus(step: 1 | 2 | 3): StepStatus {
    if (step === 1) {
      if (appState === "uploading") return "loading";
      if (projectId) return "done";
      return "pending";
    }
    if (step === 2) {
      if (appState === "synthesizing") return "loading";
      if (["synthesized", "simulated"].includes(appState)) return "done";
      return "pending";
    }
    // step 3
    if (appState === "simulating") return "loading";
    if (appState === "simulated") return "done";
    return "pending";
  }

  const steps: Step[] = [
    {
      id: 1,
      title: "1. Upload",
      desc:
        appState !== "idle" && projectId ? (file?.name ?? "projeto.zip") : null,
      status: getStepStatus(1),
    },
    {
      id: 2,
      title: "2. Síntese",
      desc: netlist?.nodes
        ? `${netlist.nodes.length} nós · ${netlist.edges?.length || 0} arestas`
        : null,
      status: getStepStatus(2),
    },
    {
      id: 3,
      title: "3. Simulação",
      desc: cycles?.length ? `${cycles.length} ciclos` : null,
      status: getStepStatus(3),
    },
  ];

  function stepClass(s: StepStatus) {
    if (s === "loading") return "step-item step-item--active";
    if (s === "done") return "step-item step-item--done";
    if (s === "error") return "step-item step-item--error";
    return "step-item";
  }

  function iconClass(s: StepStatus) {
    if (s === "loading") return "step-icon step-icon--active";
    if (s === "done") return "step-icon step-icon--done";
    if (s === "error") return "step-icon step-icon--error";
    return "step-icon";
  }

  return (
    <aside className="sidebar">
      {/* ── Upload Zone ────────────────────────────────────────── */}
      <section className="sidebar-section">
        <p className="sidebar-label">Projeto Verilog</p>
        <div
          className={`upload-zone${dragging ? " dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Área de upload do projeto ZIP"
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            className="upload-input-hidden"
            onChange={onInputChange}
          />
          <span className="upload-icon" aria-hidden="true">
            ⬆
          </span>
          {file ? (
            <p className="upload-filename">{file.name}</p>
          ) : (
            <>
              <p className="upload-text">
                Arraste o .zip ou clique para selecionar
              </p>
              <p className="upload-ext">.zip · máx 50 MB</p>
            </>
          )}
        </div>

        <button
          className="btn-primary"
          disabled={!file || busy || !!projectId}
          onClick={() => file && upload(file)}
        >
          {appState === "uploading" ? (
            <>
              <span className="spinner btn-spinner-icon" /> Enviando…
            </>
          ) : (
            "Enviar Projeto"
          )}
        </button>
      </section>

      {/* ── Fluxo de Etapas ────────────────────────────────────── */}
      <section className="sidebar-section">
        <p className="sidebar-label">Progresso</p>
        <div className="step-flow">
          {steps.map((step) => (
            <div key={step.id} className={stepClass(step.status)}>
              <div className={iconClass(step.status)}>
                <StepIcon status={step.status} />
              </div>
              <div className="step-body">
                <p className="step-title">{step.title}</p>
                {step.desc && <p className="step-desc">{step.desc}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Ações ──────────────────────────────────────────────── */}
      {projectId && (
        <section className="sidebar-section">
          <p className="sidebar-label">Ações</p>
          <button
            className="btn-primary"
            disabled={
              busy ||
              !["uploaded", "synthesized", "simulated"].includes(appState)
            }
            onClick={doSynthesize}
          >
            {appState === "synthesizing" ? (
              <>
                <span className="spinner btn-spinner-icon" />{" "}
                Executando Yosys…
              </>
            ) : (
              "⬡ Sintetizar"
            )}
          </button>

          <button
            className="btn-primary btn-secondary"
            disabled={busy || !["synthesized", "simulated"].includes(appState)}
            onClick={doSimulate}
          >
            {appState === "simulating" ? (
              <>
                <span className="spinner btn-spinner-icon" />{" "}
                Executando Icarus…
              </>
            ) : (
              "▶ Simular Execução"
            )}
          </button>
        </section>
      )}

      {/* ── Informações da Sessão ──────────────────────────────── */}
      {projectId && (
        <section className="sidebar-section">
          <button
            className="session-expand-btn"
            onClick={() => setSessionExpanded((p) => !p)}
            aria-expanded={sessionExpanded}
          >
            <p className="sidebar-label" style={{ flex: 1 }}>
              Sessão
            </p>
            <span className="session-chevron">
              {sessionExpanded ? "▲" : "▼"}
            </span>
          </button>

          {sessionExpanded && (
            <>
              <div
                className="project-badge"
                onClick={copyId}
                title="Clique para copiar"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && copyId()}
                aria-label="Copiar project_id"
              >
                <span className="badge-label">project_id</span>
                <code>{projectId}</code>
              </div>

              {!confirmDelete ? (
                <button
                  className="btn btn-danger session-delete-btn"
                  onClick={() => setConfirmDelete(true)}
                >
                  Excluir sessão
                </button>
              ) : (
                <div className="session-confirm-container">
                  <button
                    className="btn btn-danger session-confirm-btn"
                    onClick={() => {
                      doDelete();
                      setConfirmDelete(false);
                    }}
                  >
                    Confirmar
                  </button>
                  <button
                    className="btn btn-secondary session-cancel-btn"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancelar
                  </button>
                </div>
              )}

              <button
                onClick={doClean}
                className="session-clean-btn"
              >
                Limpar sessões antigas
              </button>
            </>
          )}
        </section>
      )}

      {/* ── Legenda ────────────────────────────────────────────── */}
      <div className="sidebar-legend">
        <p className="legend-title">Legenda</p>
        <div className="legend-list">
          <div className="legend-row">
            <span className="legend-swatch legend-stage--if" />
            Estágio IF
          </div>
          <div className="legend-row">
            <span className="legend-swatch legend-stage--id" />
            Estágio ID
          </div>
          <div className="legend-row">
            <span className="legend-swatch legend-stage--ex" />
            Estágio EX
          </div>
          <div className="legend-row">
            <span className="legend-swatch legend-stage--mem" />
            Estágio MEM
          </div>
          <div className="legend-row">
            <span className="legend-swatch legend-stage--wb" />
            Estágio WB
          </div>
          <div className="legend-row">
            <span className="legend-line legend-signal-active" />
            Wire com dado
          </div>
          <div className="legend-row">
            <span className="legend-dashed legend-signal-forwarding" />
            Forwarding
          </div>
          <div className="legend-row">
            <span className="legend-swatch legend-signal-stall" />
            Bolha (stall)
          </div>
          <div className="legend-row">
            <span className="legend-swatch legend-signal-flush" />
            Flush
          </div>
        </div>
      </div>
    </aside>
  );
}
