export type SummaryBlock =
  { kind: "heading"; text: string } | { kind: "paragraph"; text: string } | { kind: "list"; ordered: boolean; items: string[] }

/** Разбирает короткий Markdown ответа в абзацы, заголовки и списки; HTML и вложенность не поддерживаются. */
export function summaryBlocks(markdown: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") })
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    blocks.push({ kind: "list", ...list })
    list = null
  }

  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("```")) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ kind: "heading", text: heading[1] })
      continue
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = bullet ? null : /^\d+[.)]\s+(.*)$/.exec(line)
    const item = bullet ?? numbered
    if (item) {
      flushParagraph()
      const wantOrdered = numbered !== null
      if (!list || list.ordered !== wantOrdered) {
        flushList()
        list = { ordered: wantOrdered, items: [] }
      }
      list.items.push(item[1])
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  return blocks
}
