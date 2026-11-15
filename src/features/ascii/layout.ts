export const ASCII_BASE_FONT = 14
export const ASCII_LINE_HEIGHT = 1.16
export const ASCII_MAX_HEIGHT = 420
export const ASCII_MAX_SCALE = 1.4

export interface AsciiLayout {
  font: number
  cellW: number
  cellH: number
  width: number
  height: number
}

/**
 * Вписывает сетку символов в доступную ширину и высоту.
 * Размеры клетки измерены для базового шрифта, масштаб применяется к обоим размерам линейно.
 */
export function layoutAscii(
  cols: number,
  rows: number,
  room: number,
  maxHeight: number,
  baseCellW: number,
  baseCellH: number,
): AsciiLayout {
  const scale = Math.max(0.1, Math.min(ASCII_MAX_SCALE, room / Math.max(1, cols * baseCellW), maxHeight / Math.max(1, rows * baseCellH)))
  const font = ASCII_BASE_FONT * scale
  const cellW = baseCellW * scale
  const cellH = baseCellH * scale
  return { font, cellW, cellH, width: Math.ceil(cols * cellW), height: Math.ceil(rows * cellH) }
}
