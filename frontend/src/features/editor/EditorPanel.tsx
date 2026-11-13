import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../../api/context'
import { toUserMessage } from '../../api/errors'
import { Bit, type BitPose } from '../../components/illustrations'
import { IconRestart, IconRun } from '../../components/icons'
import { useSession } from '../../state/hooks'
import type { UseSynthesis } from '../synthesis/useSynthesis'
import { classifyFile } from '../upload/validateProjectZip'
import { CodeEditor, type Caret } from './CodeEditor'
import { getProjectZip, readZip, setProjectZip, writeZip, type ZipItem } from './zip'
import './editor.css'

const EDITABLE = /\.(v|sv|vh|svh)$/i

/**
 * Editor de código da etapa 2: abre os arquivos Verilog do ZIP enviado, deixa
 * alterar e reenvia o projeto com as mudanças (nova sessão) antes de sintetizar.
 * Sem o ZIP em memória (página recarregada), não aparece.
 */
export function EditorPanel({ synthesis }: { synthesis: UseSynthesis }) {
  const api = useApi()
  const { state, dispatch } = useSession()
  const projectId = state.session?.projectId ?? null
  const [items, setItems] = useState<ZipItem[] | null>(null)
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [active, setActive] = useState<string | null>(null)
  const [caret, setCaret] = useState<Caret>({ line: 1, col: 1 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const autoSynth = useRef(false)
  const [applyCount, setApplyCount] = useState(0)

  // Carrega os arquivos sempre que a sessão (e portanto o ZIP) muda.
  useEffect(() => {
    const zip = getProjectZip()
    if (!zip || !projectId) return
    let alive = true
    readZip(zip)
      .then((list) => {
        if (!alive) return
        const decoder = new TextDecoder('utf-8')
        const loaded: Record<string, string> = {}
        for (const item of list) if (EDITABLE.test(item.path)) loaded[item.path] = decoder.decode(item.bytes)
        setItems(list)
        setOriginal(loaded)
        setTexts(loaded)
        setActive((current) => (current && current in loaded ? current : (Object.keys(loaded)[0] ?? null)))
      })
      .catch(() => alive && setItems(null))
    return () => {
      alive = false
    }
  }, [projectId])

  // Depois de reenviar, a síntese roda sozinha assim que a nova sessão estiver pronta.
  const { canStart, start } = synthesis
  useEffect(() => {
    if (!autoSynth.current || !canStart) return
    autoSynth.current = false
    // Espera os efeitos da tela registrarem a sessão nova antes de sintetizar.
    const timer = window.setTimeout(() => void start(), 0)
    return () => window.clearTimeout(timer)
  }, [applyCount, canStart, start])

  const paths = useMemo(() => Object.keys(texts), [texts])
  const changed = paths.filter((path) => texts[path] !== original[path])
  const dirty = changed.length > 0

  if (!items || !active || paths.length === 0 || !state.session) return null
  const session = state.session

  const apply = async () => {
    if (!dirty || busy) return
    setBusy(true)
    setError(null)
    try {
      const encoder = new TextEncoder()
      const next = items.map((item) => (item.path in texts ? { path: item.path, bytes: encoder.encode(texts[item.path]) } : item))
      const file = new File([writeZip(next)], session.fileName, { type: 'application/zip' })
      const response = await api.uploadProject(file, { timeoutMs: 60_000 })
      // A sessão antiga é descartada em segundo plano; se falhar, o servidor a recolhe depois.
      void api.deleteProject(session.projectId).catch(() => undefined)
      setProjectZip(file)
      autoSynth.current = true
      setApplied(true)
      setOriginal(texts)
      setApplyCount((n) => n + 1)
      dispatch({
        type: 'SESSION_CREATED',
        session: { projectId: response.project_id, sessionToken: response.session_token, fileName: session.fileName },
        files: { origin: 'client-preview', items: next.map((item) => ({ path: item.path, size: item.bytes.length, kind: classifyFile(item.path) })) },
      })
    } catch (cause) {
      setError(toUserMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  let pose: BitPose = 'acenando'
  let status = `Ln ${caret.line}, Col ${caret.col}`
  if (error) pose = 'confuso'
  else if (busy) {
    pose = 'pensando'
    status = 'Reenviando o projeto com as alterações…'
  } else if (dirty) {
    pose = 'lupa'
    status += ` · ${changed.length} ${changed.length === 1 ? 'arquivo alterado' : 'arquivos alterados'}`
  } else if (applied) {
    pose = 'comemorando'
    status += ' · alterações aplicadas'
  }

  return (
    <section className="card ed" aria-labelledby="ed-title">
      <div className="ch">
        <h2 id="ed-title">Editor de código</h2>
        <span className="count">{paths.length === 1 ? '1 arquivo Verilog' : `${paths.length} arquivos Verilog`}</span>
      </div>
      <div className="ed__window">
        <div className="ed__tabs" role="tablist" aria-label="Arquivos do projeto">
          {paths.map((path) => {
            const selected = path === active
            return (
              <button
                key={path}
                type="button"
                role="tab"
                aria-selected={selected}
                className="ed__tab"
                title={path}
                onClick={() => setActive(path)}
              >
                {selected && <motion.span layoutId="ed-tab" className="ed__tab-on" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                <span className="ed__tab-name">{path.split('/').pop()}</span>
                {classifyFile(path) === 'testbench' && <span className="ed__tab-kind">tb</span>}
                {texts[path] !== original[path] && <span className="ed__tab-dot" aria-label="alterado" />}
              </button>
            )
          })}
        </div>
        <CodeEditor
          key={active}
          label={`Código de ${active}`}
          value={texts[active]}
          onChange={(value) => setTexts((all) => ({ ...all, [active]: value }))}
          onCaret={setCaret}
        />
      </div>
      {error && (
        <p role="alert" className="state-error">
          {error}
        </p>
      )}
      <div className="ed__bar">
        <Bit pose={pose} className="ed__bit" />
        <p className="ed__status" role="status">
          {status}
        </p>
        <span id="ce-keys" className="ed__keys">
          Tab recua · Esc e Tab sai do editor
        </span>
        <button type="button" className="btn bs bsm" onClick={() => setTexts(original)} disabled={!dirty || busy}>
          <IconRestart size={15} />
          Desfazer alterações
        </button>
        <button type="button" className="btn bp bsm" onClick={() => void apply()} disabled={!dirty || busy}>
          <IconRun size={15} />
          {busy ? 'Aplicando…' : 'Aplicar e sintetizar'}
        </button>
      </div>
    </section>
  )
}
