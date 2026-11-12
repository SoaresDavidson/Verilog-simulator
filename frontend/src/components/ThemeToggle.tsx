import { useEffect, useState } from 'react'
import { IconMoon, IconSun } from './icons'

type Theme = 'dark' | 'light'
const STORAGE_KEY = 'verilog-classroom:theme'

/** Tema claro é o padrão (laboratório de dia, projetor em sala). */
function systemTheme(): Theme {
  return 'light'
}

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null
  }
}

/** Alterna entre a bancada de dia (claro, padrão) e a bancada à noite (escuro). */
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
      className="btn bi bs theme-toggle"
      onClick={toggle}
      aria-pressed={theme === 'dark'}
      aria-label={next === 'light' ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={next === 'light' ? 'Tema claro' : 'Tema escuro'}
    >
      {theme === 'dark' ? <IconSun /> : <IconMoon />}
    </button>
  )
}
