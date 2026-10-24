/** Limites da fração do primeiro painel para respeitar os mínimos dos dois. */
export function ratioBounds(size: number, minFirst: number, minSecond: number): { min: number; max: number } {
  if (size <= 0) return { min: 0, max: 1 }
  const min = minFirst / size
  const max = 1 - minSecond / size
  if (min > max) {
    const r = minFirst / (minFirst + minSecond)
    return { min: r, max: r }
  }
  return { min, max }
}
