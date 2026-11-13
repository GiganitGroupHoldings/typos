import type { Note } from "@/types"

const KEY = "typos:present-note:"

export function loadPresentNote(toolId: string): string | null {
  try {
    return localStorage.getItem(KEY + toolId)
  } catch {
    return null
  }
}

export function savePresentNote(toolId: string, noteId: string): void {
  try {
    localStorage.setItem(KEY + toolId, noteId)
  } catch {
    // Приватный режим браузера может запрещать localStorage.
  }
}

/** Выбирает сохранённый конспект, а если его больше нет — самый свежий. */
export function pickPresentNote(notes: Note[], storedId?: string | null): Note | undefined {
  return notes.find((n) => n.id === storedId) ?? notes[0]
}
