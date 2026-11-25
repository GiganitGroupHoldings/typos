import { translate } from "@/app/i18n"
import { mapText, parseNoteMap, serializeNoteMap, type NoteMap } from "@/editor/map/types"
import { normalizeMarkdownMath } from "@/editor/texImport"
import { BOARD_EXT, emptyBoard, parseBoard, serializeBoard, type BoardData } from "@/features/boards/model"
import { pinUrl } from "@/lib/pins"
import { SUBJECT_COLOR_IDS, SUBJECT_ICON_IDS, validCustomColor } from "@/lib/subjectPalette"
import { basename, dirname, fileExt, fileTitle, joinPath, safeName, uniquePath, type VaultAdapter } from "@/storage/VaultAdapter"
import type { Board, Note, Pin, Subject, SubjectColor, SubjectIcon, SubjectInput, Tool, ToolIcon } from "@/types"
import {
  BOARDS_DIR,
  extractExcerpt,
  extractTitle,
  fileKind,
  genId,
  MAPS_DIR,
  NOTES_DIR,
  parseFrontmatter,
  parsePinBody,
  PINS_DIR,
  PROJECTS_DIR,
  serializeFrontmatter,
  serializePinBody,
  SUBFOLDERS_DIR,
  SUBJECT_META,
  TOOLS_DIR,
  TRASH_DIR,
} from "./format"

export interface VaultData {
  subjects: Subject[]
  notes: Note[]
  pins: Pin[]
  tools: Tool[]
  boards: Board[]
}

const COLORS: SubjectColor[] = SUBJECT_COLOR_IDS
const ICONS: SubjectIcon[] = SUBJECT_ICON_IDS
const TOOL_ICONS: ToolIcon[] = ["grid", "chart", "ruler", "binary", "calculator", "function", "timer", "table"]

export async function loadVault(a: VaultAdapter): Promise<VaultData> {
  const data: VaultData = { subjects: [], notes: [], pins: [], tools: [], boards: [] }
  for await (const { dir, index } of subjectDirs(a)) data.subjects.push(await readSubject(a, dir, index))
  data.subjects = uniqueIds(data.subjects, (s) => s.dir)
  const idsByDir = new Map(data.subjects.map((s) => [s.dir, s.id]))
  for (const s of data.subjects) s.parentId = idsByDir.get(dirname(dirname(s.dir)))

  for (const subject of data.subjects) {
    const maps = new Map<string, string>()
    const notes: Note[] = []
    await Promise.all([
      readFiles(a, joinPath(subject.dir, NOTES_DIR), ".md", async (path, text) => {
        notes.push(noteFromFile(subject.id, path, text))
      }),
      readFiles(a, joinPath(subject.dir, NOTES_DIR, MAPS_DIR), ".json", async (path, text) => {
        const t = mapText(parseNoteMap(text))
        if (t) maps.set(basename(path).replace(/\.json$/, ""), t)
      }),
      readFiles(a, joinPath(subject.dir, PINS_DIR), ".md", async (path, text) => {
        const { meta, body } = parseFrontmatter(text)
        const p = parsePinBody(body)
        data.pins.push({
          id: meta.id || pathId(path),
          subjectId: subject.id,
          path,
          title: p.title || basename(path).replace(/\.md$/, ""),
          tex: p.tex,
          text: p.text,
          kind: meta.kind === "link" ? "link" : meta.kind === "formula" ? "formula" : "content",
          quiz: meta.kind !== "link" && meta.quiz !== "false",
          url: pinUrl(meta.url),
          icon: meta.icon === "favicon" ? "favicon" : ICONS.find((icon) => icon === meta.icon),
          order: Number(meta.order ?? 999),
        })
      }),

      readProjects(a, joinPath(subject.dir, PROJECTS_DIR), subject.id, data.tools),
      readProjects(a, joinPath(subject.dir, TOOLS_DIR), subject.id, data.tools),
      readFiles(a, joinPath(subject.dir, BOARDS_DIR), BOARD_EXT, async (path, text) => {
        const { id, data: board } = parseBoard(text)
        data.boards.push({ id: id || pathId(path), subjectId: subject.id, path, name: fileTitle(basename(path)), data: board })
      }),
    ])
    for (const n of notes) {
      const t = maps.get(n.id)
      data.notes.push(t ? { ...n, mapText: t } : n)
    }
  }
  data.notes = uniqueIds(data.notes, (n) => n.path)
  data.pins = uniqueIds(data.pins, (p) => p.path)
  data.tools = uniqueIds(data.tools, (t) => t.path)
  data.boards = uniqueIds(data.boards, (b) => b.path)
  data.subjects.sort((x, y) => x.order - y.order || x.name.localeCompare(y.name, "ru"))
  data.pins.sort((x, y) => x.order - y.order || x.title.localeCompare(y.title, "ru"))
  data.tools.sort((x, y) => x.name.localeCompare(y.name, "ru"))
  data.boards.sort((x, y) => x.name.localeCompare(y.name, "ru"))
  return data
}

