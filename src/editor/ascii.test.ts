import { Editor } from "@tiptap/core"
import { expect, it } from "vitest"
import { buildExtensions } from "./extensions"

it("```ascii остаётся блоком кода с языком и сохраняется как был", () => {
  const md = "# Кот\n\n```ascii\n /\\_/\\\n( o.o )\n > ^ <\n```"
  const editor = new Editor({ extensions: buildExtensions(), content: md, contentType: "markdown" })
  const block = editor.state.doc.child(1)
  expect(block.type.name).toBe("codeBlock")
  expect(block.attrs.language).toBe("ascii")
  expect(editor.getMarkdown().trim()).toBe(md)
  editor.destroy()
})

it("несколько кадров и директива fps переживают сохранение", () => {
  const md = "```ascii\n@fps 12\n /\\\n/  \\\n---\n /\\\n/__\\\n```"
  const editor = new Editor({ extensions: buildExtensions(), content: md, contentType: "markdown" })
  expect(editor.getMarkdown().trim()).toBe(md)
  editor.destroy()
})

it("рисунок вставляется блоком кода с языком ascii", () => {
  const editor = new Editor({ extensions: buildExtensions(), content: "<p></p>" })
  editor
    .chain()
    .insertContent({ type: "codeBlock", attrs: { language: "ascii" }, content: [{ type: "text", text: "(o o)" }] })
    .run()
  expect(editor.state.doc.firstChild?.attrs.language).toBe("ascii")
  expect(editor.getMarkdown().trim()).toBe("```ascii\n(o o)\n```")
  editor.destroy()
})
