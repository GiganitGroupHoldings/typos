import { del, get, set as setStored } from "idb-keyval"
import { create } from "zustand"
import { useUi, type Backdrop } from "@/app/store"
import { readBackground, useAsciiBackdrop, type AsciiBackground, type AsciiSource } from "@/features/ascii/backdropStore"
import { genId } from "@/vault/format"

const KEY = "typos-background-presets"
const MAX_PRESETS = 12

export interface BackdropPreset {
  id: string
  name: string
  backdrop: Backdrop
  bgColor: string | null
  /** Снимок ASCII-рисунков; null — пресет сохранён не в режиме «Аски». */
  ascii: AsciiBackground[] | null
}

function readColor(value: unknown): string | null | undefined {
  if (value == null) return null
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined
}

/** Проверяет сохранённые пресеты, чтобы битая запись не ломала настройки. */
export function readPresets(value: unknown): BackdropPreset[] {
  if (!Array.isArray(value)) return []
  const presets: BackdropPreset[] = []
  for (const entry of value) {
    const preset = entry as Partial<BackdropPreset>
    if (!preset || typeof preset.id !== "string" || typeof preset.name !== "string" || !preset.name.trim()) continue
    if (preset.backdrop !== "nebula" && preset.backdrop !== "metal" && preset.backdrop !== "ascii") continue
    const bgColor = readColor(preset.bgColor)
    if (bgColor === undefined) continue
    if (presets.some((other) => other.id === preset.id)) continue
    const ascii = Array.isArray(preset.ascii)
      ? preset.ascii.map(readBackground).filter((item): item is AsciiBackground => item !== null)
      : null
    presets.push({
      id: preset.id.slice(0, 80),
      name: preset.name.trim().slice(0, 40),
      backdrop: preset.backdrop,
      bgColor,
      ascii,
    })
    if (presets.length >= MAX_PRESETS) break
  }
  return presets
}

function snapshot(items: AsciiBackground[]): AsciiBackground[] {
  return items.map((item) => ({ ...item, source: { ...item.source } as AsciiSource, rect: { ...item.rect } }))
}

interface PresetState {
  presets: BackdropPreset[]
  load: () => Promise<void>
  save: (name: string) => Promise<void>
  apply: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useBackdropPresets = create<PresetState>((set, state) => {
  let loadTask: Promise<void> | undefined
  let writes = Promise.resolve()

  const load = () =>
    (loadTask ??= (async () => {
      set({ presets: readPresets(await get<unknown>(KEY)) })
    })().catch(() => {}))

  const write = (update: (presets: BackdropPreset[]) => BackdropPreset[]) => {
    const task = writes.then(async () => {
      await load()
      const presets = update(state().presets)
      if (presets.length) await setStored(KEY, presets)
      else await del(KEY)
      set({ presets })
    })
    writes = task.catch(() => {})
    return task
  }

  return {
    presets: [],
    load,
    save: async (name) => {
      const trimmed = name.trim().slice(0, 40)
      if (!trimmed) return
      // Элементы ASCII-фона лежат в IndexedDB: снимок делаем по загруженным данным.
      await useAsciiBackdrop.getState().load()
      await write((presets) => {
        const ui = useUi.getState()
        const existing = presets.find((item) => item.name.toLowerCase() === trimmed.toLowerCase())
        const preset: BackdropPreset = {
          id: existing?.id ?? genId(),
          name: trimmed,
          backdrop: ui.backdrop,
          bgColor: ui.bgColor,
          ascii: ui.backdrop === "ascii" ? snapshot(useAsciiBackdrop.getState().items) : null,
        }
        return [preset, ...presets.filter((item) => item.id !== preset.id)].slice(0, MAX_PRESETS)
      })
    },
    apply: async (id) => {
      await load()
      const preset = state().presets.find((item) => item.id === id)
      if (!preset) return
      // Сначала рисунки, потом режим: иначе «Аски» на миг откроется пустым.
      if (preset.ascii) await useAsciiBackdrop.getState().replace(snapshot(preset.ascii))
      useUi.setState({ backdrop: preset.backdrop, bgColor: preset.bgColor })
    },
    remove: (id) => write((presets) => presets.filter((item) => item.id !== id)),
  }
})
