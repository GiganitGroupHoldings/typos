import type { AsciiRect } from "./photo"

const GAP = 0.012

export function overlaps(a: AsciiRect, b: AsciiRect): boolean {
  return a.x < b.x + b.w - 1e-7 && a.x + a.w > b.x + 1e-7 && a.y < b.y + b.h - 1e-7 && a.y + a.h > b.y + 1e-7
}

/** Ищет ближайшее свободное место с сохранением пропорций рисунка. */
export function placeBackdrop(rect: AsciiRect, obstacles: AsciiRect[], minScale = 0.25): AsciiRect | null {
  if (!obstacles.some((other) => overlaps(rect, other))) return rect
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  for (let scale = 1; scale >= minScale; scale *= 0.8) {
    const w = rect.w * scale
    const h = rect.h * scale
    if (w < 0.02 || h < 0.02) break
    const xs = [cx - w / 2, 0, 1 - w]
    const ys = [cy - h / 2, 0, 1 - h]
    for (const other of obstacles) {
      xs.push(other.x - w - GAP, other.x + other.w + GAP)
      ys.push(other.y - h - GAP, other.y + other.h + GAP)
    }
    let nearest: AsciiRect | null = null
    let distance = Infinity
    for (const left of xs) {
      const x = Math.max(0, Math.min(1 - w, left))
      for (const top of ys) {
        const y = Math.max(0, Math.min(1 - h, top))
        const candidate = { x, y, w, h }
        const score = (x + w / 2 - cx) ** 2 + (y + h / 2 - cy) ** 2
        if (score >= distance || obstacles.some((other) => overlaps(candidate, other))) continue
        nearest = candidate
        distance = score
      }
    }
    if (nearest) return nearest
  }
  return null
}

export function backdropPosition(rect: AsciiRect) {
  return { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }
}