async function* subjectDirs(a: VaultAdapter, parentDir = ""): AsyncGenerator<{ dir: string; index: number }> {
  const base = parentDir ? joinPath(parentDir, SUBFOLDERS_DIR) : ""
  const entries = (await a.list(base)).filter((entry) => entry.kind === "dir" && !entry.name.startsWith("."))
  for (const [index, entry] of entries.entries()) {
    const dir = joinPath(base, entry.name)
    yield { dir, index }
    yield* subjectDirs(a, dir)
  }
}

async function readSubject(a: VaultAdapter, dir: string, index: number): Promise<Subject> {
  let meta: Partial<Subject> = {}
  try {
    meta = JSON.parse((await a.readText(joinPath(dir, SUBJECT_META))) ?? "{}")
  } catch {}
  const subject: Subject = {
    id: meta.id || genId(),
    name: basename(dir),
    dir,
    color: COLORS.includes(meta.color!) ? meta.color! : COLORS[index % COLORS.length],
    customColor: validCustomColor(meta.customColor),
    icon: ICONS.includes(meta.icon!) ? meta.icon! : "book",
    order: typeof meta.order === "number" ? meta.order : index,
  }

  if (!meta.id) await writeSubjectMeta(a, subject)
  return subject
}

export function writeSubjectMeta(a: VaultAdapter, s: Subject) {
  const { id, color, customColor, icon, order } = s
  return a.writeText(joinPath(s.dir, SUBJECT_META), JSON.stringify({ id, color, customColor, icon, order }, null, 2) + "\n")
}

async function readFiles(a: VaultAdapter, dir: string, ext: string, cb: (path: string, text: string) => Promise<void>) {
  const entries = await a.list(dir)
  await Promise.all(
    entries
      .filter((e) => e.kind === "file" && e.name.toLowerCase().endsWith(ext))
      .map(async (e) => {
        const path = joinPath(dir, e.name)
        const text = await a.readText(path)
        if (text !== null) await cb(path, text)
      }),
  )
}

export const noteMapPath = (note: Pick<Note, "id" | "path">) => joinPath(dirname(note.path), MAPS_DIR, `${note.id}.json`)

export async function loadNoteMap(a: VaultAdapter, note: Pick<Note, "id" | "path">): Promise<NoteMap> {
  return parseNoteMap(await a.readText(noteMapPath(note)))
}

export async function saveNoteMap(a: VaultAdapter, note: Pick<Note, "id" | "path">, map: NoteMap): Promise<void> {
  const path = noteMapPath(note)
  if (!map.nodes.length) {
    if (await a.exists(path)) await a.remove(path)
    return
  }
  await a.writeText(path, serializeNoteMap(map))
}

