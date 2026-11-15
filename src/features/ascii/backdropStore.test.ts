import "fake-indexeddb/auto"
import { Blob } from "node:buffer"
import { get, setMany } from "idb-keyval"
import { expect, it, vi } from "vitest"
import { useAsciiBackdrop } from "./backdropStore"

it("восстанавливает прежнее фото, добавляет и удаляет элементы по одному", async () => {
  vi.stubGlobal("Blob", Blob)
  try {
    const rect = { x: 0.1, y: 0.2, w: 0.4, h: 0.5 }
    const blob = new Blob(["фото"], { type: "image/png" })
    await setMany([
      ["typos-ascii-photo", blob],
      ["typos-ascii-photo-rect", rect],
    ])
    await useAsciiBackdrop.getState().load()
    const store = useAsciiBackdrop.getState
    const [photo] = store().items
    expect(photo).toMatchObject({ source: { kind: "photo" }, rect, detail: 50, contrast: 100, contrastEnabled: false })

    const source = { kind: "text", text: "@fps 3\n  a\n---\n  b" } as const
    const item = { id: "art", source, rect: { ...rect, x: 0.55 }, detail: 80, contrast: 160, contrastEnabled: false }
    await expect(store().save({ ...item, rect })).rejects.toThrow("пересекаются")
    await store().save(item)
    expect(await get("typos-ascii-background")).toEqual([photo, item])
    expect(await get("typos-ascii-photo")).toBeNull()

    await store().remove(photo.id)
    expect(store().items).toEqual([item])
    await store().remove(item.id)
    expect(store().items).toEqual([])
    expect(await get("typos-ascii-background")).toBeUndefined()
  } finally {
    vi.unstubAllGlobals()
  }
})
