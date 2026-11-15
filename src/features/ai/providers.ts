export type AiProvider = "openai" | "deepseek" | "openrouter" | "groq" | "ollama" | "custom"

export interface AiProviderPreset {
  id: AiProvider
  label: string
  baseUrl: string
  model: string
  keyRequired: boolean
}

export const AI_PROVIDERS: AiProviderPreset[] = [
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", keyRequired: true },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    keyRequired: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    keyRequired: true,
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    keyRequired: true,
  },
  { id: "ollama", label: "Ollama", baseUrl: "http://localhost:11434/v1", model: "llama3.2", keyRequired: false },
  { id: "custom", label: "Свой сервер", baseUrl: "", model: "", keyRequired: true },
]

const PRESETS = new Map(AI_PROVIDERS.map((provider) => [provider.id, provider]))

export function providerPreset(id: AiProvider): AiProviderPreset {
  return PRESETS.get(id) ?? AI_PROVIDERS[0]
}

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && PRESETS.has(value as AiProvider)
}