async function readProjects(a: VaultAdapter, dir: string, subjectId: string, out: Tool[]) {
  const entries = (await a.list(dir)).filter((e) => e.kind === "file" && !e.name.startsWith(".") && !e.name.endsWith(".tmp"))
  await Promise.all(
    entries.map(async (e) => {
      const path = joinPath(dir, e.name)
      const ext = fileExt(e.name)
      const kind = fileKind(ext)
      if (kind === "html") {
        const html = await a.readText(path)
        if (html === null) return
        const icon = getHtmlMeta(html, "studynotes-icon") as ToolIcon | undefined
        out.push({
          id: getHtmlMeta(html, "studynotes-id") || pathId(path),
          subjectId,
          path,
          name: fileTitle(e.name),
          kind,
          ext,
          icon: icon && TOOL_ICONS.includes(icon) ? icon : "calculator",
          html,
          size: html.length,
        })
        return
      }
      const blob = await a.readBlob(path)
      out.push({ id: pathId(path), subjectId, path, name: fileTitle(e.name), kind, ext, icon: "calculator", html: "", size: blob?.size })
    }),
  )
}

function pathId(path: string) {
  let h = 0
  for (const ch of path) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0
  return `f${(h >>> 0).toString(36)}`
}

function uniqueIds<T extends { id: string }>(items: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>()
  const fixed = new Map<T, string>()
  for (const it of [...items].sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0))) {
    let id = it.id
    for (let salt = ""; seen.has(id); salt += "#") id = pathId(key(it) + salt)
    seen.add(id)
    if (id !== it.id) fixed.set(it, id)
  }
  return fixed.size ? items.map((it) => (fixed.has(it) ? { ...it, id: fixed.get(it)! } : it)) : items
}

export function noteFromFile(subjectId: string, path: string, text: string): Note {
  const { meta, body } = parseFrontmatter(text)
  const { id, created, updated, ...rest } = meta
  const fallback = new Date(0).toISOString()
  return {
    id: id || pathId(path),
    subjectId,
    path,
    title: rest.noteTitle || extractTitle(body) || basename(path).replace(/\.md$/, ""),
    created: created || updated || fallback,
    updated: updated || created || fallback,
    excerpt: extractExcerpt(body),
    body,
    meta: rest,
  }
}

function noteFile(n: Note) {
  return serializeFrontmatter({ id: n.id, created: n.created, updated: n.updated, ...n.meta }, n.body)
}

export async function createNote(a: VaultAdapter, subject: Subject, body = "", parentNoteId?: string): Promise<Note> {
  const now = new Date().toISOString()
  const dir = joinPath(subject.dir, NOTES_DIR)
  const title = extractTitle(body)
  const path = await uniquePath(a, dir, safeName(title), ".md")
  const note: Note = {
    id: genId(),
    subjectId: subject.id,
    path,
    title,
    created: now,
    updated: now,
    excerpt: extractExcerpt(body),
    body,
    meta: parentNoteId ? { parentNoteId } : {},
  }
  await a.writeText(path, noteFile(note))
  return note
}

const IMAGE_LINK = /!\[([^\]]*)\]\(<?([^)\s>]+)>?(\s+"[^"]*")?\)/g

