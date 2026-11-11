import { useEffect, useReducer, useRef, useState, type DragEvent } from 'react'
import { useApi } from '../../api/context'
import { isAbortError, toUserMessage } from '../../api/errors'
import { useStepNavigation } from '../../app/useStepNavigation'
import { BreadboardArt } from '../../components/art'
import { GlyphSourceFile, GlyphTestbenchFile, IconArrowRight, IconSwap, IconUpload } from '../../components/icons'
import { ActionBar, Screen } from '../../components/Screen'
import { MAX_UPLOAD_BYTES } from '../../config'
import { formatBytes } from '../../lib/format'
import { useSession } from '../../state/hooks'
import type { ProjectFile } from '../../state/session'
import { useEndSession } from '../session/useEndSession'
import { FilePreview } from './FilePreview'
import { validateProjectZip } from './validateProjectZip'

/** Fase local do upload; `UPLOADED` é derivado de haver sessão no estado global. */
type Phase = 'IDLE' | 'VALIDATING' | 'UPLOADING' | 'ERROR'

interface UploadState {
  phase: Phase
  file: File | null
  preview: ProjectFile[] | null
  error: string | null
  /** Mensagem informativa (ex.: envio cancelado). */
  notice: string | null
}

type UploadAction =
  | { type: 'VALIDATE'; file: File }
  | { type: 'VALID'; file: File; preview: ProjectFile[] }
  | { type: 'INVALID'; file: File; message: string }
  | { type: 'UPLOAD' }
  | { type: 'UPLOAD_FAILED'; message: string }
  | { type: 'UPLOAD_CANCELLED' }
  | { type: 'RESET' }

const initialUpload: UploadState = { phase: 'IDLE', file: null, preview: null, error: null, notice: null }

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'VALIDATE':
      return { ...initialUpload, phase: 'VALIDATING', file: action.file }
    case 'VALID':
      // Ignora resultado de uma seleção anterior.
      return state.file === action.file ? { ...state, phase: 'IDLE', preview: action.preview } : state
    case 'INVALID':
      return state.file === action.file ? { ...initialUpload, phase: 'ERROR', error: action.message } : state
    case 'UPLOAD':
      return { ...state, phase: 'UPLOADING', error: null, notice: null }
    case 'UPLOAD_FAILED':
      return { ...state, phase: 'ERROR', error: action.message }
    case 'UPLOAD_CANCELLED':
      return { ...state, phase: 'IDLE', notice: 'Envio cancelado.' }
    case 'RESET':
      return initialUpload
  }
}

