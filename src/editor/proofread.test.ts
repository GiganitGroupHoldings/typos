import { Schema } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"
import { expect, it } from "vitest"
import { applyProofEdits, proofEdits, proofSegments } from "./proofread"

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*" },
    text: { group: "inline" },
    inlineMath: { group: "inline", inline: true, attrs: { latex: {} } },
  },
  marks: { bold: {}, code: { code: true } },
})

it("применяет выбранные правки вместе с исходным форматированием", () => {
  const bold = schema.mark("bold")
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Данна ", [bold]), schema.text("матрца и 3 столбца")])])
  const segments = proofSegments(doc, 1, doc.content.size - 1)
  const edits = proofEdits(
    JSON.stringify({
      edits: [
        { id: 0, before: "Данна", after: "Дана" },
        { id: 1, before: "матрца", after: "матрица" },
        { id: 1, before: "3", after: "4" },
      ],
    }),
    segments,
  )
  expect(edits).toHaveLength(2)
  const next = applyProofEdits(EditorState.create({ doc }).tr, [edits[0]]).doc
  expect(next.textContent).toBe("Дана матрца и 3 столбца")
  expect(next.firstChild?.firstChild?.marks).toEqual([bold])
})

it("обходит формулы, код и адреса даже при частичном выделении", () => {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("https://example.com "),
      schema.text("const x", [schema.mark("code")]),
      schema.node("inlineMath", { latex: "x^2" }),
      schema.text(" опечаттка"),
    ]),
  ])
  const segments = proofSegments(doc, 10, doc.content.size - 1)
  expect(segments.map((segment) => segment.text)).toEqual([" опечаттка"])
})

it("отклоняет двусмысленную замену повторяющегося текста", () => {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, schema.text("слово слово"))])
  expect(() => proofEdits('{"edits":[{"id":0,"before":"слово","after":"слог"}]}', proofSegments(doc, 1, 12))).toThrow(
    "Не удалось сопоставить правки",
  )
})
