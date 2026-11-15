import { decompressFrame, parseGIF } from "gifuct-js"

/** Собирает GIF по одному кадру, чтобы не держать распакованную анимацию в памяти. */
export async function loadGif(blob: Blob) {
  const gif = parseGIF(await blob.arrayBuffer())
  const { width, height } = gif.lsd
  const frames = gif.frames.filter((frame) => "image" in frame)
  if (gif.header.signature !== "GIF" || !width || !height || width > 4096 || height > 4096 || !frames.length) {
    throw new Error("Не удалось прочитать GIF.")
  }
  for (const { image } of frames) {
    const { width: w, height: h, left, top } = image.descriptor
    if (!w || !h || left + w > width || top + h > height) throw new Error("Не удалось прочитать кадр GIF.")
  }

  const image = document.createElement("canvas")
  image.width = width
  image.height = height
  const ctx = image.getContext("2d")
  const patch = document.createElement("canvas")
  const patchCtx = patch.getContext("2d")
  if (!ctx || !patchCtx) throw new Error("Не удалось создать холст для GIF.")

  let index = -1
  let nextAt: number | null = null
  let dispose = () => {}
  let delay = 100
  const drawNext = () => {
    index = (index + 1) % frames.length
    if (index === 0) ctx.clearRect(0, 0, width, height)
    else dispose()
    const { dims, disposalType, patch: pixels, delay: duration } = decompressFrame(frames[index], gif.gct, true)
    const { left, top, width: w, height: h } = dims
    const previous = disposalType === 3 ? ctx.getImageData(left, top, w, h) : null
    dispose = () => {
      if (previous) ctx.putImageData(previous, left, top)
      else if (disposalType === 2) ctx.clearRect(left, top, w, h)
    }
    patch.width = w
    patch.height = h
    const data = patchCtx.createImageData(w, h)
    data.data.set(pixels)
    patchCtx.putImageData(data, 0, 0)
    ctx.drawImage(patch, left, top)
    delay = duration >= 20 ? duration : 100
  }

  drawNext()
  return {
    image,
    animated: frames.length > 1,
    pause: () => {
      nextAt = null
    },
    advance(now: number) {
      nextAt ??= now + delay
      if (now < nextAt) return false
      const due = nextAt
      drawNext()
      nextAt = Math.max(due + delay, now + 1)
      return true
    },
  }
}

export type GifPlayback = Awaited<ReturnType<typeof loadGif>>