/** Tela 1 (#s1) — upload do ZIP e criação da sessão (#19, #25). */
export function UploadScreen() {
  const api = useApi()
  const { state: session, dispatch } = useSession()
  const nav = useStepNavigation()
  const { endSession, ending } = useEndSession()
  const [upload, send] = useReducer(uploadReducer, initialUpload)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const uploadingRef = useRef(false)

  const uploaded = session.session !== null
  const uploading = upload.phase === 'UPLOADING'
  const busy = uploading || upload.phase === 'VALIDATING'

  // Cancela envio pendente ao desmontar.
  useEffect(() => () => abortRef.current?.abort(), [])

  // Evita que soltar um arquivo fora da dropzone faça o navegador abri-lo.
  useEffect(() => {
    const prevent = (event: globalThis.DragEvent) => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const selectFile = async (file: File | undefined) => {
    if (!file || busy) return
    send({ type: 'VALIDATE', file })
    const result = await validateProjectZip(file)
    if (result.ok) send({ type: 'VALID', file, preview: result.files })
    else send({ type: 'INVALID', file, message: result.message })
  }

  const openPicker = () => {
    if (!busy) inputRef.current?.click()
  }

  const submit = async () => {
    const { file, preview } = upload
    if (!file || !preview || uploadingRef.current) return
    uploadingRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    send({ type: 'UPLOAD' })
    try {
      const response = await api.uploadProject(file, { signal: controller.signal, timeoutMs: 60_000 })
      dispatch({
        type: 'SESSION_CREATED',
        session: { projectId: response.project_id, sessionToken: response.session_token, fileName: file.name },
        files: { origin: 'client-preview', items: preview },
      })
      send({ type: 'RESET' })
    } catch (error) {
      if (isAbortError(error)) send({ type: 'UPLOAD_CANCELLED' })
      else send({ type: 'UPLOAD_FAILED', message: toUserMessage(error) })
    } finally {
      uploadingRef.current = false
      abortRef.current = null
    }
  }

  const onDragOver = (event: DragEvent) => {
    event.preventDefault()
    if (!busy) setDragging(true)
  }
  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    void selectFile(event.dataTransfer.files[0])
  }

  let status: string
  if (uploaded) status = 'Projeto enviado. Sessão criada.'
  else if (uploading) status = 'Enviando projeto…'
  else if (upload.phase === 'VALIDATING') status = 'Verificando arquivo…'
  else if (upload.phase === 'ERROR') status = 'Falha no envio. Corrija o problema e tente novamente.'
  else if (upload.notice) status = upload.notice
  else if (upload.file && upload.preview) status = `Arquivo pronto para envio: ${upload.file.name}.`
  else status = 'Nenhum arquivo selecionado.'

  const hasValidFile = upload.file !== null && upload.preview !== null

  const chipLabel = upload.file?.name ?? session.session?.fileName ?? 'projeto.zip'
  const seated = uploaded || hasValidFile

  return (
    <Screen
      title="Novo Projeto"
      description="Envie um ZIP com seus módulos Verilog/SystemVerilog e o testbench. Daqui até a simulação são quatro etapas."
    >
      <div className="up">
        <div className="up__main">
          <p role="status" className="upload-status" data-phase={uploaded ? 'UPLOADED' : upload.phase}>
            <span
              className={`led ${uploaded ? 'led--ok' : busy ? 'led--run' : upload.phase === 'ERROR' ? 'led--err' : hasValidFile ? 'led--ok' : ''}`}
              aria-hidden="true"
            />
            {status}
          </p>

          {uploaded && session.session ? (
            <>
              <div className="up__seated">
                <BreadboardArt label={chipLabel} seated />
              </div>
              <FilePreview
                title={session.session.fileName}
                files={session.files?.items ?? []}
                note={
                  session.files?.origin === 'client-preview'
                    ? 'Lista lida do ZIP no navegador; a síntese usa os arquivos enviados ao servidor.'
                    : undefined
                }
              />
              <p className="muted upload-session">
                Sessão: <code>{session.session.projectId}</code>
              </p>
            </>
          ) : (
            <>
              {!upload.file ? (
                <button
                  type="button"
                  className={`uz${dragging ? ' dg' : ''}`}
                  onClick={openPicker}
                  onDragOver={onDragOver}
                  onDragEnter={onDragOver}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  disabled={busy}
                  aria-describedby="upload-hint"
                >
                  <span className="uz__art">
                    <BreadboardArt label={dragging ? 'solte aqui' : 'projeto.zip'} />
                  </span>
                  <span className="uz__title">Arraste um arquivo .zip aqui</span>
                  <span id="upload-hint" className="uz__hint">
                    ou <b>clique para escolher</b> · somente .zip até {formatBytes(MAX_UPLOAD_BYTES)}
                  </span>
                </button>
              ) : (
                <div className="up__seated">
                  <BreadboardArt label={chipLabel} seated={seated} />
                </div>
              )}

              {upload.error && (
                <div role="alert" className="state-error">
                  {upload.error}
                </div>
              )}

              {hasValidFile && upload.file && upload.preview && (
                <FilePreview
                  title={upload.file.name}
                  subtitle={formatBytes(upload.file.size)}
                  files={upload.preview}
                  note="Pré-visualização lida do ZIP no navegador."
                />
              )}

              {uploading && (
                <div className="pb pb--indeterminate" role="progressbar" aria-label="Enviando projeto">
                  <div className="fl" />
                </div>
              )}
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="sr-only"
            tabIndex={-1}
            aria-label="Arquivo ZIP do projeto"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              void selectFile(file)
            }}
          />
        </div>

        <aside className="up__guide card" aria-label="Como funciona">
          <h2 className="up__guide-title">Como funciona</h2>
          <ol className="up__steps">
            <li className={uploaded ? 'is-done' : 'is-now'}>
              <span className="up__step-n">1</span>
              <div>
                <b>Envie o projeto</b>
                <p>Um .zip com os módulos e o testbench.</p>
              </div>
            </li>
            <li>
              <span className="up__step-n">2</span>
              <div>
                <b>Sintetize</b>
                <p>O Yosys converte o código em portas e fios. Você escolhe os sinais.</p>
              </div>
            </li>
            <li>
              <span className="up__step-n">3</span>
              <div>
                <b>Veja o circuito</b>
                <p>O caminho de dados aparece desenhado, com zoom e busca.</p>
              </div>
            </li>
            <li>
              <span className="up__step-n">4</span>
              <div>
                <b>Simule</b>
                <p>O Icarus roda o testbench e os valores acendem nos fios.</p>
              </div>
            </li>
          </ol>
          <div className="up__zip">
            <p className="up__zip-title">O que vai no .zip</p>
            <ul className="up__zip-tree">
              <li>
                <GlyphSourceFile size={20} />
                <code>rtl/meu_modulo.v</code>
                <span className="tag tag--source">fonte</span>
              </li>
              <li>
                <GlyphTestbenchFile size={20} />
                <code>tb/tb_meu_modulo.v</code>
                <span className="tag tag--testbench">testbench</span>
              </li>
            </ul>
            <p className="up__zip-note">
              Testbench: nome começando com <code>tb_</code> ou caminho com <code>testbench</code>.
            </p>
          </div>
        </aside>
      </div>

      {uploaded && session.session ? (
        <ActionBar tone="ok" hint="Projeto na bancada. Próximo: sintetizar com o Yosys.">
          <button type="button" className="btn bd" onClick={() => void endSession()} disabled={ending}>
            {ending ? 'Descartando…' : 'Descartar sessão'}
          </button>
          <button type="button" className="btn bp" onClick={() => nav.goTo(2)} disabled={ending}>
            Criar Sessão e Continuar
            <IconArrowRight size={16} />
          </button>
        </ActionBar>
      ) : (
        <ActionBar
          tone={hasValidFile ? 'ok' : 'wait'}
          hint={hasValidFile ? 'Arquivo conferido. Envie para criar a sessão.' : 'Escolha um .zip para começar.'}
        >
          {uploading ? (
            <button type="button" className="btn bs" onClick={() => abortRef.current?.abort()}>
              Cancelar envio
            </button>
          ) : (
            hasValidFile && (
              <button type="button" className="btn bs" onClick={openPicker}>
                <IconSwap size={16} />
                Trocar arquivo
              </button>
            )
          )}
          <button type="button" className="btn bp" onClick={() => void submit()} disabled={!hasValidFile || uploading}>
            <IconUpload size={16} />
            {uploading ? 'Enviando…' : upload.phase === 'ERROR' && hasValidFile ? 'Tentar novamente' : 'Enviar projeto'}
          </button>
        </ActionBar>
      )}
    </Screen>
  )
}
