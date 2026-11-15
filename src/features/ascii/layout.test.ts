import { expect, it } from "vitest"
import { layoutAscii } from "./layout"

it("вписывает широкий рисунок в доступную ширину", () => {
  const layout = layoutAscii(100, 20, 400, 1000, 8, 16)
  expect(layout.width).toBeLessThanOrEqual(400)
  expect(layout.height).toBeLessThanOrEqual(1000)
})

it("не растягивает маленький рисунок бесконечно", () => {
  const layout = layoutAscii(3, 1, 1000, 1000, 8, 16)
  expect(layout.font).toBeCloseTo(14 * 1.4)
  expect(layout.width).toBe(Math.ceil(3 * 8 * 1.4))
})

it("ужимает высокий рисунок по высоте", () => {
  const layout = layoutAscii(10, 100, 1000, 200, 8, 16)
  expect(layout.height).toBeLessThanOrEqual(200)
  expect(layout.width).toBeLessThanOrEqual(1000)
})
