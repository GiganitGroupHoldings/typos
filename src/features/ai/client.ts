import { translate } from "@/app/i18n"

export interface AiConfig {
  baseUrl: string
  model: string
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

const TIMEOUT_MS = 10_000
const CHAT_TIMEOUT_MS = 60_000

/** Возвращает адрес без хвостовых слэшей или null, если это не http(s)-адрес без учётных данных. */
export function normalizeBaseUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (url.username || url.password) return null
    return url.toString().replace(/\/+$/, "")
  } catch {
    return null
  }
}

/** Проверяет адрес, ключ и доступность модели запросом к списку моделей: токены не тратятся. */
export async function checkAiConnection(config: AiConfig, key: string): Promise<void> {
  const base = normalizeBaseUrl(config.baseUrl)
  if (!base) throw new Error("Базовый адрес должен начинаться с http:// или https://.")
  if (!config.model.trim()) throw new Error("Укажи модель.")
  const token = key.trim()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${base}/models`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
  } catch {
    if (controller.signal.aborted) throw new Error("Сервер не ответил за 10 секунд. Проверь адрес и интернет.")
    throw new Error("Не удалось связаться с сервером. Проверь адрес и интернет. Для Ollama разреши CORS: OLLAMA_ORIGINS.")
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 401 || response.status === 403) throw new Error("Ключ не принят. Проверь ключ и выбранного провайдера.")
  if (response.status === 404) throw new Error("По этому адресу нет OpenAI-совместимого API. Проверь базовый адрес.")
  if (!response.ok) throw new Error(translate("Сервер ответил ошибкой {0}. Попробуй ещё раз.", response.status))
}

/** У DeepSeek размышления включены по умолчанию и могут съесть весь ответ. */
function isDeepSeek(base: string): boolean {
  try {
    return new URL(base).hostname.endsWith("deepseek.com")
  } catch {
    return false
  }
}

interface ChatContentPart {
  type?: string
  text?: string
}

interface ChatChoice {
  finish_reason?: string
  message?: { content?: string | ChatContentPart[]; reasoning_content?: string }
}

export interface ChatOptions {
  maxTokens?: number
  temperature?: number
}

/** Один запрос к OpenAI-совместимому чату. Возвращает текст ответа без обёрток. */
export async function chat(config: AiConfig, key: string, messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
  const base = normalizeBaseUrl(config.baseUrl)
  if (!base) throw new Error("Базовый адрес должен начинаться с http:// или https://.")
  const model = config.model.trim()
  if (!model) throw new Error("Укажи модель в настройках помощника.")
  const token = key.trim()

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 2000,
    stream: false,
  }
  if (isDeepSeek(base)) body.thinking = { type: "disabled" }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    if (controller.signal.aborted) throw new Error("Сервер не ответил за 60 секунд. Проверь адрес и интернет и попробуй ещё раз.")
    throw new Error("Не удалось связаться с сервером. Проверь адрес и интернет. Для Ollama разреши CORS: OLLAMA_ORIGINS.")
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401 || response.status === 403) throw new Error("Ключ не принят. Проверь ключ и выбранного провайдера.")
  if (response.status === 404) throw new Error("Провайдер не нашёл модель или адрес. Проверь модель и базовый адрес.")
  if (response.status === 400) throw new Error("Провайдер отклонил запрос. Проверь модель и её лимиты.")
  if (response.status === 429) throw new Error("Провайдер просит подождать: слишком много запросов.")
  if (!response.ok) throw new Error(translate("Провайдер ответил ошибкой {0}. Попробуй ещё раз или выбери другую модель.", response.status))

  const data = (await response.json().catch(() => null)) as { choices?: ChatChoice[]; error?: { message?: unknown } } | null
  if (data?.error?.message)
    throw new Error(
      translate("Провайдер вернул ошибку: {0}. Попробуй ещё раз или выбери другую модель.", String(data.error.message).slice(0, 200)),
    )

  const choice = data?.choices?.[0]
  const content = choice?.message?.content
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("")
        : ""
  if (text.trim()) return text.trim()
  if (choice?.finish_reason === "length") throw new Error("Ответ обрезан по лимиту токенов. Выбери модель попроще и повтори.")
  if (choice?.message?.reasoning_content?.trim()) {
    throw new Error("Модель ушла в рассуждения и не оставила ответ. Выбери deepseek-chat или отключи размышления.")
  }
  throw new Error("Модель вернула пустой ответ. Попробуй другую модель.")
}
