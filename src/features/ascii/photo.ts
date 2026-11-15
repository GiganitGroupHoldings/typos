export const PHOTO_MIN_COLS = 40
export const PHOTO_MAX_COLS = 180
export const PHOTO_MIN_ROWS = 20
export const PHOTO_MAX_ROWS = 100
export const PHOTO_CELL_W = 6
export const PHOTO_CELL_H = 10
export const PHOTO_RAMP = " .:-=+*#%@"
export const PHOTO_BACKDROP_ALPHAS = [0.08, 0.14, 0.22, 0.32, 0.46, 0.6]
export const GIF_LIGHT_ALPHAS = [0.23, 0.33, 0.45, 0.58, 0.72, 0.85]
export const PHOTO_EDITOR_ALPHAS = [0.45, 0.6, 0.75, 0.88, 0.96, 1]
export const DEFAULT_DETAIL = 50
export const DEFAULT_CONTRAST = 100
export const MAX_CONTRAST = 200

export interface AsciiRect {
  x: number
  y: number
  w: number
  h: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function normalizeDetail(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(Math.round(value), 0, 100) : DEFAULT_DETAIL
}

export function normalizeContrast(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(Math.round(value), 0, MAX_CONTRAST) : DEFAULT_CONTRAST
}

/** Тёмное — пробел, светлое — плотный символ. */
export function charForLuminance(luminance: number): string {
  // Гамма вытягивает детали из тёмных участков: ночное фото иначе превращается в пустоту.
  const index = Math.round((clamp(luminance, 0, 255) / 255) ** 0.6 * (PHOTO_RAMP.length - 1))
  return PHOTO_RAMP[index]
}

export function gridForRect(width: number, height: number, detail = DEFAULT_DETAIL): { cols: number; rows: number } {
  const level = normalizeDetail(detail) / 100
  const density = (base: number, min: number, max: number) => {
    const low = clamp(base / 4, min / 4, max / 4)
    const high = clamp(base * 4, min, max)
    const middle = clamp(base, min, Math.max(min, high * 0.9))
    return Math.round(level <= 0.5 ? low + (middle - low) * level * 2 : middle + (high - middle) * (level * 2 - 1))
  }
  return {
    cols: density(width / PHOTO_CELL_W, PHOTO_MIN_COLS, PHOTO_MAX_COLS),
    rows: density(height / PHOTO_CELL_H, PHOTO_MIN_ROWS, PHOTO_MAX_ROWS),
  }
}

export interface AsciiPhoto {
  lines: string[]
  opacity: Uint8ClampedArray | null
}

/** Снимает цвет подложки только в областях, связанных с краем изображения. */
export function removeSolidBorder(data: Uint8ClampedArray, cols: number, rows: number) {
  const corners = [0, cols - 1, (rows - 1) * cols, rows * cols - 1]
  const similar = (a: number, b: number) => {
    const i = a * 4
    const j = b * 4
    return Math.max(Math.abs(data[i] - data[j]), Math.abs(data[i + 1] - data[j + 1]), Math.abs(data[i + 2] - data[j + 2])) <= 24
  }
  const key = corners.find((corner) => corners.filter((other) => similar(corner, other)).length >= 3)
  if (key === undefined) return

  const pending: number[] = []
  const visit = (cell: number) => {
    if (!data[cell * 4 + 3] || !similar(cell, key)) return
    data[cell * 4 + 3] = 0
    pending.push(cell)
  }
  for (let x = 0; x < cols; x++) {
    visit(x)
    visit((rows - 1) * cols + x)
  }
  for (let y = 0; y < rows; y++) {
    visit(y * cols)
    visit(y * cols + cols - 1)
  }
  for (let i = 0; i < pending.length; i++) {
    const cell = pending[i]
    const x = cell % cols
    if (x > 0) visit(cell - 1)
    if (x < cols - 1) visit(cell + 1)
    if (cell >= cols) visit(cell - cols)
    if (cell + cols < cols * rows) visit(cell + cols)
  }
}

/** Превращает картинку в сетку символов с прозрачностью каждой клетки. */
export function photoToAscii(
  source: CanvasImageSource,
  cols: number,
  rows: number,
  canvas = document.createElement("canvas"),
  { removeBackground = false, contrast = DEFAULT_CONTRAST }: { removeBackground?: boolean; contrast?: number } = {},
): AsciiPhoto {
  if (canvas.width !== cols) canvas.width = cols
  if (canvas.height !== rows) canvas.height = rows
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return { lines: [], opacity: null }
  ctx.clearRect(0, 0, cols, rows)
  ctx.drawImage(source, 0, 0, cols, rows)
  const data = ctx.getImageData(0, 0, cols, rows).data
  if (removeBackground) {
    let hasAlpha = false
    for (let i = 3; i < data.length && !hasAlpha; i += 4) hasAlpha = data[i] < 255
    if (!hasAlpha) removeSolidBorder(data, cols, rows)
  }
  let opacity: Uint8ClampedArray | null = null
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 255) continue
    opacity ??= new Uint8ClampedArray(cols * rows).fill(255)
    opacity[(i - 3) / 4] = data[i]
  }
  const lines: string[] = []
  const gain = normalizeContrast(contrast) / DEFAULT_CONTRAST
  const midpoint = 127.5
  for (let y = 0; y < rows; y++) {
    let line = ""
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4
      if (data[i + 3] === 0) {
        line += " "
        continue
      }
      const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      const adjusted = midpoint + (luminance - midpoint) * gain
      // Тёмный силуэт на прозрачном фоне тоже должен читаться.
      line += charForLuminance(opacity ? Math.max(36, adjusted) : adjusted)
    }
    lines.push(line)
  }
  return { lines, opacity }
}

