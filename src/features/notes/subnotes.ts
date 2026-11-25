import type { Note } from "@/types"

export const noteHref = ({ subjectId, id }: Pick<Note, "subjectId" | "id">) =>
  `/s/${encodeURIComponent(subjectId)}/n/${encodeURIComponent(id)}`

const titleKey = (title: string) => title.normalize("NFC").trim().toLocaleLowerCase("ru")

export function resolveNoteLink(notes: Note[], current: Note, title: string) {
  const matching = notes.filter((n) => n.subjectId === current.subjectId && n.id !== current.id && titleKey(n.title) === titleKey(title))
  const children = matching.filter((n) => n.meta.parentNoteId === current.id)
  return children.length === 1 ? children[0] : matching.length === 1 ? matching[0] : undefined
}

export function noteBranches(notes: Note[]) {
  const byId = new Map(notes.map((note) => [note.id, note]))
  const parents = new Map<string, Note[]>()
  const roots: Note[] = []
  for (const note of notes) {
    const parent = byId.get(note.meta.parentNoteId)
    const visited = new Set([note.id])
    let ancestor = parent
    while (ancestor?.subjectId === note.subjectId && !visited.has(ancestor.id)) {
      visited.add(ancestor.id)
      ancestor = byId.get(ancestor.meta.parentNoteId)
    }
    // Если родитель в корзине или метаданные образуют цикл, конспект остаётся доступным.
    if (!parent || ancestor) {
      roots.push(note)
      continue
    }
    const children = parents.get(parent.id) ?? []
    children.push(note)
    parents.set(parent.id, children)
  }
  const rank = (note: Note) => (Number.isFinite(Number(note.meta.subnoteOrder)) ? Number(note.meta.subnoteOrder) : Number.MAX_SAFE_INTEGER)
  for (const children of parents.values()) children.sort((a, b) => rank(a) - rank(b) || a.created.localeCompare(b.created))
  return { roots, parents }
}
