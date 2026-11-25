export const NOTE_FONTS = {
  inter: { name: "Inter", family: "var(--font-sans)" },
  golos: { name: "Golos Text", family: '"Golos Text Variable", var(--font-sans)' },
  serif: { name: "PT Serif", family: "var(--font-serif)" },
  mono: { name: "JetBrains Mono", family: "var(--font-mono)" },
  unbounded: { name: "Unbounded", family: '"Unbounded Variable", var(--font-sans)' },
  system: { name: "System UI", family: "system-ui, var(--font-sans)" },
  georgia: { name: "Georgia", family: "Georgia, var(--font-serif)" },
  times: { name: "Times New Roman", family: '"Times New Roman", var(--font-serif)' },
  arial: { name: "Arial", family: "Arial, var(--font-sans)" },
  verdana: { name: "Verdana", family: "Verdana, var(--font-sans)" },
}

export type NoteFont = keyof typeof NOTE_FONTS | `custom-${string}`

export function normalizeNoteFont(value: unknown): NoteFont {
  return typeof value === "string" && (Object.hasOwn(NOTE_FONTS, value) || /^custom-[a-f0-9-]{36}$/.test(value))
    ? (value as NoteFont)
    : "inter"
}
