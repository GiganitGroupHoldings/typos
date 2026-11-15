import "fake-indexeddb/auto"
import { del, get } from "idb-keyval"
import { beforeEach, expect, it } from "vitest"
import { useUi } from "@/app/store"
import { useAsciiBackdrop, type AsciiBackground } from "@/features/ascii/backdropStore"
import { readPresets, useBackdropPresets } from "./presetStore"

const art: AsciiBackground = {
  id: "art",
  source: { kind: "text", text: "#\n#" },
  rect: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
  detail: 50,
  contrast: 100,
  contrastEnabled: false,
}

beforeEach(async () => {
  await del("typos-background-presets")
  await del("typos-ascii-background")
  useBackdropPresets.setState({ presets: [] })
  useAsciiBackdrop.setState({ items: [] })
  useUi.setState({ backdrop: "nebula", bgColor: null })
})

it("сохраняет аски-рисунок и возвращает его вместе с фоном", async () => {
  useUi.setState({ backdrop: "ascii", bgColor: "#123456" })
  await useAsciiBackdrop.getState().replace([art])
  await useBackdropPresets.getState().save("  Вечер  ")
  const [preset] = useBackdropPresets.getState().presets
  expect(preset).toMatchObject({ name: "Вечер", backdrop: "ascii", bgColor: "#123456" })
  expect(preset.ascii).toEqual([art])
  expect(await get("typos-background-presets")).toEqual([preset])

  useUi.setState({ backdrop: "metal", bgColor: null })
  await useAsciiBackdrop.getState().replace([])
  expect(useAsciiBackdrop.getState().items).toEqual([])

  await useBackdropPresets.getState().apply(preset.id)
  expect(useUi.getState()).toMatchObject({ backdrop: "ascii", bgColor: "#123456" })
  expect(useAsciiBackdrop.getState().items).toEqual([art])
})

it("не трогает аски-рисунок, если пресет сохранён без него", async () => {
  useUi.setState({ backdrop: "metal", bgColor: "#111111" })
  await useBackdropPresets.getState().save("Металл")
  const [preset] = useBackdropPresets.getState().presets
  expect(preset.ascii).toBeNull()

  await useAsciiBackdrop.getState().replace([art])
  await useBackdropPresets.getState().apply(preset.id)
  expect(useUi.getState()).toMatchObject({ backdrop: "metal", bgColor: "#111111" })
  expect(useAsciiBackdrop.getState().items).toEqual([art])
})

it("обновляет пресет с тем же названием, удаляет и держит лимит", async () => {
  await useBackdropPresets.getState().save("Утро")
  const id = useBackdropPresets.getState().presets[0].id
  useUi.setState({ backdrop: "metal" })
  await useBackdropPresets.getState().save("утро")
  expect(useBackdropPresets.getState().presets).toHaveLength(1)
  expect(useBackdropPresets.getState().presets[0]).toMatchObject({ id, backdrop: "metal" })

  for (let index = 0; index < 15; index++) await useBackdropPresets.getState().save(`Фон ${index}`)
  expect(useBackdropPresets.getState().presets).toHaveLength(12)

  await useBackdropPresets.getState().remove(id)
  expect(useBackdropPresets.getState().presets.some((item) => item.id === id)).toBe(false)
})

it("отбрасывает битые пресеты из сохранённых данных", () => {
  const presets = readPresets([
    { id: "a", name: "Ночь", backdrop: "metal", bgColor: "#111111", ascii: null },
    { id: "a", name: "Дубль", backdrop: "nebula", bgColor: null },
    { id: "b", name: "Плохой фон", backdrop: "hologram", bgColor: null },
    { id: "c", name: "Без цвета", backdrop: "ascii", ascii: [art, { id: "broken" }] },
    { id: "d", name: "Кривой цвет", backdrop: "ascii", bgColor: "url(x)" },
    null,
  ])
  expect(presets).toHaveLength(2)
  expect(presets[0]).toMatchObject({ id: "a", name: "Ночь", backdrop: "metal", bgColor: "#111111", ascii: null })
  expect(presets[1]).toMatchObject({ id: "c", name: "Без цвета", backdrop: "ascii", bgColor: null })
  expect(presets[1].ascii).toMatchObject([art])
})
