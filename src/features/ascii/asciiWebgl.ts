import type { BackdropMedia } from "./backdropMedia"
import { GIF_LIGHT_ALPHAS, gridForRect, PHOTO_BACKDROP_ALPHAS, PHOTO_EDITOR_ALPHAS, PHOTO_RAMP, removeSolidBorder } from "./photo"
import type { AsciiMountOptions, AsciiRenderer, AsciiRenderOptions } from "./renderer"

const FONT = '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, monospace'
const GLYPH_W = 60
const GLYPH_H = 100
const MIN_LUM = 36 / 255
const VIDEO_INTERVAL = 40

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform sampler2D uAtlas;
uniform vec4 uRect;
uniform vec2 uGrid;
uniform vec3 uColor;
uniform float uAlphas[6];
uniform float uContrast;
uniform float uMinLum;
in vec2 vUv;
out vec4 outColor;

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  if (uv.x < uRect.x || uv.y < uRect.y || uv.x >= uRect.x + uRect.z || uv.y >= uRect.y + uRect.w) discard;
  vec2 cellF = (uv - uRect.xy) / uRect.zw * uGrid;
  ivec2 cell = clamp(ivec2(cellF), ivec2(0), ivec2(uGrid) - ivec2(1));
  vec4 src = texelFetch(uSource, cell, 0);
  float lum = clamp(dot(src.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  lum = clamp(0.5 + (lum - 0.5) * uContrast, 0.0, 1.0);
  lum = max(lum, uMinLum);
  int index = int(round(pow(lum, 0.6) * 9.0));
  int bucket = min(5, int(floor(float(index) * 6.0 / 9.0)));
  float alpha = uAlphas[bucket] * src.a;
  if (alpha <= 0.004) discard;
  vec2 glyph = fract(cellF);
  vec2 atlas = vec2((float(index) + 0.04 + glyph.x * 0.92) / 10.0, 0.03 + glyph.y * 0.94);
  float shape = texture(uAtlas, atlas).a;
  float value = shape * alpha;
  if (value <= 0.004) discard;
  outColor = vec4(uColor * value, value);
}`

let probe: HTMLCanvasElement | null = null

function probeContext(): CanvasRenderingContext2D | null {
  probe ??= document.createElement("canvas")
  probe.width = 1
  probe.height = 1
  return probe.getContext("2d", { willReadFrequently: true })
}

function readPixel(color: string): [number, number, number, number] {
  const ctx = probeContext()
  if (!ctx) return [0, 0, 0, 0]
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b, a]
}

function lightBackground(): boolean {
  const [r, g, b] = readPixel(getComputedStyle(document.body).backgroundColor)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 150
}

function accentColor(element: Element): [number, number, number] {
  const [r, g, b] = readPixel(getComputedStyle(element).color)
  return [r / 255, g / 255, b / 255]
}

function hasTransparency(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
  return false
}

/** Глифы растеризуются один раз: шейдер только выбирает нужную колонку. */
function buildAtlas(): HTMLCanvasElement {
  const atlas = document.createElement("canvas")
  atlas.width = GLYPH_W * PHOTO_RAMP.length
  atlas.height = GLYPH_H
  const ctx = atlas.getContext("2d")
  if (ctx) {
    ctx.font = `${Math.round(GLYPH_H * 0.96)}px ${FONT}`
    ctx.textBaseline = "top"
    ctx.fillStyle = "#fff"
    for (let i = 0; i < PHOTO_RAMP.length; i++) {
      const x = i * GLYPH_W
      // Клип не даёт глифу залезть в соседнюю клетку атласа и размазаться мипами.
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, 0, GLYPH_W, GLYPH_H)
      ctx.clip()
      ctx.fillText(PHOTO_RAMP[i], x, 0)
      ctx.restore()
    }
  }
  return atlas
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

function link(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  if (!vertex || !fragment) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
  gl.deleteProgram(program)
  return null
}

function createTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const texture = gl.createTexture()
  if (!texture) return null
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

/** Рисует ASCII на видеокарте: один квад вместо тысяч fillText. */
export function mountAsciiWebgl(canvas: HTMLCanvasElement, media: BackdropMedia, mount: AsciiMountOptions): AsciiRenderer | null {
  if (media.kind === "text") return null
  let atlas = buildAtlas()
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true })
  if (!gl) return null
  const sampler = document.createElement("canvas")
  const samplerCtx = sampler.getContext("2d", { willReadFrequently: true })
  if (!samplerCtx) return null

  let program: WebGLProgram | null = null
  let sourceTexture: WebGLTexture | null = null
  let atlasTexture: WebGLTexture | null = null
  let vao: WebGLVertexArrayObject | null = null
  let buffer: WebGLBuffer | null = null
  let uniforms: Record<string, WebGLUniformLocation | null> = {}
  let options: AsciiRenderOptions = { rect: null, detail: 50, contrast: 100 }
  let content = { x: 0, y: 0, w: 1, h: 1 }
  let color: [number, number, number] = [0, 0, 0]
  let alphas: number[] = PHOTO_BACKDROP_ALPHAS
  let cols = 0
  let rows = 0
  let width = 0
  let height = 0
  let minLum = 0
  let alphaReady = false
  let raf = 0
  let videoCallback = 0
  let destroyed = false
  let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const video = media.kind === "video" ? media.video : null
  const gif = media.kind === "gif" ? media : null

  const uploadAtlas = () => {
    if (!atlasTexture) return
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // Глубже третьего мипа соседние глифы начинают смешиваться в кашу.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 3)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.activeTexture(gl.TEXTURE0)
  }

  const initResources = () => {
    program = link(gl)
    sourceTexture = createTexture(gl)
    atlasTexture = gl.createTexture()
    vao = gl.createVertexArray()
    buffer = gl.createBuffer()
    if (!program || !sourceTexture || !atlasTexture || !vao || !buffer) return false
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "aPos")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    uploadAtlas()
    uniforms = {
      source: gl.getUniformLocation(program, "uSource"),
      atlas: gl.getUniformLocation(program, "uAtlas"),
      rect: gl.getUniformLocation(program, "uRect"),
      grid: gl.getUniformLocation(program, "uGrid"),
      color: gl.getUniformLocation(program, "uColor"),
      alphas: gl.getUniformLocation(program, "uAlphas[0]"),
      contrast: gl.getUniformLocation(program, "uContrast"),
      minLum: gl.getUniformLocation(program, "uMinLum"),
    }
    cols = 0
    rows = 0
    alphaReady = false
    return true
  }

  const layout = () => {
    const rect = options.rect
    const bounds = mount.local || !rect ? { x: 0, y: 0, w: 1, h: 1 } : rect
    const aspect = media.aspect || 1
    const areaW = bounds.w * width
    const areaH = bounds.h * height
    const artW = Math.min(areaW, areaH * aspect)
    const artH = artW / aspect
    if (!artW || !artH) {
      cols = 0
      rows = 0
      return
    }
    content = {
      x: bounds.x + (areaW - artW) / 2 / width,
      y: bounds.y + (areaH - artH) / 2 / height,
      w: artW / width,
      h: artH / height,
    }
    const grid = gridForRect(artW, artH, options.detail)
    if (grid.cols === cols && grid.rows === rows) return
    cols = grid.cols
    rows = grid.rows
    sampler.width = cols
    sampler.height = rows
    if (sourceTexture) {
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    }
    alphaReady = false
  }

  const sample = () => {
    if (!cols || !rows) return false
    if (media.kind === "video") {
      if (media.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false
      samplerCtx.clearRect(0, 0, cols, rows)
      samplerCtx.drawImage(media.video, 0, 0, cols, rows)
    } else if (media.kind === "gif") {
      samplerCtx.clearRect(0, 0, cols, rows)
      samplerCtx.drawImage(media.gif.image, 0, 0, cols, rows)
    } else {
      samplerCtx.clearRect(0, 0, cols, rows)
      samplerCtx.drawImage(media.image, 0, 0, cols, rows)
    }
    if (media.kind === "photo" && !alphaReady) {
      const image = samplerCtx.getImageData(0, 0, cols, rows)
      if (mount.removeBackground) removeSolidBorder(image.data, cols, rows)
      minLum = hasTransparency(image.data) ? MIN_LUM : 0
      if (mount.removeBackground) samplerCtx.putImageData(image, 0, 0)
      alphaReady = true
    } else if (gif) {
      minLum = MIN_LUM
    }
    return true
  }

  const draw = () => {
    if (destroyed || !program || !sourceTexture || !atlasTexture || !width || !height || !cols || !rows) return
    if (!sample()) return
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sampler)
    gl.useProgram(program)
    gl.bindVertexArray(vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture)
    gl.uniform1i(uniforms.source, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture)
    gl.uniform1i(uniforms.atlas, 1)
    gl.uniform4f(uniforms.rect, content.x, content.y, content.w, content.h)
    gl.uniform2f(uniforms.grid, cols, rows)
    gl.uniform3f(uniforms.color, color[0], color[1], color[2])
    gl.uniform1fv(uniforms.alphas, alphas)
    gl.uniform1f(uniforms.contrast, options.contrast / 100)
    gl.uniform1f(uniforms.minLum, minLum)
    gl.disable(gl.SCISSOR_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    // Скассор экономит заполнение: шейдер работает только по области рисунка.
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(
      Math.floor(content.x * canvas.width),
      Math.floor((1 - content.y - content.h) * canvas.height),
      Math.max(1, Math.ceil(content.w * canvas.width)),
      Math.max(1, Math.ceil(content.h * canvas.height)),
    )
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.disable(gl.SCISSOR_TEST)
    gl.bindVertexArray(null)
    gl.activeTexture(gl.TEXTURE0)
  }

  const resize = () => {
    if (destroyed) return
    const nextW = canvas.clientWidth
    const nextH = canvas.clientHeight
    if (!nextW || !nextH) return
    width = nextW
    height = nextH
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const pixelW = Math.round(nextW * dpr)
    const pixelH = Math.round(nextH * dpr)
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW
      canvas.height = pixelH
      gl.viewport(0, 0, pixelW, pixelH)
    }
    layout()
    draw()
  }

  const readColors = () => {
    color = accentColor(canvas)
    alphas = mount.preview ? PHOTO_EDITOR_ALPHAS : gif && lightBackground() ? GIF_LIGHT_ALPHAS : PHOTO_BACKDROP_ALPHAS
  }

  const cancelVideo = () => {
    if (video && videoCallback) video.cancelVideoFrameCallback(videoCallback)
    videoCallback = 0
  }

  const startVideo = () => {
    if (!video || destroyed) return
    if (typeof video.requestVideoFrameCallback === "function") {
      const step = () => {
        if (destroyed || document.hidden || reduced) return
        draw()
        videoCallback = video.requestVideoFrameCallback(step)
      }
      cancelVideo()
      videoCallback = video.requestVideoFrameCallback(step)
      return
    }
    let last = -Infinity
    cancelAnimationFrame(raf)
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < VIDEO_INTERVAL) return
      last = now
      draw()
    }
    raf = requestAnimationFrame(tick)
  }

  const startGif = () => {
    if (!gif || destroyed) return
    cancelAnimationFrame(raf)
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (destroyed || document.hidden || reduced) return
      try {
        if (gif.gif.animated && gif.gif.advance(now)) draw()
      } catch {
        cancelAnimationFrame(raf)
        gif.onError()
      }
    }
    raf = requestAnimationFrame(tick)
  }

  const stop = () => {
    cancelAnimationFrame(raf)
    raf = 0
    cancelVideo()
    video?.pause()
    gif?.gif.pause()
  }

  const resume = () => {
    stop()
    if (video) void video.play().catch(() => {})
    if (video) startVideo()
    if (gif) startGif()
    draw()
  }

  const sync = () => {
    if (document.hidden || reduced) {
      stop()
      draw()
    } else {
      resume()
    }
  }

  const onLost = (event: Event) => {
    event.preventDefault()
    stop()
  }

  const onRestored = () => {
    if (destroyed || !initResources()) return
    readColors()
    layout()
    draw()
    sync()
  }

  if (!initResources()) return null
  readColors()
  const resizeObserver = new ResizeObserver(resize)
  const themeObserver = new MutationObserver(() => {
    readColors()
    draw()
  })
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
  const onReduced = () => {
    reduced = reducedQuery.matches
    sync()
  }
  resizeObserver.observe(canvas)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-accent"] })
  document.addEventListener("visibilitychange", sync)
  reducedQuery.addEventListener("change", onReduced)
  canvas.addEventListener("webglcontextlost", onLost)
  canvas.addEventListener("webglcontextrestored", onRestored)
  // Шрифт приходит позже первого кадра — иначе в атласе окажется запасной.
  void document.fonts?.ready.then(() => {
    if (destroyed || !atlasTexture) return
    atlas = buildAtlas()
    uploadAtlas()
    draw()
  })
  resize()
  sync()

  return {
    update(next) {
      if (next.rect === options.rect && next.detail === options.detail && next.contrast === options.contrast) return
      options = next
      if (!width || !height) return
      layout()
      draw()
    },
    destroy() {
      destroyed = true
      stop()
      resizeObserver.disconnect()
      themeObserver.disconnect()
      document.removeEventListener("visibilitychange", sync)
      reducedQuery.removeEventListener("change", onReduced)
      canvas.removeEventListener("webglcontextlost", onLost)
      canvas.removeEventListener("webglcontextrestored", onRestored)
      if (program) gl.deleteProgram(program)
      if (sourceTexture) gl.deleteTexture(sourceTexture)
      if (atlasTexture) gl.deleteTexture(atlasTexture)
      if (vao) gl.deleteVertexArray(vao)
      if (buffer) gl.deleteBuffer(buffer)
    },
  }
}
