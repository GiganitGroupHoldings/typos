import type { BackdropMedia } from "./backdropMedia"
import {
  drawPhotoChars,
  GIF_LIGHT_ALPHAS,
  gridForRect,
  PHOTO_BACKDROP_ALPHAS,
  PHOTO_EDITOR_ALPHAS,
  photoToAscii,
  type AsciiPhoto,
} from "./photo"
import type { AsciiMountOptions, AsciiRenderer, AsciiRenderOptions } from "./renderer"

const FONT = '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, monospace'

/** Запасной рендер на Canvas 2D: текст, а также браузеры без WebGL2. */
export function mountAsciiCanvas2d(canvas: HTMLCanvasElement, media: BackdropMedia, mount: AsciiMountOptions): AsciiRenderer {
  const ctx = canvas.getContext("2d")
  if (!ctx) return { update() {}, destroy() {} }

  let options: AsciiRenderOptions = { rect: null, detail: 50, contrast: 100 }
  const sampler = document.createElement("canvas")
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
  const video = media.kind === "video" ? media.video : null
  const gif = media.kind === "gif" ? media.gif : null
  const probe = gif ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null
  const root = document.documentElement
  const start = performance.now()
  let alphas = mount.preview ? PHOTO_EDITOR_ALPHAS : PHOTO_BACKDROP_ALPHAS
  let frame = 0
  let last = -Infinity
  let previous = -1
  let width = 0
  let height = 0
  let color = ""
  let photo: AsciiPhoto | undefined
  let sampledContrast: number | undefined
  let destroyed = false

  const draw = (now: number, force = false) => {
    const { rect, detail, contrast } = options
    const bounds = mount.local ? { x: 0, y: 0, w: 1, h: 1 } : rect
    if (!bounds || !width || !height) {
      ctx.clearRect(0, 0, width, height)
      return
    }
    const areaW = bounds.w * width
    const areaH = bounds.h * height
    const w = Math.min(areaW, areaH * media.aspect)
    const h = w / media.aspect
    const x = bounds.x * width + (areaW - w) / 2
    const y = bounds.y * height + (areaH - h) / 2

    if (media.kind === "text") {
      const { art } = media
      const index = art.fps && !reduced.matches ? Math.floor(((now - start) * art.fps) / 1000) % art.frames.length : 0
      if (!force && previous === index) return
      previous = index
      ctx.clearRect(0, 0, width, height)
      const font = h / (art.rows * 1.16)
      ctx.font = `${font}px ${FONT}`
      ctx.textBaseline = "top"
      ctx.fillStyle = color
      ctx.globalAlpha = mount.preview ? 1 : 0.6
      art.frames[index].forEach((line, i) => ctx.fillText(line, x, y + (i * h) / art.rows))
      ctx.globalAlpha = 1
      return
    }

    const { cols, rows } = gridForRect(w, h, detail)
    const needsSample = !photo || sampler.width !== cols || sampler.height !== rows || sampledContrast !== contrast
    if (media.kind === "video") {
      if (media.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      const time = media.video.currentTime
      if (!force && time === previous) return
      previous = time
      photo = photoToAscii(media.video, cols, rows, sampler, { contrast })
    } else if (media.kind === "gif") {
      try {
        const changed = !reduced.matches && !document.hidden && media.gif.animated && media.gif.advance(now)
        if (!changed && !force) return
        if (changed || needsSample) photo = photoToAscii(media.gif.image, cols, rows, sampler, { contrast })
      } catch {
        cancelAnimationFrame(frame)
        media.onError()
        return
      }
    } else if (needsSample) {
      photo = photoToAscii(media.image, cols, rows, sampler, { contrast, removeBackground: mount.removeBackground })
    }
    sampledContrast = contrast
    ctx.clearRect(0, 0, width, height)
    if (photo) drawPhotoChars(ctx, photo, { x, y, w, h }, { color, alphas })
  }

  const drawNow = () => draw(performance.now(), true)

  const resize = () => {
    width = canvas.clientWidth
    height = canvas.clientHeight
    // У фото и видео клетки размером ~6 px: лишние пиксели на Retina ничего не дают.
    const limit = media.kind === "text" ? 2 : 1
    const dpr = Math.min(window.devicePixelRatio || 1, limit)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawNow()
  }

  const readColors = () => {
    const accent = getComputedStyle(canvas).color
    color = accent
    if (probe) {
      probe.clearRect(0, 0, 1, 1)
      probe.fillStyle = getComputedStyle(document.body).backgroundColor
      probe.fillRect(0, 0, 1, 1)
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
      const light = 0.2126 * r + 0.7152 * g + 0.0722 * b >= 150
      color = `color-mix(in srgb, ${accent} 45%, ${light ? "#151413" : "#f7f6f2"})`
      alphas = mount.preview ? PHOTO_EDITOR_ALPHAS : light ? GIF_LIGHT_ALPHAS : PHOTO_BACKDROP_ALPHAS
    }
    drawNow()
  }

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick)
    if (video && now - last < 40) return
    last = now
    draw(now)
  }

  const syncMotion = () => {
    cancelAnimationFrame(frame)
    if (reduced.matches || document.hidden) {
      video?.pause()
      gif?.pause()
      drawNow()
      return
    }
    if (video) void video.play().catch(() => {})
    if (video || gif?.animated || (media.kind === "text" && media.art.fps)) frame = requestAnimationFrame(tick)
  }

  const resizeObserver = new ResizeObserver(resize)
  const themeObserver = new MutationObserver(readColors)
  resizeObserver.observe(canvas)
  themeObserver.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-accent"] })
  document.addEventListener("visibilitychange", syncMotion)
  reduced.addEventListener("change", syncMotion)
  video?.addEventListener("seeked", drawNow)
  // Моноширинный шрифт подгружается позже первого кадра — перезамер после него.
  void document.fonts?.ready.then(() => {
    if (!destroyed) drawNow()
  })
  readColors()
  resize()
  syncMotion()

  return {
    update(next) {
      if (next.rect === options.rect && next.detail === options.detail && next.contrast === options.contrast) return
      options = next
      if (width && height) drawNow()
    },
    destroy() {
      destroyed = true
      cancelAnimationFrame(frame)
      video?.pause()
      gif?.pause()
      video?.removeEventListener("seeked", drawNow)
      reduced.removeEventListener("change", syncMotion)
      document.removeEventListener("visibilitychange", syncMotion)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      ctx.clearRect(0, 0, width, height)
    },
  }
}
