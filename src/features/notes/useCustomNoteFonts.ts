import { get, update } from "idb-keyval"
import { useEffect, useState } from "react"
import { translate } from "@/app/i18n"
import { useUi } from "@/app/store"
import { NOTE_FONTS } from "@/lib/noteFonts"

const KEY = "typos-note-fonts"
const EXT = /\.(woff2?|ttf|otf)$/i

interface LocalFont {
  id: `custom-${string}`
  name: string
  data: ArrayBuffer
}

export function useCustomNoteFonts() {
  const font = useUi((s) => s.noteFont)
  const setFont = useUi((s) => s.setNoteFont)
  const [fonts, setFonts] = useState<LocalFont[]>([])

  useEffect(() => {
    let active = true
    void get<LocalFont[]>(KEY).then(
      (saved) => active && setFonts(saved ?? []),
      () => {},
    )
    return () => {
      active = false
    }
  }, [])

  const selected = fonts.find((entry) => entry.id === font)
  useEffect(() => {
    if (!selected) return
    const face = new FontFace(selected.id, selected.data)
    let active = true
    void face.load().then(
      (loaded) => {
        if (active) document.fonts.add(loaded)
      },
      () => {},
    )
    return () => {
      active = false
      document.fonts.delete(face)
    }
  }, [selected])

  async function changeFonts(change: (saved: LocalFont[]) => LocalFont[]) {
    let next: LocalFont[] = []
    await update<LocalFont[]>(KEY, (saved) => (next = change(saved ?? [])))
    setFonts(next)
  }

  async function importFont(file: File) {
    if (!EXT.test(file.name) || !file.size || file.size > 10 * 1024 * 1024) {
      throw new Error(translate("Выбери файл .ttf, .otf, .woff или .woff2 до 10 МБ."))
    }
    const id = `custom-${crypto.randomUUID()}` as const
    const data = await file.arrayBuffer()
    try {
      await new FontFace(id, data).load()
    } catch {
      throw new Error(translate("Не удалось прочитать файл шрифта. Попробуй другой файл."))
    }
    await changeFonts((saved) => [...saved, { id, name: file.name.replace(EXT, "") || file.name, data }])
    setFont(id)
  }

  async function removeFont(id: LocalFont["id"]) {
    await changeFonts((saved) => saved.filter((entry) => entry.id !== id))
    if (useUi.getState().noteFont === id) setFont("inter")
  }

  const preset = Object.hasOwn(NOTE_FONTS, font) ? NOTE_FONTS[font as keyof typeof NOTE_FONTS] : NOTE_FONTS.inter
  const family = selected ? `"${selected.id}", var(--font-sans)` : preset.family
  return { fonts, selected, family, importFont, removeFont }
}
