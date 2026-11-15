import { translate } from "@/app/i18n"
import { parseAsciiArt, type AsciiArt } from "./format"
import { ASCII_BASE_FONT, ASCII_LINE_HEIGHT, ASCII_MAX_HEIGHT, layoutAscii, type AsciiLayout } from "./layout"

const FONT_STACK = '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, monospace'
const REDUCED = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

export interface AsciiPlayer {
  /** true, если новый текст разобрался и нарисован. */
  update(source: string): boolean
  destroy(): void
}

/** Рисует статичный или анимированный ASCII-арт на canvas; возвращает управление для обновления и остановки. */
export function mountAsciiArt(host: HTMLElement, source: string): AsciiPlayer {
  const canvas = document.createElement("canvas")
  canvas.setAttribute("aria-hidden", "true")
  const ctx = canvas.getContext("2d")

  let parsed = parseAsciiArt(source)
  let layout: AsciiLayout = { font: ASCII_BASE_FONT, cellW: 8, cellH: ASCII_BASE_FONT * ASCII_LINE_HEIGHT, width: 1, height: 1 }
  let baseCellW = 8
  let baseCellH = ASCII_BASE_FONT * ASCII_LINE_HEIGHT
  let color = ""
  let dpr = 1
  let start = performance.now()
  let frame = 0
  let raf = 0
  let reduced = REDUCED()
  let destroyed = false

  const measure = () => {
    if (!ctx) return
    ctx.font = `${ASCII_BASE_FONT}px ${FONT_STACK}`
    baseCellW = Math.max(1, ctx.measureText("M").width)
    baseCellH = Math.max(1, ASCII_BASE_FONT * ASCII_LINE_HEIGHT)
  }

  const paint = (now: number) => {
    if (!ctx || !parsed.ok) return
    const { fps, frames } = parsed.art
    const index = fps > 0 ? Math.floor(((now - start) * fps) / 1000) % frames.length : 0
    const lines = frames[index]
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, layout.width, layout.height)
    ctx.font = `${layout.font}px ${FONT_STACK}`
    ctx.textBaseline = "top"
    ctx.fillStyle = color
    for (let row = 0; row < lines.length; row++) ctx.fillText(lines[row], 0, row * layout.cellH)
  }

  const label = (art: AsciiArt) => {
    host.setAttribute("role", "img")
    host.setAttribute("aria-label", art.fps > 0 ? translate("ASCII-анимация") : translate("ASCII-арт"))
  }

  const showError = (error: string) => {
    const box = document.createElement("div")
    box.className = "ascii-error"
    box.textContent = error
    host.replaceChildren(box)
    host.removeAttribute("role")
    host.removeAttribute("aria-label")
  }

  const ensureCanvas = () => {
    if (canvas.parentElement !== host) host.replaceChildren(canvas)
  }

  const resize = () => {
    if (!ctx || !parsed.ok) return
    const style = getComputedStyle(host)
    const room = Math.max(1, host.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0))
    layout = layoutAscii(parsed.art.cols, parsed.art.rows, room, ASCII_MAX_HEIGHT, baseCellW, baseCellH)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.style.width = `${layout.width}px`
    canvas.style.height = `${layout.height}px`
    canvas.width = Math.round(layout.width * dpr)
    canvas.height = Math.round(layout.height * dpr)
    color = style.color
    paint(performance.now())
  }

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    if (document.hidden || !parsed.ok || parsed.art.fps < 1) return
    const index = Math.floor(((now - start) * parsed.art.fps) / 1000) % parsed.art.frames.length
    if (index === frame) return
    frame = index
    paint(now)
  }

  const startLoop = () => {
    cancelAnimationFrame(raf)
    raf = 0
    if (reduced || !parsed.ok || parsed.art.fps < 1 || parsed.art.frames.length < 2) return
    frame = 0
    start = performance.now()
    paint(start)
    raf = requestAnimationFrame(tick)
  }

  const apply = () => {
    parsed = parseAsciiArt(source)
    if (!parsed.ok) {
      showError(parsed.error)
      startLoop()
      return false
    }
    ensureCanvas()
    label(parsed.art)
    measure()
    resize()
    startLoop()
    return true
  }

  const update = (next: string) => {
    source = next
    reduced = REDUCED()
    return apply()
  }

  const theme = new MutationObserver(() => {
    if (!parsed.ok) return
    color = getComputedStyle(host).color
    paint(performance.now())
  })
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-accent"] })

  const resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(host)

  // Моноширинный шрифт подгружается позже первого кадра: без перезамера ширина клетки будет от запасного.
  if (document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (destroyed) return
      measure()
      resize()
    })
  }

  apply()

  return {
    update,
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      theme.disconnect()
      resizeObserver.disconnect()
      host.replaceChildren()
    },
  }
}
