import { expect, it } from "vitest"
import { parseAsciiArt } from "./format"

const parsed = (source: string) => {
  const result = parseAsciiArt(source)
  if (!result.ok) throw new Error(result.error)
  return result.art
}

it("разбирает статичный рисунок в одну рамку", () => {
  const art = parsed(" /\\\n/  \\")
  expect(art).toMatchObject({ fps: 0, cols: 4, rows: 2 })
  expect(art.frames).toEqual([[" /\\", "/  \\"]])
})

it("делит кадры по строке --- и берёт fps из директивы", () => {
  const art = parsed("@fps 12\n(o o)\n---\n(o -)")
  expect(art.fps).toBe(12)
  expect(art.frames).toEqual([["(o o)"], ["(o -)"]])
})

it("для анимации без директивы берёт частоту по умолчанию, а частоту выше предела срезает", () => {
  expect(parsed("a\n---\nb").fps).toBe(10)
  expect(parsed("@fps 999\na\n---\nb").fps).toBe(30)
  expect(parsed("@fps 0\na\n---\nb").fps).toBe(10)
})

it("сохраняет обратные слэши, кавычки и ведущие пробелы, убирая хвостовые", () => {
  const art = parsed('  \\  /  "q"   \n   \\/  ')
  expect(art.frames[0]).toEqual(['  \\  /  "q"', "   \\/"])
})

it("оставляет пустые строки внутри рисунка и убирает по краям", () => {
  expect(parsed("\n\na\n\nb\n\n").frames[0]).toEqual(["a", "", "b"])
})

it("нормализует переводы строк и раскрывает табуляцию", () => {
  expect(parsed("a\r\nb").frames[0]).toEqual(["a", "b"])
  expect(parsed("a\tb").frames[0]).toEqual(["a  b"])
})

it("отклоняет пустой рисунок и управляющие символы", () => {
  expect(parseAsciiArt("")).toMatchObject({ ok: false })
  expect(parseAsciiArt("\n \n")).toMatchObject({ ok: false })
  expect(parseAsciiArt("a\u0007b")).toMatchObject({ ok: false })
})

it("отклоняет рисунок шире предела", () => {
  expect(parseAsciiArt("x".repeat(201))).toMatchObject({ ok: false })
  expect(parseAsciiArt("x".repeat(200))).toMatchObject({ ok: true })
})
