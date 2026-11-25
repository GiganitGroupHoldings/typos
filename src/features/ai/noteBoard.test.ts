import { beforeEach, expect, it, vi } from "vitest"
import { insideGroup, parseBoard, serializeBoard } from "@/features/boards/model"
import { chat } from "./client"
import { boardSourceChunks, generateNoteBoard, materializeNoteBoard } from "./noteBoard"

vi.mock("./client", async (importOriginal) => ({ ...(await importOriginal<typeof import("./client")>()), chat: vi.fn() }))

beforeEach(() => {
  vi.mocked(chat).mockReset()
})

const ref = { subjectId: "math", noteId: "note" }
const parts = [{ id: 1, text: "Сначала черновик, затем проверка.", block: 2, quote: "Сначала черновик" }]
const plan = {
  status: "ready",
  layout: "flow",
  groups: ["Проверка"],
  cards: [
    { title: "Черновик", text: "", group: null, source: 1 },
    { title: "Проверка", text: "Сверить с условиями", group: 0, source: 1 },
  ],
  edges: [{ from: 0, to: 1, label: "затем" }],
}

it("строит редактируемую схему с рамкой, стрелкой и сохранёнными ссылками на текст", async () => {
  const data = await materializeNoteBoard(JSON.stringify(plan), "Подготовка", parts, ref)
  const saved = parseBoard(serializeBoard("board", data)).data
  const frame = saved.nodes.find((node) => node.type === "group")!
  const card = saved.nodes.find((node) => node.id === "card-1")!
  expect(insideGroup(frame, card)).toBe(true)
  expect(saved.nodes.find((node) => node.id === "card-0")!.x).toBeLessThan(card.x)
  expect(card.note).toEqual({ ...ref, block: 2, quote: "Сначала черновик" })
  expect(saved.nodes.find((node) => node.id === "source")?.note).toEqual(ref)
  expect(saved.edges[0]).toMatchObject({ fromNode: "card-0", toNode: "card-1", label: "затем" })
})

it("сохраняет карточку с неверным источником без ссылки на случайный фрагмент", async () => {
  const invalid = { ...plan, cards: [{ ...plan.cards[0], source: 100 }, plan.cards[1]] }
  const board = await materializeNoteBoard(JSON.stringify(invalid), "Тема", parts, ref)
  expect(board.nodes.find((node) => node.id === "card-0")?.note).toEqual(ref)
  await expect(materializeNoteBoard('{"status":"insufficient"}', "Тема", parts, ref)).rejects.toThrow("две связанные мысли")
})

it("принимает JSON в пояснении, строковые индексы и неполные карточки", async () => {
  const input = {
    cards: [{ title: "Черновик", source: "1" }, { title: "Проверка" }, { title: "Публикация" }],
    edges: [{ from: "2", to: "3", label: "затем" }],
  }
  const answer = ["Вот схема:", "", "```json", JSON.stringify(input), "```"].join("\n")
  const board = await materializeNoteBoard(answer, "Тема", parts, ref)
  expect(board.nodes).toHaveLength(4)
  expect(board.edges).toEqual([
    expect.objectContaining({ fromNode: "card-1", toNode: "card-2", label: "затем" }),
    expect.objectContaining({ fromNode: "card-0", toNode: "card-1", toEnd: "none" }),
  ])
})

it("при двух несвязных ответах делает доску из текста и сохраняет ссылки", async () => {
  vi.mocked(chat).mockResolvedValueOnce("Вот схема без JSON").mockResolvedValueOnce("Не могу")
  const source = [{ ...parts[0], text: "План → Черновик → Проверка" }]
  const result = await generateNoteBoard(
    { baseUrl: "http://localhost", model: "test" },
    "",
    "Тема",
    [source],
    ref,
    () => {},
    new AbortController().signal,
  )
  expect(chat).toHaveBeenCalledTimes(2)
  expect(result.fallback).toBe(true)
  expect(result.data.nodes.map((node) => node.text)).toEqual(["### План", "### Черновик", "### Проверка", "# Тема"])
  expect(result.data.nodes[0].note).toEqual({ ...ref, block: 2, quote: "Сначала черновик" })
})

it("учитывает конец длинного конспекта в общем плане", async () => {
  const input = Array.from({ length: 4 }, (_, i) => ({
    id: i + 1,
    text: `${"абзац ".repeat(440)}часть ${i + 1}`,
    block: i,
    quote: `часть ${i + 1}`,
  }))
  vi.mocked(chat)
    .mockResolvedValueOnce('{"points":[{"source":1,"text":"Начало"}]}')
    .mockResolvedValueOnce('{"points":[{"source":4,"text":"Ограничения"}]}')
    .mockResolvedValueOnce(JSON.stringify({ ...plan, cards: [plan.cards[0], { ...plan.cards[1], source: 4 }] }))
  const { data } = await generateNoteBoard(
    { baseUrl: "http://localhost", model: "test" },
    "",
    "Статья",
    boardSourceChunks(input),
    ref,
    () => {},
    new AbortController().signal,
  )
  expect(vi.mocked(chat).mock.calls[2][2][1].content).toContain("Ограничения")
  expect(data.nodes.find((node) => node.id === "card-1")?.note).toEqual({ ...ref, block: 3, quote: "часть 4" })
})
