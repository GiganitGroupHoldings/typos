import { expect, it, vi } from "vitest"
import {
  charForLuminance,
  clampRect,
  drawPhotoChars,
  fitRect,
  gridForRect,
  moveRect,
  normalizeContrast,
  PHOTO_MAX_COLS,
  PHOTO_MIN_COLS,
  PHOTO_RAMP,
  photoToAscii,
  resizeRect,
} from "./photo"

it("контраст разводит светлые и тёмные тона без изменения сетки и прозрачности", () => {
  expect(normalizeContrast(undefined)).toBe(100)
  expect(normalizeContrast(400)).toBe(200)
  const canvas = document.createElement("canvas")
  const ctx = {
    clearRect() {},
    drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray([72, 72, 72, 128, 180, 180, 180, 255, 255, 255, 255, 0]) }),
  }
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  const normal = photoToAscii(canvas, 3, 1, canvas)
  const strong = photoToAscii(canvas, 3, 1, canvas, { contrast: 200 })
  expect(strong.lines).toEqual([charForLuminance(36) + charForLuminance(232.5) + " "])
  expect(PHOTO_RAMP.indexOf(strong.lines[0][0])).toBeLessThan(PHOTO_RAMP.indexOf(normal.lines[0][0]))
  expect(PHOTO_RAMP.indexOf(strong.lines[0][1])).toBeGreaterThan(PHOTO_RAMP.indexOf(normal.lines[0][1]))
  expect(strong.opacity).toEqual(normal.opacity)
  expect(photoToAscii(canvas, 3, 1, canvas, { contrast: 0 }).lines).toEqual([charForLuminance(127.5).repeat(2) + " "])
})

it("тёмное превращается в пробел, светлое — в плотный символ", () => {
  expect(charForLuminance(0)).toBe(" ")
  expect(charForLuminance(255)).toBe("@")
  expect(PHOTO_RAMP.indexOf(charForLuminance(128))).toBeGreaterThan(PHOTO_RAMP.indexOf(charForLuminance(40)))
})

it("пропускает прозрачный фон, рисует чёрный силуэт и сохраняет полупрозрачность", () => {
  const pixels = new Uint8ClampedArray([255, 255, 255, 0, 0, 0, 0, 255, 0, 0, 0, 128])
  const ctx = {
    clearRect() {},
    drawImage() {},
    getImageData: () => ({ data: pixels }),
    globalAlpha: 1,
    fillText: vi.fn(() => ctx.globalAlpha),
  }
  const canvas = document.createElement("canvas")
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  const photo = photoToAscii(canvas, 3, 1, canvas, { removeBackground: true })
  expect(photo.lines).toEqual([" " + charForLuminance(36).repeat(2)])
  drawPhotoChars(ctx as unknown as CanvasRenderingContext2D, photo, { x: 0, y: 0, w: 30, h: 10 }, { color: "#fff", alphas: [1] })
  expect(ctx.fillText.mock.results.map((entry) => entry.value)).toEqual([1, 128 / 255])
})

it("убирает однотонную подложку с краёв, сохраняя тот же цвет внутри силуэта", () => {
  const cells = ["wwwww", "wbbbw", "wbwbw", "wbbbw", "wwwww"].join("")
  const canvas = document.createElement("canvas")
  const ctx = {
    clearRect() {},
    drawImage() {},
    getImageData: () => ({
      data: Uint8ClampedArray.from(Array.from(cells).flatMap((cell) => (cell === "w" ? [255, 255, 255, 255] : [0, 0, 0, 255]))),
    }),
  }
  vi.spyOn(canvas, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  expect(photoToAscii(canvas, 5, 5, canvas).lines[0]).toBe("@@@@@")
  const photo = photoToAscii(canvas, 5, 5, canvas, { removeBackground: true })
  expect(photo.lines[0]).toBe("     ")
  expect(photo.lines[2][2]).toBe("@")
  expect(photo.lines[2][1]).toBe(charForLuminance(36))
})

it("сетка растёт с размером рисунка и упирается в пределы", () => {
  expect(gridForRect(100, 100)).toEqual({ cols: PHOTO_MIN_COLS, rows: 20 })
  expect(gridForRect(900, 600).cols).toBe(150)
  expect(gridForRect(5000, 5000, 100)).toEqual({ cols: PHOTO_MAX_COLS, rows: 100 })
})

it("ползунок меняет плотность сетки даже у очень большого рисунка", () => {
  for (const [width, height] of [
    [160, 100],
    [900, 600],
    [5000, 5000],
  ]) {
    const low = gridForRect(width, height, 0)
    const middle = gridForRect(width, height)
    const high = gridForRect(width, height, 100)
    expect(low.cols).toBeLessThan(middle.cols)
    expect(middle.cols).toBeLessThan(high.cols)
    expect(low.rows).toBeLessThan(middle.rows)
    expect(middle.rows).toBeLessThan(high.rows)
  }
})

it("стартовое положение центрируется и сохраняет пропорции фото", () => {
  const rect = fitRect(1000, 800, 4 / 3)
  expect(rect.x).toBeCloseTo((1 - rect.w) / 2)
  expect(rect.y).toBeCloseTo((1 - rect.h) / 2)
  expect((rect.w * 1000) / (rect.h * 800)).toBeCloseTo(4 / 3, 5)
})

it("перетаскивание не выпускает рисунок за экран", () => {
  const rect = clampRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })
  expect(moveRect(rect, 1, 1)).toMatchObject({ x: 0.5, y: 0.5 })
  expect(moveRect(rect, -1, -1)).toMatchObject({ x: 0, y: 0 })
})

it("масштабирование сохраняет пропорции и не уходит ниже минимальной сетки", () => {
  const rect = { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }
  const bigger = resizeRect(rect, 900, 1000, 800, 4 / 3)
  expect((bigger.w * 1000) / (bigger.h * 800)).toBeCloseTo(4 / 3, 5)
  const tiny = resizeRect(rect, 20, 1000, 800, 4 / 3)
  expect(tiny.w * 1000).toBeGreaterThanOrEqual(PHOTO_MIN_COLS * 6)
})
