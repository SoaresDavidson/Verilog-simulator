import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { tokenize } from './highlight'

/** Altura de linha em px; a mesma do CSS (`--ce-lh`). */
const LINE_HEIGHT = 24

export interface Caret {
  line: number
  col: number
}

export interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  /** Nome acessível do campo (ex.: o caminho do arquivo). */
  label: string
  onCaret?: (caret: Caret) => void
}

/**
 * Editor de código leve: um `<textarea>` transparente sobre o texto realçado.
 * ponytail: sem múltiplos cursores, dobra de código ou busca própria (o Ctrl+F
 * do navegador funciona); trocar por CodeMirror se isso fizer falta.
 */
export function CodeEditor({ value, onChange, label, onCaret }: CodeEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const escaped = useRef(false)
  const [line, setLine] = useState(0)
  const [focused, setFocused] = useState(false)
  const tokens = useMemo(() => tokenize(value), [value])
  const lineCount = value.split('\n').length

  const syncCaret = () => {
    const el = ref.current
    if (!el) return
    const before = el.value.slice(0, el.selectionStart)
    const current = before.split('\n').length - 1
    setLine(current)
    onCaret?.({ line: current + 1, col: before.length - before.lastIndexOf('\n') })
  }

  /** Insere texto preservando o desfazer nativo (Ctrl+Z). */
  const insert = (text: string) => {
    const el = ref.current
    if (!el) return
    if (!document.execCommand?.('insertText', false, text)) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end')
      onChange(el.value)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      // Esc libera o Tab para sair do editor pelo teclado.
      escaped.current = true
      return
    }
    if (event.key === 'Tab' && !event.shiftKey && !escaped.current) {
      event.preventDefault()
      insert('  ')
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const el = event.currentTarget
      const lineStart = el.value.lastIndexOf('\n', el.selectionStart - 1) + 1
      const current = el.value.slice(lineStart, el.selectionStart)
      const indent = current.match(/^[ \t]*/)?.[0] ?? ''
      insert(`\n${indent}${/\b(begin|case[zx]?|generate)\s*$|\($/.test(current) ? '  ' : ''}`)
    }
    if (event.key !== 'Tab') escaped.current = false
  }

  return (
    <div className={`ce${focused ? ' is-focused' : ''}`}>
      <div className="ce__gutter" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <span key={i} className={i === line ? 'is-current' : undefined}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className="ce__body">
        <div className="ce__line" style={{ transform: `translateY(${line * LINE_HEIGHT}px)` }} aria-hidden="true" />
        <pre className="ce__hl" aria-hidden="true">
          {tokens.map((token, i) => (token.kind === 'text' ? token.text : <span key={i} className={`tk-${token.kind}`}>{token.text}</span>))}
          {'\n'}
        </pre>
        <textarea
          ref={ref}
          className="ce__ta"
          value={value}
          aria-label={label}
          aria-describedby="ce-keys"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onSelect={syncCaret}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
    </div>
  )
}
