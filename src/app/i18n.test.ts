import { afterEach, expect, it } from "vitest"
import { fileSize, plural } from "@/lib/format"
import { getLanguage, translate } from "./i18n"
import { useUi } from "./store"

afterEach(() => {
  useUi.getState().setLanguage("ru")
})

it("сохраняет язык интерфейса между запусками и открывает старые настройки на русском", async () => {
  useUi.getState().setLanguage("en")
  const key = "studynotes-ui"
  const saved = localStorage.getItem(key)
  expect(saved).toBeTruthy()
  useUi.getState().setLanguage("ru")
  localStorage.setItem(key, saved!)
  await useUi.persist.rehydrate()
  expect(getLanguage()).toBe("en")
  expect(translate("Настройки")).toBe("Settings")

  localStorage.setItem(key, JSON.stringify({ version: 2, state: { theme: "dark" } }))
  await useUi.persist.rehydrate()
  expect(getLanguage()).toBe("ru")
  expect(useUi.getState().theme).toBe("dark")
})

it("переводит сообщения с подстановками, числа и единицы измерения", () => {
  useUi.getState().setLanguage("en")
  expect(translate("Доска «{0}»", "Мой план {0}")).toBe("Board “Мой план {0}”")
  expect(plural(21, ["предмет", "предмета", "предметов"])).toBe("21 subjects")
  expect(fileSize(1536)).toBe("1.5 KB")
  useUi.getState().setLanguage("ru")
  expect(plural(21, ["предмет", "предмета", "предметов"])).toBe("21 предмет")
  expect(fileSize(1536)).toBe("1,5 КБ")
})
