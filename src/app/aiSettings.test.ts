import { afterEach, expect, it } from "vitest"
import type { AiProvider } from "@/features/ai/providers"
import { useUi } from "./store"

afterEach(() => {
  useUi.setState({
    aiProvider: "openai",
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "gpt-4o-mini",
    aiBall: null,
  })
})

it("хранит настройки помощника и чинит мусор при восстановлении", async () => {
  useUi.getState().setAiProvider("groq")
  useUi.getState().setAiBaseUrl(" https://api.groq.com/openai/v1 ")
  useUi.getState().setAiModel(" llama-3.3 ")
  expect(useUi.getState()).toMatchObject({
    aiProvider: "groq",
    aiBaseUrl: "https://api.groq.com/openai/v1",
    aiModel: "llama-3.3",
  })

  useUi.getState().setAiProvider("nope" as AiProvider)
  expect(useUi.getState().aiProvider).toBe("groq")

  localStorage.setItem(
    "studynotes-ui",
    JSON.stringify({ version: 2, state: { aiProvider: "bad", aiBaseUrl: "x".repeat(400), aiModel: "  " } }),
  )
  await useUi.persist.rehydrate()
  expect(useUi.getState()).toMatchObject({
    aiProvider: "openai",
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "gpt-4o-mini",
  })
})

it("хранит положение шарика помощника и отбрасывает мусор", async () => {
  useUi.getState().setAiBall({ x: 120.5, y: 340 })
  expect(useUi.getState().aiBall).toEqual({ x: 120.5, y: 340 })

  useUi.getState().setAiBall({ x: Number.NaN, y: 10 })
  expect(useUi.getState().aiBall).toBeNull()
  useUi.getState().setAiBall(null)
  expect(useUi.getState().aiBall).toBeNull()

  localStorage.setItem("studynotes-ui", JSON.stringify({ version: 2, state: { aiBall: { x: -40, y: 999_999 } } }))
  await useUi.persist.rehydrate()
  expect(useUi.getState().aiBall).toEqual({ x: 0, y: 100_000 })

  localStorage.setItem("studynotes-ui", JSON.stringify({ version: 2, state: { aiBall: { x: "1", y: 2 } } }))
  await useUi.persist.rehydrate()
  expect(useUi.getState().aiBall).toBeNull()
})
