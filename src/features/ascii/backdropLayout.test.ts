import { expect, it } from "vitest"
import { overlaps, placeBackdrop } from "./backdropLayout"

it("размещает новый элемент рядом с существующим и уменьшает при нехватке места", () => {
  const existing = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
  const added = placeBackdrop(existing, [existing], 0.1)
  expect(added).not.toBeNull()
  expect(overlaps(existing, added!)).toBe(false)
  expect(added!.w).toBeLessThan(existing.w)
})
