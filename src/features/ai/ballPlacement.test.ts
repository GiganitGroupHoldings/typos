import { expect, it } from "vitest"
import { AI_BALL_MARGIN, clampBall, placePanel } from "./ballPlacement"

it("не даёт шарику уехать за границы окна", () => {
  expect(clampBall({ x: -50, y: 900 }, { width: 1000, height: 800 })).toEqual({ x: AI_BALL_MARGIN, y: 800 - 56 - AI_BALL_MARGIN })
  expect(clampBall({ x: 400, y: 300 }, { width: 1000, height: 800 })).toEqual({ x: 400, y: 300 })
})

it("раскрывает панель влево и вверх, когда шарик у правого нижнего края", () => {
  const placement = placePanel({ x: 900, y: 700 }, { width: 1000, height: 800 })
  expect(placement).toMatchObject({ side: "left", vertical: "up", left: 900 + 56 - 352, bottom: 800 - (700 + 56) })
  expect(placement.top).toBeNull()
  expect(placement.maxHeight).toBe(480)
})

it("раскрывает панель вправо и вниз, когда шарик у левого верхнего края", () => {
  const placement = placePanel({ x: 20, y: 20 }, { width: 1000, height: 800 })
  expect(placement).toMatchObject({ side: "right", vertical: "down", left: 20, top: 20 })
  expect(placement.bottom).toBeNull()
})

it("на узком экране прижимает панель к границе и не сужает её до нуля", () => {
  const placement = placePanel({ x: 150, y: 300 }, { width: 320, height: 600 })
  expect(placement.width).toBe(320 - AI_BALL_MARGIN * 2)
  expect(placement.left).toBeGreaterThanOrEqual(AI_BALL_MARGIN)
  expect(placement.left + placement.width).toBeLessThanOrEqual(320 - AI_BALL_MARGIN)
})

it("ограничивает высоту свободным местом над шариком", () => {
  const placement = placePanel({ x: 300, y: 300 }, { width: 800, height: 600 })
  expect(placement.vertical).toBe("up")
  expect(placement.maxHeight).toBe(300 + 56 - AI_BALL_MARGIN)
})
