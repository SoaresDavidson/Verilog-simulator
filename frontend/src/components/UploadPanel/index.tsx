import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { useSession } from "../../context/SessionContext";

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
      <span style={{ color: "var(--signal-ok)", fontSize: "0.875rem" }}>✓</span>
    );
  if (status === "error")
    return (
      <span style={{ color: "var(--signal-flush)", fontSize: "0.875rem" }}>
        ✕
      </span>
    );
  return (
    <span
      style={{
        fontSize: "0.6875rem",
        fontFamily: "var(--font-mono)",
        color: "var(--text-muted)",
      }}
    />
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
            style={{ display: "none" }}
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
              <span className="spinner" style={{ marginRight: 6 }} /> Enviando…
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
                <span className="spinner" style={{ marginRight: 6 }} />{" "}
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
                <span className="spinner" style={{ marginRight: 6 }} />{" "}
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
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              width: "100%",
            }}
            onClick={() => setSessionExpanded((p) => !p)}
            aria-expanded={sessionExpanded}
          >
            <p className="sidebar-label" style={{ flex: 1, margin: 0 }}>
              Sessão
            </p>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
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
                  className="btn btn-danger"
                  onClick={() => setConfirmDelete(true)}
                  style={{ width: "100%", fontSize: "0.75rem" }}
                >
                  Excluir sessão
                </button>
              ) : (
                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                  }}
                >
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      doDelete();
                      setConfirmDelete(false);
                    }}
                    style={{ flex: 1, fontSize: "0.6875rem" }}
                  >
                    Confirmar
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setConfirmDelete(false)}
                    style={{
                      flex: 1,
                      fontSize: "0.6875rem",
                      background: "var(--bg-primary)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-md)",
                      cursor: "pointer",
                      padding: "6px",
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              )}

              <button
                onClick={doClean}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  padding: "2px 0",
                  textAlign: "left",
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                }}
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
            <span
              className="legend-swatch"
              style={{
                background: "var(--stage-if)",
                border: "1px solid var(--stage-if-border)",
              }}
            />
            Estágio IF
          </div>
          <div className="legend-row">
            <span
              className="legend-swatch"
              style={{
                background: "var(--stage-id)",
                border: "1px solid var(--stage-id-border)",
              }}
            />
            Estágio ID
          </div>
          <div className="legend-row">
            <span
              className="legend-swatch"
              style={{
                background: "var(--stage-ex)",
                border: "1px solid var(--stage-ex-border)",
              }}
            />
            Estágio EX
          </div>
          <div className="legend-row">
            <span
              className="legend-swatch"
              style={{
                background: "var(--stage-mem)",
                border: "1px solid var(--stage-mem-border)",
              }}
            />
            Estágio MEM
          </div>
          <div className="legend-row">
            <span
              className="legend-swatch"
              style={{
                background: "var(--stage-wb)",
                border: "1px solid var(--stage-wb-border)",
              }}
            />
            Estágio WB
          </div>
          <div className="legend-row">
            <span
              className="legend-line"
              style={{ background: "var(--signal-active)" }}
            />
            Wire com dado
          </div>
          <div className="legend-row">
            <span
              className="legend-dashed"
              style={{ borderColor: "var(--signal-active)" }}
            />
            Forwarding
          </div>
          <div className="legend-row">
            <span
              className="legend-swatch"
              style={{
                background: "rgba(245,158,11,0.2)",
                border: "1px solid var(--signal-bubble)",
              }}
            />
            Bolha (stall)
          </div>
          <div className="legend-row">
            <span
              className="legend-swatch"
              style={{
                background: "rgba(239,68,68,0.2)",
                border: "1px solid var(--signal-flush)",
              }}
            />
            Flush
          </div>
        </div>
      </div>
    </aside>
  );
}
