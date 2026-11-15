import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { accentFromHex } from "@/lib/accentColor"
import { useAccentSync } from "./accent"
import { useUi } from "./store"
import { useThemeSync } from "./theme"
import { normalizeZoom, zoomShortcut } from "./zoomValue"

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)

afterEach(() => {
  useUi.setState({
    responsiveAccent: true,
    fixedAccent: "#5078d4",
    desktopZoom: 100,
    backdrop: "nebula",
    bgColor: null,
  })
  vi.unstubAllGlobals()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
})

it("сохраняет настройки и восстанавливает старые предпочтения без потери темы", async () => {
  useUi.getState().setTheme("dark")
  useUi.getState().setFixedAccent("#12ab34")
  useUi.getState().setResponsiveAccent(false)
  useUi.getState().setDesktopZoom(140)
  await useUi.persist.rehydrate()
  expect(useUi.getState()).toMatchObject({ theme: "dark", fixedAccent: "#12ab34", responsiveAccent: false, desktopZoom: 140 })
  localStorage.setItem("studynotes-ui", JSON.stringify({ version: 1, state: { theme: "system", backdrop: "metal", noteFont: "serif" } }))
  await useUi.persist.rehydrate()
  expect(useUi.getState()).toMatchObject({
    theme: "system",
    backdrop: "metal",
    noteFont: "serif",
    responsiveAccent: true,
    fixedAccent: "#5078d4",
    desktopZoom: 100,
  })
})

it("отклоняет неверный цвет и ограничивает масштаб при восстановлении", async () => {
  useUi.getState().setFixedAccent("url(https://example.com)")
  expect(useUi.getState().fixedAccent).toBe("#5078d4")
  localStorage.setItem("studynotes-ui", JSON.stringify({ version: 1, state: { fixedAccent: "bad", desktopZoom: 999 } }))
  await useUi.persist.rehydrate()
  expect(useUi.getState()).toMatchObject({ fixedAccent: "#5078d4", desktopZoom: 200 })
  expect(normalizeZoom(NaN)).toBe(100)
  expect(normalizeZoom(1)).toBe(50)
})

it("хранит цвет фона и восстанавливает режим аски из старых настроек", async () => {
  useUi.getState().setBgColor("#1A2B3C")
  expect(useUi.getState().bgColor).toBe("#1a2b3c")
  useUi.getState().setBgColor("не цвет")
  expect(useUi.getState().bgColor).toBe("#1a2b3c")
  useUi.getState().setBgColor(null)
  expect(useUi.getState().bgColor).toBeNull()

  localStorage.setItem(
    "studynotes-ui",
    JSON.stringify({ version: 2, state: { bgColor: "#12AB34", asciiPattern: "orbit", backdrop: "ascii" } }),
  )
  await useUi.persist.rehydrate()
  expect(useUi.getState()).toMatchObject({ bgColor: "#12ab34", backdrop: "ascii" })

  localStorage.setItem(
    "studynotes-ui",
    JSON.stringify({ version: 2, state: { bgColor: "url(x)", asciiPattern: "noise", backdrop: "nope" } }),
  )
  await useUi.persist.rehydrate()
  expect(useUi.getState()).toMatchObject({ bgColor: null, backdrop: "nebula" })
})

it("выбранный цвет фона попадает в переменную --app-bg и снимается при возврате к теме", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const host = document.createElement("div")
  const root = createRoot(host)
  function Sync() {
    useThemeSync()
    return null
  }
  try {
    useUi.getState().setBgColor("#123456")
    await act(async () => root.render(createElement(Sync)))
    expect(document.documentElement.style.getPropertyValue("--app-bg")).toBe("#123456")
    await act(async () => useUi.getState().setBgColor(null))
    expect(document.documentElement.style.getPropertyValue("--app-bg")).toBe("")
  } finally {
    await act(async () => root.unmount())
  }
})

it("фиксированный акцент сохраняется при переходах и снова следует предмету после включения", async () => {
  const host = document.createElement("div")
  const root = createRoot(host)
  function Accent({ color }: { color?: "red" | "blue" }) {
    useAccentSync(color)
    return null
  }
  try {
    await act(async () => root.render(createElement(Accent, { color: "red" })))
    expect(document.documentElement.dataset.accent).toBe("red")
    await act(async () => {
      useUi.getState().setResponsiveAccent(false)
      useUi.getState().setFixedAccent("#888888")
    })
    expect(document.documentElement.dataset.accent).toBe("#888888")
    await act(async () => root.render(createElement(Accent, { color: "blue" })))
    expect(document.documentElement.dataset.accent).toBe("#888888")
    await act(async () => root.render(createElement(Accent)))
    expect(document.documentElement.dataset.accent).toBe("#888888")
    expect(accentFromHex("#888888").chroma).toBeLessThan(0.001)
    await act(async () => useUi.getState().setResponsiveAccent(true))
    expect(document.documentElement.dataset.accent).toBe("neutral")
    expect(useUi.getState().fixedAccent).toBe("#888888")
  } finally {
    await act(async () => root.unmount())
  }
})

it("клавиши масштаба работают на основной и цифровой клавиатуре", () => {
  const key = { ctrlKey: true, metaKey: false, altKey: false }
  for (const code of ["Equal", "NumpadAdd"]) expect(zoomShortcut({ ...key, code }, 100)).toBe(110)
  for (const code of ["Minus", "NumpadSubtract"]) expect(zoomShortcut({ ...key, code }, 100)).toBe(90)
  for (const code of ["Digit0", "Numpad0"]) expect(zoomShortcut({ ...key, code }, 180)).toBe(100)
  expect(zoomShortcut({ ...key, code: "Equal" }, 200)).toBe(200)
  expect(zoomShortcut({ ...key, ctrlKey: false, code: "Equal" }, 100)).toBeUndefined()
})
