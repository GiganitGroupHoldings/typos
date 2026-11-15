import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import type { ViewMutationRecord } from "@tiptap/pm/view"
import { mountAsciiArt } from "@/features/ascii/player"

interface Options {
  node: PMNode
  editor: Editor
  getPos: () => number | undefined
  prefix: string
}

/** Блок ```ascii: рисует кадры на canvas, исходник открывается по клику. */
export function asciiNodeView({ node, editor, getPos, prefix }: Options) {
  const dom = document.createElement("div")
  dom.className = "ascii-block"
  const view = document.createElement("div")
  view.className = "ascii-view"
  view.contentEditable = "false"
  const pre = document.createElement("pre")
  const code = document.createElement("code")
  code.className = `${prefix}ascii`
  pre.append(code)
  dom.append(view, pre)

  let current = node
  let inside = false
  let valid = true
  let timer = 0
  const player = mountAsciiArt(view, node.textContent)

  const sync = () => dom.toggleAttribute("data-editing", inside || !valid)
  const apply = () => {
    valid = player.update(current.textContent)
    sync()
  }

  const openCode = (event: MouseEvent) => {
    event.preventDefault()
    const pos = getPos()
    if (pos === undefined || !editor.isEditable) return
    inside = true
    sync()
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 1 + current.content.size)
      .run()
  }
  view.addEventListener("mousedown", openCode)

  const onSelection = () => {
    const pos = getPos()
    if (pos === undefined) return
    const { from, to } = editor.state.selection
    const now = from > pos && to < pos + current.nodeSize
    if (now !== inside) {
      inside = now
      sync()
    }
  }
  editor.on("selectionUpdate", onSelection)

  apply()

  return {
    dom,
    contentDOM: code,
    update(next: PMNode) {
      if (next.type !== current.type || next.attrs.language !== "ascii") return false
      const changed = next.textContent !== current.textContent
      current = next
      if (changed) {
        clearTimeout(timer)
        timer = window.setTimeout(apply, 250)
      }
      return true
    },
    ignoreMutation: (m: ViewMutationRecord) =>
      m.type !== "selection" && (!code.contains(m.target as Node) || (m.type === "attributes" && m.target === code)),
    stopEvent: (event: Event) => view.contains(event.target as Node),
    destroy() {
      view.removeEventListener("mousedown", openCode)
      editor.off("selectionUpdate", onSelection)
      clearTimeout(timer)
      player.destroy()
    },
  }
}
