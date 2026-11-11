const UNITS = ['B', 'KB', 'MB', 'GB']

/** Formata bytes em pt-BR (ex.: `1,2 KB`). */
export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })} ${UNITS[unit]}`
}
