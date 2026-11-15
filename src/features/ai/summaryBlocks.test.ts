import { expect, it } from "vitest"
import { summaryBlocks } from "./summaryBlocks"

it("разбирает короткий Markdown на заголовок, абзац и списки", () => {
  const blocks = summaryBlocks("# Тема\nТекст **важный**.\n\n- Первый\n- Второй\n\n1) Раз\n2) Два")
  expect(blocks).toEqual([
    { kind: "heading", text: "Тема" },
    { kind: "paragraph", text: "Текст **важный**." },
    { kind: "list", ordered: false, items: ["Первый", "Второй"] },
    { kind: "list", ordered: true, items: ["Раз", "Два"] },
  ])
})

it("склеивает строки абзаца и не спотыкается о блок кода", () => {
  expect(summaryBlocks("Первая строка\nвторая строка\n\n```markdown\n- Пункт\n```")).toEqual([
    { kind: "paragraph", text: "Первая строка вторая строка" },
    { kind: "list", ordered: false, items: ["Пункт"] },
  ])
})

it("возвращает пустой список для пустого ответа", () => {
  expect(summaryBlocks("  \n\n")).toEqual([])
})
