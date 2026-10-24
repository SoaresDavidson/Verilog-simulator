import { useEffect, useReducer, useRef, useState, type DragEvent } from 'react'
import { useApi } from '../../api/context'
import { isAbortError, toUserMessage } from '../../api/errors'
import { useStepNavigation } from '../../app/useStepNavigation'
import { Screen } from '../../components/Screen'
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

function UploadIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
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

  return (
    <Screen
      title="Novo Projeto"
      description="Faça upload de um arquivo ZIP contendo seus módulos Verilog/SystemVerilog."
      className="scr--center"
    >
      <p role="status" className="upload-status" data-phase={uploaded ? 'UPLOADED' : upload.phase}>
        {status}
      </p>

      {uploaded && session.session ? (
        <>
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
          <div className="scr__actions">
            <button type="button" className="btn bd" onClick={() => void endSession()} disabled={ending}>
              {ending ? 'Descartando…' : 'Descartar sessão'}
            </button>
            <button type="button" className="btn bp" onClick={() => nav.goTo(2)} disabled={ending}>
              Criar Sessão e Continuar
            </button>
          </div>
        </>
      ) : (
        <>
          {!upload.file && (
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
              <UploadIcon />
              <span className="uz__title">Arraste um arquivo .zip aqui</span>
              <span id="upload-hint" className="uz__hint">
                ou clique para selecionar · somente .zip até {formatBytes(MAX_UPLOAD_BYTES)}
              </span>
            </button>
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

          <div className="scr__actions">
            {uploading ? (
              <button type="button" className="btn bs" onClick={() => abortRef.current?.abort()}>
                Cancelar envio
              </button>
            ) : (
              hasValidFile && (
                <button type="button" className="btn bs" onClick={openPicker}>
                  Trocar arquivo
                </button>
              )
            )}
            <button type="button" className="btn bp" onClick={() => void submit()} disabled={!hasValidFile || uploading}>
              {uploading ? 'Enviando…' : upload.phase === 'ERROR' && hasValidFile ? 'Tentar novamente' : 'Enviar projeto'}
            </button>
          </div>
        </>
      )}
    </Screen>
  )
}
