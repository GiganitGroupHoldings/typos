import type { Node } from "@tiptap/pm/model"

const PART_LIMIT = 2700

export interface BoardSourcePart {
  id: number
  text: string
  block: number
  quote: string
}

const normalizeQuote = (text: string) => text.replace(/\s+/g, " ").trim()

function sourceText(node: Node, from: number, to: number): string {
  return node.textBetween(from, to, "\n", (leaf) => {
    const latex: unknown = leaf.attrs.latex
    return typeof latex === "string" ? `$${latex}$` : ""
  })
}

export function noteBoardParts(doc: Node, from = 0, to = doc.content.size): BoardSourcePart[] {
  const parts: BoardSourcePart[] = []
  const wholeNote = from === 0 && to === doc.content.size
  const title = doc.firstChild?.type.name === "heading" && doc.firstChild.attrs.level === 1 ? doc.firstChild : null
  doc.forEach((node, offset, block) => {
    if (offset + node.nodeSize <= from || offset >= to) return
    if (wholeNote && block === 0 && title) return
    const start = Math.max(0, from - offset - 1)
    const end = Math.max(start, Math.min(node.content.size, to - offset - 1))
    const latex: unknown = node.attrs.latex
    let text = (typeof latex === "string" ? `$$${latex}$$` : sourceText(node, start, end)).trim()
    while (text) {
      const before = text.slice(0, PART_LIMIT)
      const boundary = before.search(/\s+\S*$/)
      const size = text.length > PART_LIMIT && boundary > PART_LIMIT / 2 ? boundary : PART_LIMIT
      const part = text.slice(0, size).trim()
      parts.push({ id: parts.length + 1, text: part, block, quote: normalizeQuote(part).slice(0, 100) })
      text = text.slice(size).trimStart()
    }
  })
  // В пустом редакторе первая строка — заголовок, в неё можно ввести короткую цепочку целиком.
  if (!parts.length && wholeNote && title) return noteBoardParts(doc, 1, title.nodeSize - 1)
  return parts
}

/** После правок сначала сверяем исходный блок, затем ищем фрагмент по всему конспекту. */
export function findSourceBlock(doc: Node, block: number, quote: string): number | undefined {
  const matches: number[] = []
  let original: number | undefined
  doc.forEach((node, offset, index) => {
    const latex: unknown = node.attrs.latex
    const text = typeof latex === "string" ? `$$${latex}$$` : sourceText(node, 0, node.content.size)
    if (!normalizeQuote(text).includes(quote)) return
    matches.push(offset)
    if (index === block) original = offset
  })
  return original ?? (matches.length === 1 ? matches[0] : undefined)
}
