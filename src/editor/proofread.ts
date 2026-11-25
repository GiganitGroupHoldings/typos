import { closeHistory } from "@tiptap/pm/history"
import type { Mark, Node } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"
import { z } from "zod"
import { translate } from "@/app/i18n"
import { jsonMessages, readAiJson } from "@/features/ai/readAiJson"

interface Segment {
  id: number
  text: string
  from: number
  marks: readonly Mark[]
}

export interface ProofEdit {
  from: number
  before: string
  after: string
  marks: readonly Mark[]
}

const PROTECTED = /(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s]+|[^\s@]+@[^\s@]+\.[^\s@]+/gi
const NUMBER = /[+−-]?\d+(?:[.,]\d+)*/g

export function proofSegments(doc: Node, from: number, to: number): Segment[] {
  const segments: Segment[] = []
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.spec.code) return false
    if (!node.text || node.marks.some((mark) => mark.type.spec.code)) return
    const start = Math.max(0, from - pos)
    const end = Math.min(node.text.length, to - pos)
    const add = (value: string, offset: number) => {
      const clipped = value.slice(Math.max(0, start - offset), Math.max(0, end - offset))
      if (clipped.trim()) segments.push({ id: segments.length, text: clipped, from: pos + Math.max(start, offset), marks: node.marks })
    }
    let cursor = 0
    for (const hit of node.text.matchAll(PROTECTED)) {
      add(node.text.slice(cursor, hit.index), cursor)
      cursor = hit.index + hit[0].length
    }
    add(node.text.slice(cursor), cursor)
  })
  return segments
}

const response = z.object({
  edits: z.array(z.object({ id: z.number().int(), before: z.string().min(1).max(200), after: z.string().max(200) })).max(100),
})

export function proofMessages(segments: Segment[]) {
  return jsonMessages(
    'Исправляй только явные ошибки орфографии, грамматики и пунктуации, учитывая порядок фрагментов. Сохрани язык, стиль, формулировки, имена, термины и числа. Верни {"edits":[{"id":0,"before":"точный минимальный фрагмент оригинала","after":"замена"}]}. before должен встречаться ровно один раз внутри фрагмента id. Для вставки запятой включи соседнее слово. Не предлагай правки, пересекающие границы фрагментов. При отсутствии ошибок верни {"edits":[]}.',
    segments.map(({ id, text }) => ({ id, text })),
  )
}

export function proofEdits(answer: string, segments: Segment[]): ProofEdit[] {
  const result = response.safeParse(readAiJson(answer))
  if (!result.success) throw new Error(translate("Модель вернула правки в неверном формате. Попробуй ещё раз."))

  const edits: ProofEdit[] = []
  for (const { id, before, after } of result.data.edits) {
    const segment = segments[id]
    if (!segment || before === after || /[\r\n]/.test(after) || after.includes(String.fromCharCode(0))) continue
    if (!after.trim() && before.trim().length > 20) continue
    if (JSON.stringify(before.match(NUMBER)) !== JSON.stringify(after.match(NUMBER))) continue
    const offset = segment.text.indexOf(before)
    if (offset < 0 || segment.text.indexOf(before, offset + 1) >= 0) continue
    const from = segment.from + offset
    if (edits.some((edit) => from < edit.from + edit.before.length && edit.from < from + before.length)) continue
    edits.push({ from, before, after, marks: segment.marks })
  }
  if (!edits.length && result.data.edits.length) throw new Error(translate("Не удалось сопоставить правки с текстом. Попробуй ещё раз."))
  return edits.sort((a, b) => a.from - b.from)
}

/** Одна транзакция сохраняет форматирование и позволяет отменить все выбранные исправления разом. */
export function applyProofEdits(tr: Transaction, edits: ProofEdit[]): Transaction {
  closeHistory(tr)
  for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
    const to = edit.from + edit.before.length
    if (edit.after) tr.replaceWith(edit.from, to, tr.doc.type.schema.text(edit.after, edit.marks))
    else tr.delete(edit.from, to)
  }
  return tr
}
