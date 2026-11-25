import { afterEach, expect, it } from "vitest"
import type { AiProvider } from "@/features/ai/providers"
import { useUi } from "./store"

afterEach(() => {
  useUi.setState({
    aiProvider: "openai",
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "gpt-4o-mini",
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

it("игнорирует ранее сохранённое положение шарика помощника", async () => {
  localStorage.setItem("studynotes-ui", JSON.stringify({ version: 2, state: { aiBall: { x: 120, y: 340 } } }))
  await useUi.persist.rehydrate()
  expect(useUi.getState()).not.toHaveProperty("aiBall")
})
