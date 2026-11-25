import { z } from "zod"
import { translate } from "@/app/i18n"
import type { BoardSourcePart } from "@/editor/boardSource"
import { placeNodes, textSize } from "@/features/boards/layout"
import { BOARD_COLORS, boardBounds, type BoardData, type BoardNode, type BoardNoteRef } from "@/features/boards/model"
import { AiIncompleteResponseError, chat, type AiConfig, type ChatMessage } from "./client"
import { jsonMessages, readAiJson } from "./readAiJson"

const CHUNK_SIZE = 6500
const MAX_CHUNKS = 8
const MAX_CARDS = 20
const MAX_GROUPS = 6

const asObject = z.record(z.string(), z.unknown())
const items = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const objects = (value: unknown): Record<string, unknown>[] =>
  items(value).flatMap((item) => {
    const parsed = asObject.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim() : "").slice(0, max).trimEnd()
const indexOf = (value: unknown) => {
  const n = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : -1
}

interface BoardPlan {
  layout: "map" | "flow"
  groups: string[]
  cards: { title: string; text: string; group: number; source: number }[]
  edges: { from: number; to: number; label: string }[]
}

function parsePlan(answer: string): BoardPlan | "insufficient" | undefined {
  const raw = asObject.safeParse(readAiJson(answer)).data
  if (!raw) return
  if (raw.status === "insufficient") return "insufficient"
  const groups = items(raw.groups)
    .slice(0, MAX_GROUPS)
    .map((group) => clip(group, 60))
  const inputCards = items(raw.cards).slice(0, MAX_CARDS)
  const cards = objects(inputCards).map((card) => ({
    title: clip(card.title, 85),
    text: clip(card.text, 240),
    group: typeof card.group === "string" && groups.includes(card.group.trim()) ? groups.indexOf(card.group.trim()) : indexOf(card.group),
    source: indexOf(card.source),
  }))
  if (cards.length < 2 || cards.length !== inputCards.length || cards.some((card) => !card.title)) return
  const edges = objects(raw.edges)
    .slice(0, 30)
    .map((edge) => ({ from: indexOf(edge.from), to: indexOf(edge.to), label: clip(edge.label, 65) }))
  const endpoints = edges.flatMap(({ from, to }) => [from, to])
  const oneBased = endpoints.includes(cards.length) && endpoints.every((n) => n >= 1 && n <= cards.length)
  if (oneBased)
    for (const edge of edges) {
      edge.from--
      edge.to--
    }
  return { layout: raw.layout === "flow" ? "flow" : "map", groups, cards, edges }
}

const invalid = () => new Error(translate("Модель вернула некорректную схему. Попробуй ещё раз."))
const insufficient = () => new Error(translate("Для доски нужно хотя бы две связанные мысли. Добавь их в конспект."))

export function boardSourceChunks(parts: BoardSourcePart[]) {
  const chunks: BoardSourcePart[][] = []
  let length = CHUNK_SIZE
  for (const part of parts) {
    if (length + part.text.length + 32 > CHUNK_SIZE) {
      chunks.push([])
      length = 0
    }
    chunks[chunks.length - 1].push(part)
    length += part.text.length + 32
  }
  if (chunks.length > MAX_CHUNKS)
    throw new Error(translate("Конспект слишком большой. Выдели нужный раздел и выбери «Создать доску по выделению»."))
  return chunks
}

const PLAN_PROMPT = `Собери обзорную редактируемую доску из учебного текста. Используй только предоставленные факты и связи. Сохраняй язык, числа, степень уверенности и оговорки. У фрагментов (и тезисов) есть числовой идентификатор источника. Каждая карточка ссылается на один относящийся к ней фрагмент. Краткий текст с несколькими шагами или понятиями можно разложить на две-три карточки. Для одной голой темы или одного неделимого факта верни {"status":"insufficient"}.
Схема ответа: {"status":"ready","layout":"map","groups":["Название рамки"],"cards":[{"title":"Тезис","text":"Пояснение или пустая строка","group":null,"source":1}],"edges":[{"from":0,"to":1,"label":"Связь или пустая строка"}]}. Индексы карточек и групп идут с 0. group: null означает вне рамки. Для карты первая карточка — главная мысль, вне рамки. Для процесса layout: "flow", карточки по порядку. Размещай карточки в 0–6 смысловых рамках; короткой схеме рамки обычно не нужны. У длинного конспекта 12–20 карточек, у короткого столько, сколько обосновано. Одна мысль на карточку, title до 85 символов, text до 240. Используй Markdown для формул и коротких списков. Проверь, что каждая карточка связана стрелками с остальными, а подписи стрелок дают полезный смысл. Для статьи сохрани вопрос, метод, главные результаты и ограничения, если они есть. Не изобретай причинность, которой в тексте нет.`

export async function generateNoteBoard(
  config: AiConfig,
  key: string,
  title: string,
  chunks: BoardSourcePart[][],
  ref: BoardNoteRef,
  onProgress: (message: string) => void,
  signal: AbortSignal,
): Promise<{ data: BoardData; fallback: boolean }> {
  const ask = async (messages: ChatMessage[], maxTokens: number) => {
    try {
      return await chat(config, key, messages, { maxTokens, temperature: 0.15, signal, rejectTruncated: true })
    } catch (error) {
      if (error instanceof AiIncompleteResponseError) return ""
      throw error
    }
  }
  const parts = chunks.flat()
  const brief = parts.map(({ id, text }) => ({ source: id, text }))
  let input = brief
  if (chunks.length > 1) {
    input = []
    for (const [index, chunk] of chunks.entries()) {
      onProgress(translate("Читаю часть {0} из {1}…", index + 1, chunks.length))
      const messages = jsonMessages(
        'Выдели до 8 ключевых тезисов из этой части конспекта. Сохраняй числа, формулы, оговорки и язык. Каждый тезис привяжи к предоставленному source. Верни {"points":[{"source":1,"text":"Тезис до 250 символов"}]}.',
        chunk.map(({ id, text }) => ({ source: id, text })),
      )
      const answer = await ask(messages, 1800)
      const ids = new Set(chunk.map((part) => part.id))
      const raw = asObject.safeParse(readAiJson(answer)).data
      const points = objects(raw?.points)
        .slice(0, 8)
        .map((point) => ({ source: indexOf(point.source), text: clip(point.text, 250) }))
        .filter(({ source, text }) => ids.has(source) && text)
      input.push(...(points.length ? points : chunk.slice(0, 8).map(({ id, text }) => ({ source: id, text: clip(text, 250) }))))
    }
  }
  onProgress(translate("Собираю доску…"))
  const answer = await ask(jsonMessages(PLAN_PROMPT, { title, parts: input }), 5200)
  let plan = parsePlan(answer)
  if (!plan) {
    onProgress(translate("Упрощаю схему…"))
    const request = jsonMessages(
      'Составь доску из 2–8 тезисов данного текста. Верни {"cards":[{"title":"Тезис","source":1},{"title":"Другой тезис","source":2}]}. source — идентификатор фрагмента из входа, можно повторять. Для текста с одной идеей верни {"status":"insufficient"}.',
      { title, parts: input },
    )
    plan = parsePlan(await ask(request, 1600))
  }
  if (plan && plan !== "insufficient") return { data: await layoutNoteBoard(plan, title, parts, ref), fallback: false }

  const fragments = parts
    .flatMap((part) => part.text.split(/(?<=[.!?;])\s+|\n+|\s*→\s*/u).map((text) => ({ source: part.id, text: text.trim() })))
    .filter(({ text }) => /[\p{L}\p{N}]/u.test(text))
  if (fragments.length < 2) throw plan === "insufficient" ? insufficient() : invalid()
  const count = Math.min(12, fragments.length)
  const excerpts = Array.from({ length: count }, (_, index) => fragments[Math.round((index * (fragments.length - 1)) / (count - 1))])
  const fallback: BoardPlan = {
    layout: parts.some(({ text }) => text.includes("→")) ? "flow" : "map",
    groups: [],
    edges: [],
    cards: excerpts.map(({ source, text }) => ({
      source,
      group: -1,
      title: text.length <= 85 ? text : `${text.slice(0, 82).trimEnd()}…`,
      text: text.length <= 85 ? "" : clip(text, 240),
    })),
  }
  return { data: await layoutNoteBoard(fallback, title, parts, ref), fallback: true }
}

function tipCard(id: string, text: string, note: BoardNoteRef, width: number, color?: string): BoardNode {
  const size = textSize(text, width)
  return { id, type: "text", text, note, color, x: 0, y: 0, ...size, height: size.height + 26 }
}

export async function materializeNoteBoard(answer: string, title: string, parts: BoardSourcePart[], ref: BoardNoteRef): Promise<BoardData> {
  const plan = parsePlan(answer)
  if (!plan) throw invalid()
  if (plan === "insufficient") throw insufficient()
  return layoutNoteBoard(plan, title, parts, ref)
}

async function layoutNoteBoard(plan: BoardPlan, title: string, parts: BoardSourcePart[], ref: BoardNoteRef): Promise<BoardData> {
  const sources = new Map(parts.map((part) => [part.id, part]))
  const children = new Map<string, string[]>()
  const data: BoardData = { nodes: [], edges: [] }
  for (const [index, card] of plan.cards.entries()) {
    const part = sources.get(card.source)
    const group = card.group
    const id = `card-${index}`
    const text = `### ${card.title.replace(/\s+/g, " ")}${card.text ? `\n${card.text}` : ""}`
    data.nodes.push(
      tipCard(
        id,
        text,
        part ? { ...ref, block: part.block, quote: part.quote } : ref,
        296,
        index === 0 && plan.layout === "map" ? "5" : undefined,
      ),
    )
    if (plan.groups[group]) {
      const frame = `frame-${group}`
      const members = children.get(frame) ?? []
      members.push(id)
      children.set(frame, members)
    }
  }
  for (const [index, label] of plan.groups.entries()) {
    const id = `frame-${index}`
    if (!children.has(id)) continue
    data.nodes.unshift({ id, type: "group", label, color: BOARD_COLORS[index], x: 0, y: 0, width: 0, height: 0 })
  }
  const seen = new Set<string>()
  for (const edge of plan.edges) {
    if (!plan.cards[edge.from] || !plan.cards[edge.to] || edge.from === edge.to) continue
    const id = `edge-${edge.from}-${edge.to}`
    if (seen.has(id)) continue
    seen.add(id)
    data.edges.push({ id, fromNode: `card-${edge.from}`, toNode: `card-${edge.to}`, label: edge.label, toEnd: "arrow" })
  }
  const connected = new Set<string>()
  for (let index = 0; index < plan.cards.length; index++) {
    const id = `card-${index}`
    if (connected.has(id)) continue
    if (index > 0) {
      const parent = plan.layout === "flow" ? index - 1 : 0
      data.edges.push({ id: `outline-${index}`, fromNode: `card-${parent}`, toNode: id, toEnd: "none" })
    }
    connected.add(id)
    for (let size = 0; size < connected.size;) {
      size = connected.size
      for (const { fromNode, toNode } of data.edges) {
        if (connected.has(fromNode) || connected.has(toNode)) {
          connected.add(fromNode)
          connected.add(toNode)
        }
      }
    }
  }

  const placed = await placeNodes(data, new Set(data.nodes.map((node) => node.id)), children, plan.layout === "flow" ? "LR" : "TB")
  const bounds = boardBounds(placed.nodes)!
  const header = tipCard("source", `# ${title.replace(/\s+/g, " ").slice(0, 170)}`, ref, 420)
  placed.nodes.push({ ...header, x: bounds.x, y: bounds.y - header.height - 90 })
  return placed
}
