import { Extension, type Editor } from "@tiptap/core"
import { closeHistory, undoDepth } from "@tiptap/pm/history"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

interface Range {
  from: number
  to: number
}

interface Effect {
  phase: "pending" | "applied"
  ranges: Range[]
}

const effectKey = new PluginKey<Effect | null>("aiEditEffect")
const REVEAL_MS = 680

export const AiEditEffect = Extension.create({
  name: "aiEditEffect",
  addProseMirrorPlugins() {
    return [
      new Plugin<Effect | null>({
        key: effectKey,
        state: {
          init: () => null,
          apply(tr, previous) {
            const next: Effect | null | undefined = tr.getMeta(effectKey)
            if (next !== undefined) return next
            if (!tr.docChanged) return previous
            // Редактор может нормализовать вставку, например превратить LaTeX в узел формулы.
            const initial: Transaction | undefined = tr.getMeta("appendedTransaction")
            if (previous?.phase !== "applied" || !initial?.getMeta(effectKey)) return null
            const ranges = previous.ranges
              .map(({ from, to }) => ({ from: tr.mapping.map(from, -1), to: tr.mapping.map(to, 1) }))
              .filter(({ from, to }) => from < to)
            return ranges.length ? { ...previous, ranges } : null
          },
        },
        props: {
          decorations(state) {
            const effect = effectKey.getState(state)
            if (!effect?.ranges.length) return null
            const attributes = { class: `ai-edit-${effect.phase}`, "data-ai-edit": effect.phase }
            return DecorationSet.create(
              state.doc,
              effect.ranges.map(({ from, to }) => Decoration.inline(from, to, attributes)),
            )
          },
        },
        view() {
          let shown: Effect | null | undefined
          let timer: ReturnType<typeof setTimeout> | undefined
          return {
            update(view) {
              const effect = effectKey.getState(view.state)
              if (effect === shown) return
              clearTimeout(timer)
              shown = effect
              if (effect?.phase === "applied") {
                timer = setTimeout(() => view.dispatch(view.state.tr.setMeta(effectKey, null)), REVEAL_MS)
              }
            },
            destroy() {
              clearTimeout(timer)
            },
          }
        },
      }),
    ]
  },
})

/** У эффекта ожидания свой объект, чтобы завершение запроса не сняло подсветку уже вставленного текста. */
export function showAiPending(editor: Editor, range: Range): () => void {
  const effect: Effect = { phase: "pending", ranges: [range] }
  editor.view.dispatch(editor.state.tr.setMeta(effectKey, effect))
  return () => {
    if (!editor.isDestroyed && effectKey.getState(editor.state) === effect) {
      editor.view.dispatch(editor.state.tr.setMeta(effectKey, null))
    }
  }
}

/** Берём координаты вставок из транзакции, в том числе для правок в разных абзацах. */
export function revealAiEdit(tr: Transaction): Transaction {
  const ranges: Range[] = []
  tr.mapping.maps.forEach((map, index) => {
    const rest = tr.mapping.slice(index + 1)
    map.forEach((_from, _to, start, end) => {
      if (start === end) return
      const from = rest.map(start, 1)
      const to = rest.map(end, -1)
      if (from < to) ranges.push({ from, to })
    })
  })
  return tr.setMeta(effectKey, ranges.length ? ({ phase: "applied", ranges } satisfies Effect) : null)
}

/** Кнопка в уведомлении относится к конкретной записи в истории. */
export function aiEditUndo(editor: Editor): () => boolean {
  const { doc } = editor.state
  const depth = undoDepth(editor.state)
  editor.view.dispatch(closeHistory(editor.state.tr))
  return () => !editor.isDestroyed && depth > 0 && editor.state.doc === doc && undoDepth(editor.state) === depth && editor.commands.undo()
}