export async function importNote(
  a: VaultAdapter,
  subject: Subject,
  input: { name: string; text: string; images?: Map<string, Blob> },
): Promise<Note> {
  const { meta, body: raw } = parseFrontmatter(input.text)
  const { id: _id, created, updated: _updated, ...rest } = meta
  let body = normalizeMarkdownMath(raw.replace(/\r\n?/g, "\n")).trim()
  if (!/^#\s+\S/.test(body)) body = `# ${fileTitle(input.name) || "Без названия"}${body ? `\n\n${body}` : ""}`

  const dir = joinPath(subject.dir, NOTES_DIR)
  if (input.images?.size) {
    const copied = new Map<string, string>()
    for (const [, , src] of body.matchAll(IMAGE_LINK)) {
      if (/^(https?:|data:|blob:)/i.test(src) || copied.has(src)) continue
      const key = decodeURIComponent(src).normalize("NFC").split(/[\\/]/).pop()!.toLowerCase()
      const blob = input.images.get(key)
      if (blob) copied.set(src, await saveAsset(a, dir, blob))
    }
    body = body.replace(IMAGE_LINK, (m, alt: string, src: string, cap = "") =>
      copied.has(src) ? `![${alt}](${copied.get(src)}${cap})` : m,
    )
  }

  const now = new Date().toISOString()
  const title = extractTitle(body)
  const path = await uniquePath(a, dir, safeName(title), ".md")
  const note: Note = {
    id: genId(),
    subjectId: subject.id,
    path,
    title,
    created: created || now,
    updated: now,
    excerpt: extractExcerpt(body),
    body: `${body}\n`,
    meta: rest,
  }
  await a.writeText(path, noteFile(note))
  return note
}

export async function readNoteBody(a: VaultAdapter, path: string): Promise<string | null> {
  const text = await a.readText(path)
  return text === null ? null : parseFrontmatter(text).body
}

export async function saveNote(a: VaultAdapter, note: Note, body: string): Promise<Note> {
  const title = note.meta.noteTitle || extractTitle(body)
  const next: Note = { ...note, body, title, excerpt: extractExcerpt(body), updated: new Date().toISOString() }
  const wantedBase = safeName(title)
  const currentBase = basename(note.path)
    .replace(/\.md$/, "")
    .replace(/ \(\d+\)$/, "")
  if (!note.meta.noteTitle && wantedBase !== currentBase) {
    next.path = await uniquePath(a, dirname(note.path), wantedBase, ".md", note.path)
  }
  await a.writeText(next.path, noteFile(next))
  if (next.path !== note.path) await a.remove(note.path)
  return next
}

export async function renameNote(a: VaultAdapter, note: Note, name: string): Promise<Note> {
  const title = name.replace(/[\r\n]+/g, " ").trim()
  if (!title || title === note.title) return note
  const text = await a.readText(note.path)
  if (text === null) throw new Error(translate("Конспект не найден"))
  const { meta, body } = parseFrontmatter(text)
  // Отдельное имя сохраняет первый абзац и пути к вложениям.
  const renamed = serializeFrontmatter({ id: note.id, created: note.created, updated: note.updated, ...meta, noteTitle: title }, body)
  await a.writeText(note.path, renamed)
  return { ...note, ...noteFromFile(note.subjectId, note.path, renamed), id: note.id }
}

const TRASH_SEP = " › "

export async function trashEntry(a: VaultAdapter, path: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const to = joinPath(TRASH_DIR, `${stamp} ${path.replaceAll("/", TRASH_SEP)}`)
  await a.move(path, to)
  return to
}
export const trashNote = (a: VaultAdapter, note: Note) => trashEntry(a, note.path)

const splitExt = (name: string) => {
  const m = name.match(/^(.*?)(\.[a-z0-9]+)?$/i)!
  return { base: m[1], ext: m[2] ?? "" }
}

export async function restoreFromTrash(a: VaultAdapter, trashPath: string, originalPath: string) {
  const { base, ext } = splitExt(basename(originalPath))
  const path = await uniquePath(a, dirname(originalPath), base, ext)
  await a.move(trashPath, path)
  return path
}

export type TrashKind = "note" | "pin" | "tool" | "board" | "subject" | "file"

export interface TrashItem {
  trashPath: string
  originalPath: string
  name: string
  kind: TrashKind
  deletedAt: string
}

export async function listTrash(a: VaultAdapter): Promise<TrashItem[]> {
  const items: TrashItem[] = []
  for (const e of await a.list(TRASH_DIR)) {
    const m = e.name.match(/^(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z) (.+)$/)
    if (!m) continue
    const [, stamp, rest] = m
    const originalPath = rest.split(TRASH_SEP).join("/")
    const parts = originalPath.split("/")
    while (parts[1] === SUBFOLDERS_DIR) parts.splice(0, 2)
    const kind: TrashKind =
      parts.length === 1
        ? "subject"
        : parts[1] === NOTES_DIR
          ? "note"
          : parts[1] === PINS_DIR
            ? "pin"
            : parts[1] === TOOLS_DIR || parts[1] === PROJECTS_DIR
              ? "tool"
              : parts[1] === BOARDS_DIR && parts.length === 3
                ? "board"
                : "file"
    const iso = stamp.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z/, "T$1:$2:$3.$4Z")
    items.push({ trashPath: joinPath(TRASH_DIR, e.name), originalPath, name: splitExt(parts.at(-1)!).base, kind, deletedAt: iso })
  }
  return items.sort((x, y) => y.deletedAt.localeCompare(x.deletedAt))
}

