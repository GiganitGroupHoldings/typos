import { translate } from "@/app/i18n"

export const ASCII_LIMITS = {
  cols: 200,
  rows: 80,
  frames: 240,
  fps: 30,
  chars: 120_000,
} as const

export const ASCII_DEFAULT_FPS = 10

export interface AsciiArt {
  fps: number
  cols: number
  rows: number
  frames: string[][]
}

export type AsciiParseResult = { ok: true; art: AsciiArt } | { ok: false; error: string }

const FPS_DIRECTIVE = /^@fps\s+(\d+)\s*$/i
const FRAME_SEPARATOR = /^---\s*$/

/** Управляющие символы ломают canvas и не несут рисунка; переводы строк и табуляция уже обработаны. */
function hasControlChars(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code === 127) return true
    if (code < 32 && code !== 10) return true
  }
  return false
}

/** Обрезает пустые строки по краям кадра, но сохраняет пустые строки внутри рисунка. */
function trimFrame(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && !lines[start].trim()) start++
  while (end > start && !lines[end - 1].trim()) end--
  return lines.slice(start, end).map((line) => line.trimEnd())
}

/**
 * Разбирает содержимое блока ```ascii: необязательная строка `@fps N`,
 * кадры разделяются строкой `---`. Пределы защищают редактор от огромных ответов модели.
 */
export function parseAsciiArt(source: string): AsciiParseResult {
  const text = source.replace(/\r\n?/g, "\n").replace(/\t/g, "  ")
  if (hasControlChars(text))
    return { ok: false, error: translate("В рисунке есть недопустимые символы. Замени их обычными и попробуй снова.") }
  if (text.length > ASCII_LIMITS.chars)
    return { ok: false, error: translate("Рисунок больше {0} символов. Сократи его и попробуй снова.", ASCII_LIMITS.chars) }

  const lines = text.split("\n")
  let fps = 0
  let cursor = 0
  while (cursor < lines.length && !lines[cursor].trim()) cursor++
  const directive = cursor < lines.length ? FPS_DIRECTIVE.exec(lines[cursor].trim()) : null
  if (directive) {
    fps = Math.min(ASCII_LIMITS.fps, Number(directive[1]))
    cursor++
  }

  const frames: string[][] = []
  let current: string[] = []
  for (; cursor < lines.length; cursor++) {
    if (FRAME_SEPARATOR.test(lines[cursor])) {
      frames.push(current)
      current = []
      continue
    }
    current.push(lines[cursor])
  }
  frames.push(current)

  const cleaned = frames.map(trimFrame).filter((frame) => frame.length > 0)
  if (!cleaned.length) return { ok: false, error: translate("Рисунок пуст. Вставь ASCII-арт.") }

  const rows = Math.max(...cleaned.map((frame) => frame.length))
  const cols = Math.max(...cleaned.flatMap((frame) => frame.map((line) => line.length)))
  if (rows > ASCII_LIMITS.rows)
    return { ok: false, error: translate("В рисунке больше {0} строк. Убери лишние и попробуй снова.", ASCII_LIMITS.rows) }
  if (cols > ASCII_LIMITS.cols)
    return { ok: false, error: translate("В рисунке больше {0} колонок. Сузь рисунок и попробуй снова.", ASCII_LIMITS.cols) }
  if (cleaned.length > ASCII_LIMITS.frames)
    return { ok: false, error: translate("В рисунке больше {0} кадров. Удали лишние и попробуй снова.", ASCII_LIMITS.frames) }

  if (cleaned.length < 2) fps = 0
  else if (fps < 1) fps = ASCII_DEFAULT_FPS

  return { ok: true, art: { fps, cols, rows, frames: cleaned } }
}
