export const NOTE_SIZES = ["s", "m", "l"] as const

export type NoteSize = (typeof NOTE_SIZES)[number]

export const NOTE_SIZE_LABELS: Record<NoteSize, string> = {
  s: "Мелкий",
  m: "Обычный",
  l: "Крупный",
}

const SCALE: Record<NoteSize, number> = { s: 0.94, m: 1, l: 1.12 }

export const isNoteSize = (value: unknown): value is NoteSize =>
  typeof value === "string" && (NOTE_SIZES as readonly string[]).includes(value)

export const normalizeNoteSize = (value: unknown): NoteSize => (isNoteSize(value) ? value : "m")

export const noteScale = (size: NoteSize): number => SCALE[size]