export async function purgeTrash(a: VaultAdapter, days = 30) {
  const limit = Date.now() - days * 864e5
  for (const item of await listTrash(a)) if (new Date(item.deletedAt).getTime() < limit) await a.remove(item.trashPath)
}

export interface PinInput {
  title: string
  tex?: string
  text?: string
  kind?: Pin["kind"]
  quiz?: boolean
  url?: string
  icon?: Pin["icon"]
}

const clean = (s?: string) => s?.trim() || undefined

function pinFile(id: string, order: number, p: PinInput) {
  const meta: Record<string, string> = {
    id,
    order: String(order),
    kind: p.kind ?? "content",
    quiz: String(p.quiz !== false && p.kind !== "link"),
  }
  if (p.kind === "link" && p.url) meta.url = p.url
  if (p.kind === "link" && p.icon) meta.icon = p.icon
  return serializeFrontmatter(meta, serializePinBody(p.title, clean(p.tex), clean(p.text)))
}

function pinFields(input: PinInput, previous?: Pin): PinInput {
  const kind = input.kind ?? previous?.kind ?? "content"
  const url = kind === "link" ? pinUrl(input.url ?? previous?.url) : undefined
  if (kind === "link" && !url) throw new Error(translate("Вставь корректную ссылку на сайт: https://example.com."))
  return {
    title: input.title.trim(),
    tex: clean(input.tex),
    text: clean(input.text),
    kind,
    quiz: kind !== "link" && (input.quiz ?? previous?.quiz ?? true),
    url,
    icon: kind === "link" ? (input.icon ?? previous?.icon ?? "favicon") : undefined,
  }
}

export async function createPin(a: VaultAdapter, subject: Subject, input: PinInput, order: number): Promise<Pin> {
  const fields = pinFields(input)
  const id = genId()
  const path = await uniquePath(a, joinPath(subject.dir, PINS_DIR), safeName(input.title, "Карточка"), ".md")
  await a.writeText(path, pinFile(id, order, fields))
  return { id, subjectId: subject.id, path, order, ...fields }
}

export async function updatePin(a: VaultAdapter, pin: Pin, input: PinInput & { order?: number }): Promise<Pin> {
  const next: Pin = { ...pin, ...pinFields(input, pin), order: input.order ?? pin.order }
  const wanted = safeName(next.title, "Карточка")
  const current = basename(pin.path)
    .replace(/\.md$/, "")
    .replace(/ \(\d+\)$/, "")
  if (wanted !== current) next.path = await uniquePath(a, dirname(pin.path), wanted, ".md", pin.path)
  await a.writeText(next.path, pinFile(next.id, next.order, next))
  if (next.path !== pin.path) await a.remove(pin.path)
  return next
}

const metaRe = (name: string) => new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"\\s*/?>`, "i")

export function getHtmlMeta(html: string, name: string): string | undefined {
  return html.match(metaRe(name))?.[1]
}

