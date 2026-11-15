import { beforeEach, expect, it, vi } from "vitest"
import { clearAiKey, loadAiKey, saveAiKey } from "./keyStore"

const env = vi.hoisted(() => ({ tauri: false }))
const invoke = vi.hoisted(() => vi.fn())

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => env.tauri, invoke }))

beforeEach(() => {
  env.tauri = false
  invoke.mockReset()
  localStorage.clear()
})

it("в браузере хранит ключ локально", async () => {
  await saveAiKey("  abc  ")
  expect(localStorage.getItem("typos-ai-key")).toBe("abc")
  expect(await loadAiKey()).toBe("abc")
  await clearAiKey()
  expect(await loadAiKey()).toBeNull()
})

it("на компьютере не пишет ключ в localStorage", async () => {
  env.tauri = true
  invoke.mockResolvedValue(undefined)
  await saveAiKey("abc")
  expect(invoke).toHaveBeenCalledWith("ai_key_set", { key: "abc" })
  expect(localStorage.getItem("typos-ai-key")).toBeNull()
})

it("читает и удаляет ключ через системное хранилище", async () => {
  env.tauri = true
  invoke.mockResolvedValueOnce("abc")
  expect(await loadAiKey()).toBe("abc")
  expect(invoke).toHaveBeenCalledWith("ai_key_get")
  invoke.mockResolvedValueOnce(undefined)
  await clearAiKey()
  expect(invoke).toHaveBeenCalledWith("ai_key_delete")
})
