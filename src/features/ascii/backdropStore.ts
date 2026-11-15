import { delMany, getMany, setMany } from "idb-keyval"
import { create } from "zustand"
import { genId } from "@/vault/format"
import { overlaps } from "./backdropLayout"
import { parseAsciiArt } from "./format"
import { clampRect, DEFAULT_CONTRAST, DEFAULT_DETAIL, normalizeContrast, normalizeDetail, type AsciiRect } from "./photo"

export type AsciiSource = { kind: "photo" | "video" | "gif"; blob: Blob } | { kind: "text"; text: string }

export interface AsciiBackground {
  id: string
  source: AsciiSource
  rect: AsciiRect
  detail: number
  contrast: number
  contrastEnabled: boolean
  removeBackground?: boolean
}

export interface BackdropDraft {
  id?: string
  source: AsciiSource | null
  rect?: AsciiRect
  detail?: number
  contrast?: number
  contrastEnabled?: boolean
  removeBackground?: boolean
}

const KEY = "typos-ascii-background"
const LEGACY_BLOB = "typos-ascii-photo"
const LEGACY_RECT = "typos-ascii-photo-rect"

function readRect(value: unknown): AsciiRect | null {
  if (!value || typeof value !== "object") return null
  const rect = value as AsciiRect
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) return null
  return clampRect(rect)
}

export function readBackground(value: unknown): AsciiBackground | null {
  if (!value || typeof value !== "object") return null
  const { id, source, rect: storedRect, detail, contrast, contrastEnabled, removeBackground } = value as Partial<AsciiBackground>
  const rect = readRect(storedRect)
  if (!rect || !source) return null
  if (source.kind === "text") {
    if (typeof source.text !== "string" || !parseAsciiArt(source.text).ok) return null
  } else if ((source.kind !== "photo" && source.kind !== "video" && source.kind !== "gif") || !(source.blob instanceof Blob)) return null
  const savedContrast = normalizeContrast(contrast)
  return {
    id: typeof id === "string" && id ? id : genId(),
    source,
    rect,
    detail: normalizeDetail(detail),
    contrast: savedContrast,
    contrastEnabled:
      source.kind !== "text" && (typeof contrastEnabled === "boolean" ? contrastEnabled : savedContrast !== DEFAULT_CONTRAST),
    removeBackground: source.kind === "photo" && removeBackground === true,
  }
}

interface AsciiBackdropState {
  items: AsciiBackground[]
  load: () => Promise<void>
  save: (background: AsciiBackground) => Promise<void>
  remove: (id: string) => Promise<void>
  replace: (items: AsciiBackground[]) => Promise<void>
}

export const useAsciiBackdrop = create<AsciiBackdropState>((set, state) => {
  let loadTask: Promise<void> | undefined
  let writes = Promise.resolve()
  const load = () =>
    (loadTask ??= (async () => {
      const [saved, blob, storedRect] = await getMany<unknown>([KEY, LEGACY_BLOB, LEGACY_RECT])
      if (saved !== undefined) {
        const items: AsciiBackground[] = []
        for (const entry of Array.isArray(saved) ? saved : [saved]) {
          const item = readBackground(entry)
          if (item && !items.some((other) => other.id === item.id || overlaps(item.rect, other.rect))) items.push(item)
        }
        set({ items })
        return
      }
      const rect = readRect(storedRect)
      if (blob instanceof Blob && rect) {
        set({
          items: [
            {
              id: genId(),
              source: { kind: "photo", blob },
              rect,
              detail: DEFAULT_DETAIL,
              contrast: DEFAULT_CONTRAST,
              contrastEnabled: false,
            },
          ],
        })
      }
    })().catch(() => {}))

  const change = (update: (items: AsciiBackground[]) => AsciiBackground[]) => {
    const write = writes.then(async () => {
      await load()
      const items = update(state().items)
      if (items.length)
        await setMany([
          [KEY, items],
          [LEGACY_BLOB, null],
          [LEGACY_RECT, null],
        ])
      else await delMany([KEY, LEGACY_BLOB, LEGACY_RECT])
      set({ items })
    })
    writes = write.catch(() => {})
    return write
  }

  return {
    items: [],
    load,
    save: (background) =>
      change((items) => {
        if (items.some((item) => item.id !== background.id && overlaps(item.rect, background.rect))) {
          throw new Error("Элементы ASCII-фона пересекаются — сдвинь один из них.")
        }
        return items.some((item) => item.id === background.id)
          ? items.map((item) => (item.id === background.id ? background : item))
          : [...items, background]
      }),
    remove: (id) => change((items) => items.filter((item) => item.id !== id)),
    replace: (items) => change(() => items),
  }
})

interface BackdropEditorState {
  draft: BackdropDraft | null
  open: (draft: BackdropDraft) => void
  close: () => void
}

export const useBackdropEditor = create<BackdropEditorState>((set) => ({
  draft: null,
  open: (draft) => set({ draft }),
  close: () => set({ draft: null }),
}))