export function setHtmlMeta(html: string, name: string, content: string): string {
  const tag = `<meta name="${name}" content="${content.replace(/"/g, "&quot;")}">`
  if (metaRe(name).test(html)) return html.replace(metaRe(name), tag)
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`)
  return `<!doctype html><html><head><meta charset="utf-8">${tag}</head><body>${html}</body></html>`
}

const GENERIC_NAME = /^(index|document|untitled|page|artifact|new|file|download|без названия|документ|страница)( ?\(\d+\)| ?\d+)?$/i

export function guessToolName(html: string, fileName?: string): string {
  const fromFile = fileName ? fileTitle(fileName) : ""
  if (fromFile.length > 2 && !GENERIC_NAME.test(fromFile)) return fromFile
  const title = html
    .match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
    ?.replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
  return title || fromFile || translate("Проект")
}

export async function importTool(a: VaultAdapter, subject: Subject, input: { name: string; html: string; icon: ToolIcon }): Promise<Tool> {
  const id = genId()
  const html = setHtmlMeta(setHtmlMeta(input.html, "studynotes-id", id), "studynotes-icon", input.icon)
  const path = await uniquePath(a, joinPath(subject.dir, PROJECTS_DIR), safeName(input.name, translate("Проект")), ".html")
  await a.writeText(path, html)
  return {
    id,
    subjectId: subject.id,
    path,
    name: fileTitle(basename(path)),
    kind: "html",
    ext: "html",
    icon: input.icon,
    html,
    size: html.length,
  }
}

export async function importProjectFile(
  a: VaultAdapter,
  subject: Subject,
  input: { name: string; blob: Blob; title?: string; icon?: ToolIcon },
): Promise<Tool> {
  const ext = fileExt(input.name)
  const kind = fileKind(ext)
  if (kind === "html") {
    const html = await input.blob.text()
    return importTool(a, subject, { name: input.title || guessToolName(html, input.name), html, icon: input.icon ?? "calculator" })
  }
  const title = safeName(input.title || fileTitle(input.name), "Файл")
  const path = await uniquePath(a, joinPath(subject.dir, PROJECTS_DIR), title, ext ? `.${ext}` : "")
  await a.writeBlob(path, input.blob)
  return {
    id: pathId(path),
    subjectId: subject.id,
    path,
    name: fileTitle(basename(path)) || title,
    kind,
    ext,
    icon: "calculator",
    html: "",
    size: input.blob.size,
  }
}

export async function migrateTools(a: VaultAdapter): Promise<number> {
  let moved = 0
  for (const root of await a.list("")) {
    if (root.kind !== "dir" || root.name.startsWith(".")) continue
    const old = joinPath(root.name, TOOLS_DIR)
    const entries = await a.list(old)
    for (const e of entries) {
      const from = joinPath(old, e.name)
      const { base, ext } = splitExt(e.name)

      if (e.kind === "file" && fileKind(fileExt(e.name)) === "html") {
        const html = await a.readText(from)
        if (html !== null && !getHtmlMeta(html, "studynotes-id")) await a.writeText(from, setHtmlMeta(html, "studynotes-id", pathId(from)))
      }
      const to = await uniquePath(a, joinPath(root.name, PROJECTS_DIR), base, ext)
      await a.move(from, to)
      moved++
    }
    if (entries.length && !(await a.list(old)).length) await a.remove(old)
  }
  return moved
}

export async function updateTool(a: VaultAdapter, tool: Tool, input: { name: string; icon: ToolIcon }): Promise<Tool> {
  if (tool.kind !== "html") {
    const wanted = safeName(input.name, "Файл")
    const current = fileTitle(basename(tool.path)).replace(/ \(\d+\)$/, "")
    const ext = tool.ext ? `.${tool.ext}` : ""
    const path = wanted !== current ? await uniquePath(a, dirname(tool.path), wanted, ext, tool.path) : tool.path
    if (path !== tool.path) await a.move(tool.path, path)

    return { ...tool, path, name: fileTitle(basename(path)) || wanted }
  }
  const html = setHtmlMeta(setHtmlMeta(tool.html, "studynotes-id", tool.id), "studynotes-icon", input.icon)
  const wanted = safeName(input.name, "Инструмент")
  const current = basename(tool.path)
    .replace(/\.html?$/i, "")
    .replace(/ \(\d+\)$/, "")
  const path = wanted !== current ? await uniquePath(a, dirname(tool.path), wanted, ".html", tool.path) : tool.path
  await a.writeText(path, html)
  if (path !== tool.path) await a.remove(tool.path)
  return { ...tool, path, html, icon: input.icon, name: basename(path).replace(/\.html?$/i, "") }
}

export async function createBoard(a: VaultAdapter, subject: Subject, name: string, data: BoardData = emptyBoard()): Promise<Board> {
  const id = genId()
  const path = await uniquePath(a, joinPath(subject.dir, BOARDS_DIR), safeName(name, "Доска"), BOARD_EXT)
  await a.writeText(path, serializeBoard(id, data))
  return { id, subjectId: subject.id, path, name: fileTitle(basename(path)), data }
}

export async function saveBoard(a: VaultAdapter, board: Board, data: BoardData): Promise<Board> {
  await a.writeText(board.path, serializeBoard(board.id, data))
  return { ...board, data }
}

export async function renameBoard(a: VaultAdapter, board: Board, name: string): Promise<Board> {
  const wanted = safeName(name, "Доска")
  const current = fileTitle(basename(board.path)).replace(/ \(\d+\)$/, "")
  if (wanted === current) return board
  const path = await uniquePath(a, dirname(board.path), wanted, BOARD_EXT, board.path)

  await a.writeText(board.path, serializeBoard(board.id, board.data))
  if (path !== board.path) await a.move(board.path, path)
  return { ...board, path, name: fileTitle(basename(path)) }
}

export async function saveBoardImage(a: VaultAdapter, board: Pick<Board, "path">, file: Blob): Promise<string> {
  const dir = dirname(board.path)
  return joinPath(dir, await saveAsset(a, dir, file))
}

export async function updateSubject(a: VaultAdapter, subject: Subject, input: SubjectInput): Promise<Subject> {
  let dir = subject.dir
  const base = subjectName(input.name, subject.name)
  if (base !== basename(subject.dir)) {
    dir = await uniquePath(a, dirname(subject.dir), base, "")
    await a.move(subject.dir, dir)
  }
  const next: Subject = { ...subject, ...input, dir, name: basename(dir), customColor: validCustomColor(input.customColor) }
  await writeSubjectMeta(a, next)
  return next
}

export async function countNotes(a: VaultAdapter) {
  let n = 0
  for await (const { dir } of subjectDirs(a)) {
    n += (await a.list(joinPath(dir, NOTES_DIR))).filter((e) => e.kind === "file" && e.name.endsWith(".md")).length
  }
  return n
}

export async function copyVault(from: VaultAdapter, to: VaultAdapter, dir = "", opts: { overwrite?: boolean } = {}): Promise<number> {
  let copied = 0
  for (const e of await from.list(dir)) {
    const path = joinPath(dir, e.name)
    if (path === TRASH_DIR) continue
    if (e.kind === "dir") {
      copied += await copyVault(from, to, path, opts)
    } else if (opts.overwrite || !(await to.exists(path))) {
      const blob = await from.readBlob(path)
      if (blob) {
        await to.writeBlob(path, blob)
        copied++
      }
    }
  }
  return copied
}

function subjectName(name: string, fallback: string) {
  return safeName(name.replace(/^\s*\.+/, ""), fallback)
}

export async function createSubject(a: VaultAdapter, input: SubjectInput, order: number, parent?: Subject): Promise<Subject> {
  const base = subjectName(input.name, translate("Новый предмет"))
  const dir = await uniquePath(a, parent ? joinPath(parent.dir, SUBFOLDERS_DIR) : "", base, "")
  const subject: Subject = {
    ...input,
    id: genId(),
    name: basename(dir),
    dir,
    customColor: validCustomColor(input.customColor),
    order,
    parentId: parent?.id,
  }
  await writeSubjectMeta(a, subject)
  return subject
}

export async function saveAsset(a: VaultAdapter, noteDir: string, file: Blob): Promise<string> {
  const blob = await toWebp(file)
  const ext = blob.type === "image/webp" ? "webp" : (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg")
  const rel = `assets/${genId()}.${ext}`
  await a.writeBlob(joinPath(noteDir, rel), blob)
  return rel
}

async function toWebp(file: Blob): Promise<Blob> {
  if (!/^image\/(png|jpeg|bmp)$/.test(file.type) || typeof createImageBitmap !== "function") return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
    const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale))
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const out = await canvas.convertToBlob({ type: "image/webp", quality: 0.9 })
    return out.size < file.size ? out : file
  } catch {
    return file
  }
}
