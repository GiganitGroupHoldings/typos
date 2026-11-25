import { Schema } from "@tiptap/pm/model"
import { expect, it } from "vitest"
import { findSourceBlock, noteBoardParts } from "./boardSource"

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    heading: { content: "text*", group: "block", attrs: { level: { default: 1 } } },
    paragraph: { content: "text*", group: "block" },
    text: {},
  },
})

it("отличает заголовок от материала и находит цитату после перестановки блоков", () => {
  const title = schema.node("heading", null, schema.text("Заголовок"))
  const body = schema.node("paragraph", null, schema.text("План → черновик → проверка"))
  const doc = schema.node("doc", null, [title, body])
  expect(noteBoardParts(schema.node("doc", null, [schema.node("heading")]))).toEqual([])
  const [source] = noteBoardParts(doc)
  expect(source).toMatchObject({ id: 1, block: 1, text: body.textContent })
  const updated = schema.node("doc", null, [title, schema.node("paragraph", null, schema.text("Введение")), body])
  expect(findSourceBlock(updated, source.block, source.quote)).toBe(updated.child(0).nodeSize + updated.child(1).nodeSize)
  expect(findSourceBlock(updated, source.block, "другая цитата")).toBeUndefined()
})

it("передаёт короткую цепочку из первой строки, если это весь конспект", () => {
  const text = "План → черновик → проверка"
  const doc = schema.node("doc", null, [schema.node("heading", null, schema.text(text))])
  expect(noteBoardParts(doc)).toEqual([{ id: 1, text, block: 0, quote: text }])
})

it("использует выделение без текста соседних блоков", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, schema.text("Альфа, бета и гамма")),
    schema.node("paragraph", null, schema.text("Дельта")),
  ])
  expect(noteBoardParts(doc, 8, 12).map((part) => part.text)).toEqual(["бета"])
})
