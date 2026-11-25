import { Editor } from "@tiptap/core"
import { closeHistory } from "@tiptap/pm/history"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { AiEditEffect, aiEditUndo, revealAiEdit, showAiPending } from "./aiEditEffect"

let editor: Editor

beforeEach(() => {
  vi.useFakeTimers()
  editor = new Editor({ extensions: [StarterKit, AiEditEffect], content: "<p>До <strong>старый текст</strong> после.</p>" })
})

afterEach(() => {
  editor.destroy()
  vi.useRealTimers()
})

it("подсвечивает только выделение, не меняет документ и снимает эффект при отмене запроса", () => {
  const doc = editor.state.doc
  const clear = showAiPending(editor, { from: 4, to: 16 })
  expect(editor.view.dom.querySelector("[data-ai-edit=pending]")?.textContent).toBe("старый текст")
  expect(editor.state.doc).toBe(doc)
  clear()
  expect(editor.view.dom.querySelector("[data-ai-edit]")).toBeNull()
})

it("плавно показывает замену на месте прежнего выделения и отменяет её отдельно от набора текста", () => {
  editor.view.dispatch(editor.state.tr.insertText("!", 1))
  const clear = showAiPending(editor, { from: 5, to: 17 })
  editor.commands.setTextSelection(1)
  editor.view.dispatch(revealAiEdit(closeHistory(editor.state.tr).insertText("новый текст", 5, 17)))
  const undo = aiEditUndo(editor)
  clear()
  expect(editor.view.dom.querySelector("[data-ai-edit=pending]")).toBeNull()
  expect(editor.view.dom.querySelector("[data-ai-edit=applied]")?.textContent).toBe("новый текст")
  vi.advanceTimersByTime(700)
  expect(editor.view.dom.querySelector("[data-ai-edit]")).toBeNull()
  expect(undo()).toBe(true)
  expect(editor.getText()).toBe("!До старый текст после.")
})

it("не отменяет последующий ввод по кнопке от предыдущей ИИ-правки", () => {
  editor.view.dispatch(revealAiEdit(closeHistory(editor.state.tr).insertText("новый", 4, 16)))
  const undo = aiEditUndo(editor)
  editor.view.dispatch(editor.state.tr.insertText("!", 1))
  expect(undo()).toBe(false)
  expect(editor.commands.undo()).toBe(true)
  expect(editor.getText()).toBe("До новый после.")
  expect(editor.commands.undo()).toBe(true)
  expect(editor.getText()).toBe("До старый текст после.")
})
