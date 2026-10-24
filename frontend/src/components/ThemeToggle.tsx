import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
const STORAGE_KEY = 'verilog-classroom:theme'

function systemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null
  }
}

/** Alterna entre o tema escuro (padrão do protótipo) e o claro. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? systemTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const toggle = () => {
    setTheme(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preferência é só conveniência; ignora falha de storage.
    }
  }

  return (
    <button
      type="button"
      className="btn bi theme-toggle"
      onClick={toggle}
      aria-label={next === 'light' ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={next === 'light' ? 'Tema claro' : 'Tema escuro'}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  )
}
