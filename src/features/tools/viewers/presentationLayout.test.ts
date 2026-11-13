import { describe, expect, it } from "vitest"
import { presentationLayout } from "./presentationLayout"

const slide = { width: 1920, height: 1080 }

describe("раскладка режима презентации", () => {
  it("вписывает слайд в сцену и оставляет место под превью", () => {
    const layout = presentationLayout({ width: 1000, height: 600 }, slide, true)
    expect(layout.main.scale).toBeCloseTo(764 / 1920, 5)
    expect(layout.main.left).toBeCloseTo(20, 5)
    expect(layout.main.top).toBeCloseTo(85.125, 5)
    expect(layout.next.left).toBeCloseTo(800, 5)
    expect(layout.next.top).toBeCloseTo(479, 5)
    expect(layout.next.scale).toBeCloseTo(180 / 1920, 5)
  })

  it("на узкой сцене превью накладывается, но не уменьшает слайд", () => {
    const layout = presentationLayout({ width: 600, height: 400 }, slide, true)
    expect(layout.main.scale).toBeCloseTo(560 / 1920, 5)
    expect(layout.main.left).toBeCloseTo(20, 5)
    expect(layout.main.top).toBeCloseTo(42.5, 5)
    expect(layout.next.left).toBeCloseTo(472, 5)
    expect(layout.next.top).toBeCloseTo(319, 5)
  })

  it("на последнем слайде основной слайд остаётся на месте", () => {
    const withNext = presentationLayout({ width: 1000, height: 600 }, slide, true)
    const last = presentationLayout({ width: 1000, height: 600 }, slide, false)
    expect(last.main).toEqual(withNext.main)
    expect(last.nextVisible).toBe(false)
  })

  it("не ломается на нулевой сцене", () => {
    const layout = presentationLayout({ width: 0, height: 0 }, slide, true)
    expect(Number.isFinite(layout.main.scale)).toBe(true)
    expect(Number.isFinite(layout.main.left)).toBe(true)
    expect(Number.isFinite(layout.next.left)).toBe(true)
  })
})
