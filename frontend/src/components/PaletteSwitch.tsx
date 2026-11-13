import { useEffect, useState } from 'react'

const STORAGE_KEY = 'verilog-classroom:palette:v2'

/** Paletas definidas em `styles/tokens.css` (cores-semente `--p-*`). */
const PALETTES = [
  { id: 'verilog', label: 'Verilog', ink: '#0c2018', dot: '#8fd645' },
  { id: 'grafite', label: 'Grafite', ink: '#17181c', dot: '#8fd645' },
  { id: 'placa', label: 'Placa de circuito', ink: '#0a2b30', dot: '#ffc23d' },
  { id: 'tinta', label: 'Tinta roxa', ink: '#1a1238', dot: '#e11d5b' },
] as const

type PaletteId = (typeof PALETTES)[number]['id']

function readStored(): PaletteId {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return PALETTES.find((p) => p.id === value)?.id ?? 'verilog'
  } catch {
    return 'verilog'
  }
}

/** Escolha da paleta de cores; a preferência fica só neste navegador. */
export function PaletteSwitch() {
  const [palette, setPalette] = useState<PaletteId>(readStored)

  useEffect(() => {
    if (palette === 'verilog') delete document.documentElement.dataset.palette
    else document.documentElement.dataset.palette = palette
  }, [palette])

  const choose = (id: PaletteId) => {
    setPalette(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // Preferência é só conveniência; ignora falha de storage.
    }
  }

  return (
    <div className="palette" role="radiogroup" aria-label="Paleta de cores">
      {PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={palette === p.id}
          aria-label={p.label}
          title={p.label}
          className="palette__opt"
          style={{ background: p.ink }}
          onClick={() => choose(p.id)}
        >
          <span className="palette__dot" style={{ background: p.dot }} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
