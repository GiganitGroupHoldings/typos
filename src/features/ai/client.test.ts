import { afterEach, expect, it, vi } from "vitest"
import { chat, checkAiConnection, normalizeBaseUrl } from "./client"

afterEach(() => vi.unstubAllGlobals())

it("принимает только http(s)-адреса без учётных данных", () => {
  expect(normalizeBaseUrl(" https://api.openai.com/v1/ ")).toBe("https://api.openai.com/v1")
  expect(normalizeBaseUrl("http://localhost:11434/v1")).toBe("http://localhost:11434/v1")
  expect(normalizeBaseUrl("ftp://example.com")).toBeNull()
  expect(normalizeBaseUrl("https://user:pass@example.com")).toBeNull()
  expect(normalizeBaseUrl("не адрес")).toBeNull()
  expect(normalizeBaseUrl("")).toBeNull()
})

it("проверяет подключение списком моделей и не отправляет пустой ключ", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)

  await checkAiConnection({ baseUrl: "https://api.example.com/v1/", model: "m" }, "  sk-1 ")
  expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/models", {
    headers: { Authorization: "Bearer sk-1" },
    signal: expect.any(AbortSignal),
  })

  await checkAiConnection({ baseUrl: "http://localhost:11434/v1", model: "m" }, "")
  expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:11434/v1/models", {
    headers: {},
    signal: expect.any(AbortSignal),
  })
})

it("объясняет отказ по ключу и по адресу", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
  await expect(checkAiConnection({ baseUrl: "https://api.example.com/v1", model: "m" }, "x")).rejects.toThrow("Ключ не принят")

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
  await expect(checkAiConnection({ baseUrl: "https://api.example.com/v1", model: "m" }, "x")).rejects.toThrow("OpenAI-совместимого")
})

it("объясняет недоступность сервера", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
  await expect(checkAiConnection({ baseUrl: "https://api.example.com/v1", model: "m" }, "x")).rejects.toThrow("Не удалось связаться")
})

it("требует модель и корректный адрес", async () => {
  await expect(checkAiConnection({ baseUrl: "", model: "m" }, "")).rejects.toThrow("Базовый адрес")
  await expect(checkAiConnection({ baseUrl: "https://api.example.com/v1", model: "  " }, "")).rejects.toThrow("Укажи модель")
})

it("возвращает текст ответа и отправляет модель с сообщениями", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: "  готово  " } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  )
  vi.stubGlobal("fetch", fetchMock)

  const result = await chat(
    { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    "k",
    [{ role: "user", content: "привет" }],
    { maxTokens: 100 },
  )
  expect(result).toBe("готово")
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(url).toBe("https://api.deepseek.com/v1/chat/completions")
  expect(init.headers).toMatchObject({ Authorization: "Bearer k", "Content-Type": "application/json" })
  expect(JSON.parse(init.body as string)).toMatchObject({
    model: "deepseek-chat",
    max_tokens: 100,
    stream: false,
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: "привет" }],
  })
})

it("не отправляет DeepSeek-параметр размышлений другим провайдерам", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "x" } }] }), { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  await chat({ baseUrl: "https://api.example.com/v1", model: "m" }, "k", [])
  expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).not.toHaveProperty("thinking")
})

it("понимает ответ из нескольких частей и объясняет обрезанный ответ", async () => {
  const parts = {
    choices: [
      {
        message: {
          content: [
            { type: "text", text: "го" },
            { type: "text", text: "тово" },
          ],
        },
      },
    ],
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(parts), { status: 200 })))
  await expect(chat({ baseUrl: "https://api.example.com/v1", model: "m" }, "k", [])).resolves.toBe("готово")

  const cut = { choices: [{ finish_reason: "length", message: { content: "" } }] }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(cut), { status: 200 })))
  await expect(chat({ baseUrl: "https://api.example.com/v1", model: "m" }, "k", [])).rejects.toThrow("обрезан")

  const thinking = { choices: [{ message: { content: "", reasoning_content: "думал" } }] }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(thinking), { status: 200 })))
  await expect(chat({ baseUrl: "https://api.example.com/v1", model: "m" }, "k", [])).rejects.toThrow("рассуждения")
})

it("работает без ключа и не отправляет Authorization", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: "x" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  )
  vi.stubGlobal("fetch", fetchMock)
  await expect(chat({ baseUrl: "http://localhost:11434/v1", model: "llama3.2" }, "  ", [{ role: "user", content: "x" }])).resolves.toBe("x")
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(init.headers).not.toHaveProperty("Authorization")
  expect(init.headers).toMatchObject({ "Content-Type": "application/json" })
})

it("объясняет лимит запросов и пустой ответ", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })))
  await expect(chat({ baseUrl: "https://api.example.com/v1", model: "m" }, "k", [])).rejects.toThrow("слишком много запросов")

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 })))
  await expect(chat({ baseUrl: "https://api.example.com/v1", model: "m" }, "k", [])).rejects.toThrow("пустой ответ")
})
