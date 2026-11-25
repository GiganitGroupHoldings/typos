import type { Subject } from "@/types"

export const folderHref = (id: string) => `/s/${encodeURIComponent(id)}`

const fold = (name: string) => name.normalize("NFC").trim().toLocaleLowerCase("ru")

/** Короткое имя ищется рядом с текущим конспектом, полный путь начинается с корневой папки. */
export function resolveFolderLink(subjects: Subject[], currentId: string, label: string): Subject | undefined {
  const names = label.split("/").map(fold)
  const byId = new Map(subjects.map((s) => [s.id, s]))
  if (names.length > 1) {
    let parent: Subject | undefined
    for (const name of names) {
      parent = subjects.find((s) => s.parentId === parent?.id && fold(s.name) === name)
      if (!parent) return
    }
    return parent
  }

  const matches = subjects.filter((s) => fold(s.name) === names[0])
  for (let folder = byId.get(currentId); folder; folder = folder.parentId ? byId.get(folder.parentId) : undefined) {
    const child = matches.find((s) => s.parentId === folder?.id)
    if (child) return child
    if (fold(folder.name) === names[0]) return folder
  }
  if (matches.length === 1) return matches[0]
}
