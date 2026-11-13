import { useEffect, useReducer, useRef, useState, type DragEvent } from 'react'
import { useApi } from '../../api/context'
import { isAbortError, toUserMessage } from '../../api/errors'
import { useStepNavigation } from '../../app/useStepNavigation'
import { motion } from 'motion/react'
import { GlyphSourceFile, GlyphTestbenchFile, IconArrowRight, IconSwap, IconUpload } from '../../components/icons'
import {
  Bit,
  ClosingArt,
  StepCode,
  StepCircuit,
  StepGates,
  StepSignals,
  UploadArt,
} from '../../components/illustrations'
import { LiveDemo } from '../../components/LiveDemo'
import { MAX_UPLOAD_BYTES } from '../../config'
import { formatBytes } from '../../lib/format'
import { useSession } from '../../state/hooks'
import type { ProjectFile } from '../../state/session'
import { useEndSession } from '../session/useEndSession'
import { setProjectZip } from '../editor/zip'
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

const initialUpload: UploadState = {
  phase: 'IDLE',
  file: null,
  preview: null,
  error: null,
  notice: null,
}

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

  // Momento da página de entrada (word-highlight, sorteado pela taste skill): a
  // declaração acende palavra por palavra conforme a rolagem.
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return
    const el = document.querySelector<HTMLElement>('[data-moment="word-highlight"]')
    if (!el) return
    const w = window as unknown as {
      __momentsManual?: boolean
      __mountMoment?: (el: HTMLElement) => unknown
    }
    if (w.__mountMoment) {
      w.__mountMoment(el)
      return
    }
    if (document.getElementById('moments-loader')) return
    w.__momentsManual = true
    // O kit de momentos fica em public/: carrega como módulo do HTML, não pelo bundler.
    const script = document.createElement('script')
    script.type = 'module'
    script.id = 'moments-loader'
    script.textContent = `import { mount } from '${import.meta.env.BASE_URL}assets/moments/moments.js'; window.__mountMoment = mount; const el = document.querySelector('[data-moment="word-highlight"]'); if (el) mount(el);`
    document.body.appendChild(script)
  }, [])

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
      const response = await api.uploadProject(file, {
        signal: controller.signal,
        timeoutMs: 60_000,
      })
      setProjectZip(file)
      dispatch({
        type: 'SESSION_CREATED',
        session: {
          projectId: response.project_id,
          sessionToken: response.session_token,
          fileName: file.name,
        },
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

  const statusLine = (
    <p role="status" className="upload-status" data-phase={uploaded ? 'UPLOADED' : upload.phase}>
      <span
        className={`led ${uploaded ? 'led--ok' : busy ? 'led--run' : upload.phase === 'ERROR' ? 'led--err' : hasValidFile ? 'led--ok' : ''}`}
        aria-hidden="true"
      />
      {status}
    </p>
  )

  const dropzone = !uploaded && !upload.file && (
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
      <span className="uz__art" aria-hidden="true">
        <UploadArt />
      </span>
      <span className="uz__title">{dragging ? 'Pode soltar o arquivo' : 'Arraste um arquivo .zip aqui'}</span>
      <span id="upload-hint" className="uz__hint">
        ou <b>clique para escolher</b> · somente .zip até {formatBytes(MAX_UPLOAD_BYTES)}
      </span>
    </button>
  )

  return (
    <>
      <main id="main" tabIndex={-1} className="landing">
        <section className="section hero" id="top" aria-labelledby="hero-title" data-enter>
          <div className="wrap hero__grid">
            <div className="hero-text">
              {statusLine}
              <div className="hero__head">
                <h1 id="hero-title" tabIndex={-1} className="hero__title">
                  Novo Projeto
                </h1>
                <Bit pose={uploaded ? 'comemorando' : upload.error ? 'confuso' : 'acenando'} className="hero__bit" />
              </div>
              <p className="hero__lead">
                Envie um .zip com seus módulos Verilog e o testbench. O Yosys monta o circuito, o Icarus roda a
                simulação e você vê cada sinal mudar.
              </p>
              <label htmlFor="upload-zip-input" className="sr-only">
                Arquivo .zip do projeto
              </label>
              {dropzone}

              {upload.error && (
                <div role="alert" className="state-error">
                  {upload.error}
                </div>
              )}
              {uploading && (
                <div className="pb pb--indeterminate" role="progressbar" aria-label="Enviando projeto">
                  <div className="fl" />
                </div>
              )}

              {uploaded && session.session ? (
                <>
                  <div className="btn-row">
                    <button type="button" className="btn bp" onClick={() => nav.goTo(2)} disabled={ending}>
                      Criar Sessão e Continuar
                      <IconArrowRight size={16} />
                    </button>
                    <button type="button" className="btn bd" onClick={() => void endSession()} disabled={ending}>
                      {ending ? 'Descartando…' : 'Descartar sessão'}
                    </button>
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
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn bp"
                      onClick={() => void submit()}
                      disabled={!hasValidFile || uploading}
                    >
                      <IconUpload size={16} />
                      {uploading
                        ? 'Enviando…'
                        : upload.phase === 'ERROR' && hasValidFile
                          ? 'Tentar novamente'
                          : 'Enviar projeto'}
                    </button>
                    {uploading ? (
                      <button type="button" className="btn bs" onClick={() => abortRef.current?.abort()}>
                        Cancelar envio
                      </button>
                    ) : (
                      <button type="button" className="btn bs" onClick={openPicker} disabled={busy}>
                        <IconSwap size={16} />
                        {hasValidFile ? 'Trocar arquivo' : 'Escolher arquivo .zip'}
                      </button>
                    )}
                  </div>
                  {hasValidFile && upload.file && upload.preview && (
                    <FilePreview
                      title={upload.file.name}
                      subtitle={formatBytes(upload.file.size)}
                      files={upload.preview}
                      note="Pré-visualização lida do ZIP no navegador."
                    />
                  )}
                </>
              )}
              <dl className="hero__facts">
                <div>
                  <dt>Síntese</dt>
                  <dd>Yosys</dd>
                </div>
                <div>
                  <dt>Simulação</dt>
                  <dd>Icarus Verilog</dd>
                </div>
                <div>
                  <dt>Projeto</dt>
                  <dd>.zip até {formatBytes(MAX_UPLOAD_BYTES)}</dd>
                </div>
              </dl>
              <input
                id="upload-zip-input"
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
            <div className="hero__picture">
              <LiveDemo />
            </div>
          </div>
        </section>

        <section className="section how" id="como-funciona" aria-labelledby="how-title">
          <div className="wrap">
            <h2 id="how-title" className="section__title">
              Como funciona
            </h2>
            <motion.ol
              className="how__steps"
              initial="off"
              whileInView="on"
              viewport={{ once: true, amount: 0.15 }}
              transition={{ staggerChildren: 0.12 }}
            >
              <motion.li
                className="how__step"
                variants={{
                  off: { opacity: 0, y: 28 },
                  on: { opacity: 1, y: 0 },
                }}
                transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              >
                <span className="how__art" aria-hidden="true">
                  <StepCode />
                </span>
                <b>Envie o projeto</b>
                <p>Um .zip com os módulos e o testbench. A lista de arquivos aparece antes do envio.</p>
              </motion.li>
              <motion.li
                className="how__step"
                variants={{
                  off: { opacity: 0, y: 28 },
                  on: { opacity: 1, y: 0 },
                }}
                transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              >
                <span className="how__art" aria-hidden="true">
                  <StepGates />
                </span>
                <b>Sintetize</b>
                <p>O Yosys converte o código em portas e fios. Você escolhe os sinais que quer acompanhar.</p>
              </motion.li>
              <motion.li
                className="how__step"
                variants={{
                  off: { opacity: 0, y: 28 },
                  on: { opacity: 1, y: 0 },
                }}
                transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              >
                <span className="how__art" aria-hidden="true">
                  <StepCircuit />
                </span>
                <b>Veja o circuito</b>
                <p>
                  O caminho de dados aparece com os símbolos do livro, com zoom, busca e a explicação de cada bloco.
                </p>
              </motion.li>
              <motion.li
                className="how__step"
                variants={{
                  off: { opacity: 0, y: 28 },
                  on: { opacity: 1, y: 0 },
                }}
                transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              >
                <span className="how__art" aria-hidden="true">
                  <StepSignals />
                </span>
                <b>Simule</b>
                <p>O Icarus roda o testbench. Os valores acendem nos fios e viram formas de onda.</p>
              </motion.li>
            </motion.ol>
            <div className="how__zip">
              <div>
                <b className="how__zip-title">O que vai no .zip</b>
                <p>
                  Os módulos do projeto e um testbench que grave as ondas com <code>$dumpfile</code> e{' '}
                  <code>$dumpvars</code>. O testbench é o arquivo com nome começando em <code>tb_</code> ou com{' '}
                  <code>testbench</code> no caminho.
                </p>
              </div>
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
            </div>
          </div>
        </section>

        <section className="section statement" id="ideia" data-moment="word-highlight" aria-label="A ideia">
          <div className="wrap">
            <p className="mo-wh__text">
              Simular hardware não precisa ser decifrar ondas. Aqui você escreve o Verilog, vê o circuito que ele vira e
              acompanha <strong>cada sinal mudando</strong> no próprio desenho, passo a passo, no navegador.
            </p>
          </div>
        </section>
      </main>

      <footer className="closing" aria-labelledby="close-title">
        <div className="wrap">
          <div className="closing__close">
            <h2 id="close-title" className="section__title">
              Ligue o seu circuito
            </h2>
            <p className="hero__lead">Escolha o .zip do projeto e siga as quatro etapas até a simulação.</p>
            <div className="closing__art" aria-hidden="true">
              <ClosingArt />
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn bp"
                onClick={() => {
                  window.scrollTo({ top: 0 })
                  openPicker()
                }}
                disabled={busy || uploaded}
              >
                <IconUpload size={16} />
                Escolher o arquivo
              </button>
            </div>
          </div>
          <div className="closing__links">
            <nav aria-label="Ferramentas">
              <a className="link" href="https://github.com/SoaresDavidson/Verilog-simulator">
                Código no GitHub
              </a>
              <a className="link" href="https://yosyshq.net/yosys/">
                Yosys
              </a>
              <a className="link" href="https://steveicarus.github.io/iverilog/">
                Icarus Verilog
              </a>
            </nav>
            <p className="muted">Verilog Classroom. Síntese com Yosys e simulação com Icarus Verilog.</p>
          </div>
        </div>
      </footer>
    </>
  )
}