/** Картинка для отрисовки: ImageBitmap, а в старых движках — обычный Image. */
export async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob)
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function clampRect(rect: AsciiRect): AsciiRect {
  const w = clamp(rect.w, 0.02, 1)
  const h = clamp(rect.h, 0.02, 1)
  return { x: clamp(rect.x, 0, 1 - w), y: clamp(rect.y, 0, 1 - h), w, h }
}

export function moveRect(rect: AsciiRect, dx: number, dy: number): AsciiRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy })
}

/** Стартовое положение по центру с сохранением пропорций фото. */
export function fitRect(stageW: number, stageH: number, aspect: number, ratio = 0.78): AsciiRect {
  if (!stageW || !stageH || !aspect) return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
  let w = ratio
  let h = (w * stageW) / (aspect * stageH)
  if (h > ratio) {
    h = ratio
    w = (h * stageH * aspect) / stageW
  }
  return clampRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h })
}

/** Тянем за правый нижний угол: пропорции фото сохраняются, пределы сетки соблюдаются. */
export function resizeRect(rect: AsciiRect, pointerX: number, stageW: number, stageH: number, aspect: number): AsciiRect {
  if (!stageW || !stageH || !aspect) return rect
  const maxW = 1 - rect.x
  const minW = Math.min((PHOTO_MIN_COLS * PHOTO_CELL_W) / stageW, maxW)
  const minH = Math.min((PHOTO_MIN_ROWS * PHOTO_CELL_H) / stageH, 1 - rect.y)
  let w = clamp((pointerX - rect.x * stageW) / stageW, minW, maxW)
  let h = (w * stageW) / (aspect * stageH)
  if (h < minH) {
    h = minH
    w = (h * stageH * aspect) / stageW
  }
  if (rect.y + h > 1) {
    h = 1 - rect.y
    w = (h * stageH * aspect) / stageW
  }
  return clampRect({ x: rect.x, y: rect.y, w, h })
}

const FONT = '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, monospace'

/** Рисует готовые строки в прямоугольнике; яркость символа задаёт прозрачность. */
export function drawPhotoChars(
  ctx: CanvasRenderingContext2D,
  { lines, opacity }: AsciiPhoto,
  rect: AsciiRect,
  { color, alphas }: { color: string; alphas: number[] },
): void {
  const rows = lines.length
  const cols = lines[0]?.length ?? 0
  if (!rows || !cols || rect.w <= 0 || rect.h <= 0) return
  const cellW = rect.w / cols
  const cellH = rect.h / rows
  const font = Math.min(cellH * 0.98, cellW / 0.6)
  ctx.font = `${font}px ${FONT}`
  ctx.textBaseline = "top"
  ctx.fillStyle = color
  const levels = PHOTO_RAMP.length - 1
  for (let bucket = 0; bucket < alphas.length; bucket++) {
    let alpha = alphas[bucket]
    ctx.globalAlpha = alpha
    for (let row = 0; row < rows; row++) {
      const line = lines[row]
      for (let col = 0; col < cols; col++) {
        const char = line[col]
        if (char === " ") continue
        const level = Math.max(0, PHOTO_RAMP.indexOf(char)) / levels
        const index = Math.min(alphas.length - 1, Math.floor(level * alphas.length))
        if (index !== bucket) continue
        const nextAlpha = opacity ? alphas[bucket] * (opacity[row * cols + col] / 255) : alphas[bucket]
        if (nextAlpha !== alpha) {
          alpha = nextAlpha
          ctx.globalAlpha = alpha
        }
        ctx.fillText(char, rect.x + col * cellW, rect.y + row * cellH)
      }
    }
  }
  ctx.globalAlpha = 1
}
