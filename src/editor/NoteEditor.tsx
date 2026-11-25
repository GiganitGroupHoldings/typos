import { Placeholder } from "@tiptap/extensions"
import { closeHistory } from "@tiptap/pm/history"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import { Check, FilePlus2, LayoutDashboard, Loader2, MoreHorizontal, Trash2, Type } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { translate, useLanguage } from "@/app/i18n"
import { useUi } from "@/app/store"
import { Button } from "@/components/ui/Button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu"
import { BlockHandle } from "@/editor/blocks/BlockHandle"
import { Folding } from "@/editor/blocks/folding"
import { NoteCanvas } from "@/editor/map/NoteCanvas"
import { AiAssistant } from "@/features/ai/AiAssistant"
import { CLOSED_ASSISTANT, type AssistantView } from "@/features/ai/assistantView"
import { chat } from "@/features/ai/client"
import { loadAiKey } from "@/features/ai/keyStore"
import { boardSourceChunks, generateNoteBoard } from "@/features/ai/noteBoard"
import { AI_TEXT_LIMIT, summaryRequest, textRequest, type AiAction, type AiCommand, type SummaryScope } from "@/features/ai/prompts"
import { exportMarkdown } from "@/features/notes/exportMarkdown"
import { ExportMarkdownButton } from "@/features/notes/ExportMarkdownButton"
import { NoteFontsDialog } from "@/features/notes/NoteFontsDialog"
import { noteHref, resolveNoteLink } from "@/features/notes/subnotes"
import { useCustomNoteFonts } from "@/features/notes/useCustomNoteFonts"
import { openPinEditor } from "@/features/pins/PinEditorDialog"
import { folderHref, resolveFolderLink } from "@/features/subjects/folderLinks"
import { errorText } from "@/lib/errors"
import { relativeTime } from "@/lib/format"
import { normalizeNoteFont, NOTE_FONTS } from "@/lib/noteFonts"
import { noteScale, type NoteSize } from "@/lib/noteSize"
import { toastUndo } from "@/lib/undo"
import { cn } from "@/lib/utils"
import { dirname, joinPath } from "@/storage/VaultAdapter"
import type { Note } from "@/types"
import { sameBody } from "@/vault/format"
import { mergeText } from "@/vault/mergeText"
import { NoteConflictError, useVault, vaultFileUrl } from "@/vault/store"
import { AiEditEffect, aiEditUndo, revealAiEdit, showAiPending } from "./aiEditEffect"
import { findSourceBlock, noteBoardParts } from "./boardSource"
import { BubbleToolbar } from "./BubbleToolbar"
import { buildExtensions } from "./extensions"
import { MathPopover, type MathEdit } from "./MathPopover"
import { MobileEditorBar } from "./MobileEditorBar"
import { NewSubnoteDialog } from "./NewSubnoteDialog"
import { applyProofEdits, proofEdits, proofMessages, proofSegments, type ProofEdit } from "./proofread"
import { ProofreadDialog } from "./ProofreadDialog"
import { SideToolbar } from "./SideToolbar"
import { TableMenu } from "./TableMenu"
import { htmlMathToNodes, looksLikeMarkdown, normalizeMarkdownMath } from "./texImport"
import { useEditorLanguage } from "./useEditorLanguage"

const SAVE_DELAY = 500

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict"

const mounted = new Set<string>()

const isBlank = (md: string) => md.replace(/^#{1,6}\s*$/gm, "").trim() === ""

export function NoteEditor({
  note,
  autoFocus,
  sourceBlock,
  sourceQuote,
}: {
  note: Note
  autoFocus?: boolean
  sourceBlock?: string | null
  sourceQuote?: string | null
}) {
  const font = useUi((s) => s.noteFont)
  const setNoteFont = useUi((s) => s.setNoteFont)
  const noteSize = useUi((s) => s.noteSize)
  const setNoteSize = useUi((s) => s.setNoteSize)
  const customFonts = useCustomNoteFonts()
  const [fontsOpen, setFontsOpen] = useState(false)
  const navigate = useNavigate()
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [math, setMath] = useState<MathEdit | null>(null)
  const timer = useRef<number | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const id = note.id
  const noteDir = useRef(dirname(note.path))
  useEffect(() => {
    noteDir.current = dirname(note.path)
  }, [note.path])
  const fileInput = useRef<HTMLInputElement>(null)
  const [linkRequest, setLinkRequest] = useState(0)
  const [newSubnote, setNewSubnote] = useState(false)
  const formulaRef = useRef<() => void>(() => {})
  const [assistant, setAssistant] = useState<AssistantView>(CLOSED_ASSISTANT)
  const [assistantContainer, setAssistantContainer] = useState<HTMLElement | null>(null)
  const attachAssistant = useCallback((element: HTMLDivElement | null) => {
    setAssistantContainer(element?.closest<HTMLElement>("#main") ?? null)
  }, [])
  const assistantSeq = useRef(0)
  const aiRequest = useRef<AbortController | null>(null)
  const [proof, setProof] = useState<{ doc: ProseMirrorNode; edits: ProofEdit[] } | null>(null)

  const conflict = useRef(false)
  const saving = useRef(0)

  const unsaved = useRef("")

  const loadFromDisk = useCallback(
    (body: string) => {
      const ed = editorRef.current
      conflict.current = false
      useVault.getState().adoptNote(id, body)
      if (!ed || ed.isDestroyed) return
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
      const at = ed.state.selection.from
      ed.chain()
        .setContent(normalizeMarkdownMath(body), { contentType: "markdown", emitUpdate: false })
        .command(({ tr }) => {
          tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at, tr.doc.content.size))))
          return true
        })
        .run()
      setSaveState("saved")
    },
    [id],
  )

  const showConflict = useCallback(() => {
    conflict.current = true
    setSaveState("conflict")
    const takeDisk = async () => {
      await useVault.getState().refresh()
      const fresh = useVault.getState().notes.find((n) => n.id === id)
      if (fresh) return loadFromDisk(fresh.body)
      conflict.current = false
      toast(translate("Конспект удалили или переместили"))
      navigate(`/s/${note.subjectId}`)
    }
    const keepMine = async () => {
      const ed = editorRef.current
      const md = ed && !ed.isDestroyed ? ed.getMarkdown() : unsaved.current
      conflict.current = false
      setSaveState("saving")
      try {
        await useVault.getState().saveNote(id, md, { force: true })
        setSaveState("saved")
      } catch (e) {
        setSaveState("error")
        toast.error(translate("Не удалось сохранить"), { description: errorText(e) })
      }
    }
    toast.warning(translate("Конспект изменён вне приложения"), {
      id: `conflict-${id}`,
      description: translate("Какую версию сохранить?"),
      duration: Infinity,
      action: { label: translate("С диска"), onClick: () => void takeDisk() },
      cancel: { label: translate("Текущую"), onClick: () => void keepMine() },
    })
  }, [id, loadFromDisk, navigate, note.subjectId])

  const save = useCallback(
    async function saveCurrent() {
      const ed = editorRef.current
      if (!ed || ed.isDestroyed) return
      const md = ed.getMarkdown()

      if (conflict.current) return void (unsaved.current = md)
      if (saving.current > 0) {
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          timer.current = null
          void saveCurrent()
        }, SAVE_DELAY)
        return
      }
      saving.current++
      setSaveState("saving")
      try {
        const saved = await useVault.getState().saveNote(id, md)
        if (saved !== undefined && saved !== md && !ed.isDestroyed) {
          const current = ed.getMarkdown()
          const merged = mergeText(md, current, saved)
          if (merged === null) return showConflict()
          loadFromDisk(merged)
          useVault.getState().adoptNote(id, saved)
          if (merged !== saved) {
            setSaveState("dirty")
            timer.current = window.setTimeout(() => {
              timer.current = null
              void saveCurrent()
            }, SAVE_DELAY)
          }
        }
        setSaveState((s) => (s === "saving" ? "saved" : s))
      } catch (e) {
        if (e instanceof NoteConflictError) {
          unsaved.current = md
          return showConflict()
        }
        setSaveState("error")
        toast.error(translate("Не удалось сохранить"), { description: errorText(e) })
      } finally {
        saving.current--
      }
    },
    [id, showConflict, loadFromDisk],
  )

  const flush = useCallback(() => {
    if (timer.current === null) return
    clearTimeout(timer.current)
    timer.current = null
    void save()
  }, [save])

  const openMath = useCallback((pos: number, kind: MathEdit["kind"], mode: MathEdit["mode"], to?: number) => {
    const ed = editorRef.current
    if (!ed || !ed.isEditable) return
    const dom = mode === "edit" ? (ed.view.nodeDOM(pos) as HTMLElement | null) : null
    let rect = dom?.getBoundingClientRect()
    if (!rect) {
      const c = ed.view.coordsAtPos(pos)
      rect = new DOMRect(c.left, c.top, 1, c.bottom - c.top)
    }
    const node = mode === "edit" ? ed.state.doc.nodeAt(pos) : null
    const selected = mode === "new" && to !== undefined && to > pos ? ed.state.doc.textBetween(pos, to) : ""
    setMath({ mode, kind, pos, to, latex: (node?.attrs.latex as string | undefined) ?? selected, rect })
  }, [])

  const extensions = useMemo(
    () => [
      ...buildExtensions({
        onMathClick: (_node, pos, kind) => openMath(pos, kind, "edit"),
        onBlockMathCreated: (pos) => openMath(pos, "block", "edit"),
        resolveImage: (src) => vaultFileUrl(joinPath(noteDir.current, src)),
        diagrams: true,
        ascii: true,
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading" && node.attrs.level === 1 ? translate("Заголовок") : translate("Текст конспекта"),
      }),
      Folding.configure({ noteId: note.id }),
      AiEditEffect,
    ],
    [openMath, note.id],
  )

  const insertImages = useCallback(
    async (files: File[], at?: number) => {
      const ed = editorRef.current
      if (!ed) return
      for (const f of files) {
        try {
          const src = await useVault.getState().saveImage(id, f)
          ed.chain()
            .focus()
            .insertContentAt(at ?? ed.state.selection.from, { type: "image", attrs: { src, alt: "" } })
            .run()
        } catch (e) {
          toast.error(translate("Не удалось вставить картинку"), { description: errorText(e) })
        }
      }
    },
    [id],
  )
  const imagesOf = (list?: FileList | null) => [...(list ?? [])].filter((f) => f.type.startsWith("image/"))

  const editor = useEditor(
    {
      extensions,
      ...(isBlank(note.body)
        ? { content: { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] } }
        : { content: normalizeMarkdownMath(note.body), contentType: "markdown" as const }),
      autofocus: autoFocus ? "start" : false,
      editorProps: {
        handleDOMEvents: {
          click: (_view, event) => {
            if (!(event.target instanceof Element) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
            const href = event.target.closest("a")?.getAttribute("href")
            if (!href || !/^\/s\/[\w%-]+(?:\/n\/[\w%-]+)?$/.test(href)) return false
            event.preventDefault()
            const { notes, subjects } = useVault.getState()
            const isNote = href.includes("/n/")
            const exists = isNote ? notes.some((n) => noteHref(n) === href) : subjects.some((s) => folderHref(s.id) === href)
            if (exists) void navigate(href)
            else toast.error(translate(isNote ? "Конспект по этой ссылке не найден" : "Папка по этой ссылке не найдена"))
            return true
          },
        },
        handleTextInput: (view, from, to, text) => {
          const at = view.state.doc.resolve(from)
          if (text !== "]" || from !== to || at.parent.type.spec.code) return false
          const before = at.parent.textBetween(0, at.parentOffset, "\n", "\n")
          const match = /\[\[([^[\]\n]+)\]$/.exec(before)
          if (!match) return false
          const label = match[1].trim()
          const { notes, subjects } = useVault.getState()
          const linkedNote = resolveNoteLink(notes, note, label)
          const folder = linkedNote ? undefined : resolveFolderLink(subjects, note.subjectId, label)
          const href = linkedNote ? noteHref(linkedNote) : folder && folderHref(folder.id)
          if (!href) return false
          const { schema, tr } = view.state
          const link = schema.marks.link.create({ href })
          view.dispatch(tr.replaceWith(from - match[0].length, from, schema.text(label, [link])).removeStoredMark(link.type))
          return true
        },
        handleKeyDown: (view, event) => {
          const mod = event.ctrlKey || event.metaKey
          if (!mod || view.state.selection.empty) return false
          if (event.code === "KeyK" && !event.shiftKey) {
            setLinkRequest((n) => n + 1)
            return true
          }
          if (event.code === "KeyE" && event.shiftKey) {
            formulaRef.current()
            return true
          }
          return false
        },
        handlePaste: (view, event) => {
          const data = event.clipboardData
          const files = imagesOf(data?.files)
          if (files.length) {
            void insertImages(files)
            return true
          }

          const text = data?.getData("text/plain") ?? ""
          const ed = editorRef.current
          if (!ed || data?.getData("text/html") || view.state.selection.$from.parent.type.spec.code) return false
          if (!looksLikeMarkdown(text)) return false
          ed.commands.insertContent(normalizeMarkdownMath(text), { contentType: "markdown" })
          return true
        },

        transformPastedHTML: (html) => htmlMathToNodes(html),
        handleDrop: (view, event, _slice, moved) => {
          const files = imagesOf(event.dataTransfer?.files)
          if (moved || !files.length) return false
          void insertImages(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos)
          return true
        },
      },
      onUpdate: ({ transaction }) => {
        if (!transaction.docChanged) return
        setSaveState("dirty")
        if (timer.current !== null) clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          timer.current = null
          void save()
        }, SAVE_DELAY)
      },
    },
    [id],
  )
  useEditorLanguage(editor, true)
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => () => aiRequest.current?.abort(), [])

  useEffect(() => {
    if (!editor || sourceBlock == null || !sourceQuote || sourceQuote.length > 100 || !/^\d+$/.test(sourceBlock)) return
    const position = findSourceBlock(editor.state.doc, Number(sourceBlock), sourceQuote)
    if (position === undefined) {
      toast(translate("Исходный фрагмент изменился. Открыт конспект."))
      return
    }
    const node = editor.view.nodeDOM(position)
    if (!(node instanceof HTMLElement)) return
    const frame = requestAnimationFrame(() => {
      node.scrollIntoView({ block: "center" })
      node.animate([{ backgroundColor: "var(--accent)" }, { backgroundColor: "transparent" }], { duration: 2400 })
    })
    return () => cancelAnimationFrame(frame)
  }, [editor, sourceBlock, sourceQuote])

  const openedBody = useRef(note.body)
  useEffect(() => useVault.getState().adoptNote(id, openedBody.current), [id])

  useEffect(() => {
    if (!editor || conflict.current || saving.current > 0 || timer.current !== null) return
    const base = useVault.getState().noteBase(id)
    if (base === undefined || sameBody(base, note.body)) return
    loadFromDisk(note.body)
    toast(translate("Конспект обновлён"), { id: `reload-${id}` })
  }, [editor, id, note.body, loadFromDisk])

  const mapMode = useUi((s) => s.mapMode)

  useEffect(() => {
    mounted.add(id)
    const onHide = () => document.visibilityState === "hidden" && flush()
    window.addEventListener("beforeunload", flush)
    document.addEventListener("visibilitychange", onHide)
    return () => {
      mounted.delete(id)
      window.removeEventListener("beforeunload", flush)
      document.removeEventListener("visibilitychange", onHide)
      flush()

      setTimeout(() => {
        if (!mounted.has(id)) void useVault.getState().discardIfEmpty(id)
      })
    }
  }, [flush, id])

  const saveMath = (latex: string) => {
    if (!editor || !math) return
    const type = math.kind === "inline" ? "inlineMath" : "blockMath"
    const chain = editor.chain().focus()
    if (math.mode === "edit") {
      chain.command(({ tr }) => {
        const node = tr.doc.nodeAt(math.pos)
        if (!node) return false
        tr.setNodeMarkup(math.pos, undefined, { ...node.attrs, latex })
        return true
      })
    } else {
      chain.insertContentAt({ from: math.pos, to: math.to ?? math.pos }, { type, attrs: { latex } })
    }

    chain
      .command(({ tr }) => {
        const at = math.mode === "edit" ? math.pos : tr.mapping.map(math.pos, -1)
        const node = tr.doc.nodeAt(at)
        if (!node) return true
        const after = Math.min(at + node.nodeSize, tr.doc.content.size)
        tr.setSelection(TextSelection.near(tr.doc.resolve(after)))
        return true
      })
      .run()
    setMath(null)
  }

  const deleteMath = () => {
    if (!editor || !math) return
    if (math.mode === "edit") {
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          const node = tr.doc.nodeAt(math.pos)
          if (!node) return false
          tr.delete(math.pos, math.pos + node.nodeSize)
          return true
        })
        .run()
    }
    setMath(null)
  }

  const cancelMath = () => {
    if (editor && math?.mode === "edit" && !editor.state.doc.nodeAt(math.pos)?.attrs.latex) return deleteMath()
    editor?.commands.focus()
    setMath(null)
  }

  const formulaFromSelection = () => {
    const ed = editorRef.current
    if (ed) openMath(ed.state.selection.from, "inline", "new", ed.state.selection.to)
  }

  useEffect(() => {
    formulaRef.current = formulaFromSelection
  })

  useEffect(
    () => () => {
      // Ответ, пришедший после закрытия конспекта, уже никому не нужен.
      assistantSeq.current++
    },
    [],
  )

  const pinSelection = (text: string) => {
    const title = text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text
    openPinEditor({ subjectId: note.subjectId, title, text: text.length > 60 ? text : undefined })
  }

  const pinMath = (latex: string) => {
    if (math?.mode === "edit") saveMath(latex)
    else setMath(null)
    openPinEditor({ subjectId: note.subjectId, tex: latex })
  }

  const aiUndoAction = (editor: Editor) => {
    const undo = aiEditUndo(editor)
    return {
      label: translate("Отменить"),
      onClick: () => {
        if (!undo()) toast(translate("После правки текст изменился. Используй историю отмены редактора."))
      },
    }
  }

  const runAi = async (action: AiAction, scope: SummaryScope) => {
    const ed = editorRef.current
    if (!ed?.isEditable || ed.isDestroyed || aiRequest.current) return
    const { doc, selection } = ed.state
    const { from, to } = scope === "note" ? { from: 0, to: doc.content.size } : selection
    const text = (scope === "note" ? ed.getMarkdown() : doc.textBetween(from, to, "\n")).trim()
    if (isBlank(text)) {
      toast.error(translate(scope === "note" ? "В конспекте пока нет текста." : "Выдели текст"))
      return
    }
    if (text.length > AI_TEXT_LIMIT) {
      toast.error(translate("Слишком много текста для помощника. Выдели фрагмент покороче."))
      return
    }
    const controller = new AbortController()
    aiRequest.current = controller
    const clearPending = showAiPending(ed, { from, to })
    const toastId = toast.loading(translate("Помощник работает…"), {
      cancel: { label: translate("Отмена"), onClick: () => controller.abort() },
    })
    try {
      const key = await loadAiKey().catch(() => null)
      controller.signal.throwIfAborted()
      const { aiBaseUrl, aiModel } = useUi.getState()
      const request = textRequest(action, text, scope)
      const result = await chat({ baseUrl: aiBaseUrl, model: aiModel }, key ?? "", request.messages, {
        ...request,
        signal: controller.signal,
        rejectTruncated: scope === "note",
      })
      if (controller.signal.aborted || ed.isDestroyed) {
        toast.dismiss(toastId)
        return
      }
      if (!ed.isEditable || !ed.state.doc.eq(doc)) throw new Error(translate("Текст изменился, пока помощник думал. Попробуй ещё раз."))
      const edit = ed.chain().command(({ tr }) => {
        closeHistory(tr)
        return true
      })
      if (scope === "note") edit.setContent(normalizeMarkdownMath(result), { contentType: "markdown" })
      else edit.insertContentAt({ from, to }, result, { contentType: "markdown" })
      const changed = edit
        .command(({ tr }) => {
          revealAiEdit(tr)
          return tr.docChanged
        })
        .run()
      if (!changed) throw new Error(translate("Не удалось вставить ответ помощника. Попробуй ещё раз."))
      toast.success(translate("Готово"), { id: toastId, action: aiUndoAction(ed) })
    } catch (e) {
      if (controller.signal.aborted || ed.isDestroyed) toast.dismiss(toastId)
      else toast.error(translate("Помощник не справился"), { id: toastId, description: errorText(e) })
    } finally {
      clearPending()
      aiRequest.current = null
    }
  }

  const remove = async () => {
    flush()
    const undo = await useVault.getState().trashNote(id)
    navigate(`/s/${note.subjectId}`)
    toastUndo(translate("Конспект в корзине"), undo, () => navigate(`/s/${note.subjectId}/n/${id}`))
  }

  const closeAssistant = () => {
    assistantSeq.current++
    setAssistant(CLOSED_ASSISTANT)
  }

  const runSummary = async (scope: SummaryScope) => {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return
    const { from, to } = ed.state.selection
    const text =
      scope === "selection"
        ? ed.state.doc.textBetween(from, to, "\n").trim()
        : ed.state.doc.textBetween(0, ed.state.doc.content.size, "\n").trim()
    if (!text) {
      toast.error(translate(scope === "selection" ? "Выдели текст" : "В конспекте пока нет текста — напиши его или выдели фрагмент."))
      return
    }
    const ticket = ++assistantSeq.current
    const request = summaryRequest(text, scope)
    setAssistant({ status: "loading", scope, text: "", truncated: request.truncated, error: "" })
    try {
      const key = await loadAiKey().catch(() => null)
      const { aiBaseUrl, aiModel } = useUi.getState()
      const result = await chat({ baseUrl: aiBaseUrl, model: aiModel }, key ?? "", request.messages, request)
      if (ticket !== assistantSeq.current) return
      setAssistant({ status: "ready", scope, text: result, truncated: request.truncated, error: "" })
    } catch (e) {
      if (ticket !== assistantSeq.current) return
      setAssistant({ status: "error", scope, text: "", truncated: request.truncated, error: errorText(e) })
    }
  }

  const runProofread = async (scope: SummaryScope) => {
    const ed = editorRef.current
    if (!ed?.isEditable || ed.isDestroyed || aiRequest.current) return
    const { doc, selection } = ed.state
    const range = scope === "note" ? { from: 0, to: doc.content.size } : selection
    const segments = proofSegments(doc, range.from, range.to)
    if (!segments.length) return void toast.error(translate(scope === "note" ? "В конспекте пока нет текста." : "Выдели текст"))
    if (segments.length > 150 || segments.reduce((size, segment) => size + segment.text.length, 0) > AI_TEXT_LIMIT)
      return void toast.error(translate("Слишком много текста для помощника. Выдели фрагмент покороче."))
    const controller = new AbortController()
    aiRequest.current = controller
    const clearPending = showAiPending(ed, range)
    const toastId = toast.loading(translate("Проверяю ошибки…"), {
      cancel: { label: translate("Отмена"), onClick: () => controller.abort() },
    })
    try {
      const key = await loadAiKey().catch(() => null)
      controller.signal.throwIfAborted()
      const { aiBaseUrl, aiModel } = useUi.getState()
      const answer = await chat({ baseUrl: aiBaseUrl, model: aiModel }, key ?? "", proofMessages(segments), {
        maxTokens: 3200,
        temperature: 0.1,
        signal: controller.signal,
      })
      if (controller.signal.aborted || ed.isDestroyed) return
      if (!ed.state.doc.eq(doc)) throw new Error(translate("Текст изменился, пока помощник думал. Попробуй ещё раз."))
      const edits = proofEdits(answer, segments)
      if (edits.length) setProof({ doc, edits })
      else toast.success(translate("Помощник не нашёл ошибок."))
    } catch (e) {
      if (!controller.signal.aborted) toast.error(errorText(e))
    } finally {
      clearPending()
      toast.dismiss(toastId)
      aiRequest.current = null
    }
  }

  const applyProof = (edits: ProofEdit[]) => {
    const ed = editorRef.current
    setProof(null)
    if (!ed?.isEditable || ed.isDestroyed || !proof || !ed.state.doc.eq(proof.doc))
      return void toast.error(translate("Текст изменился, пока помощник думал. Попробуй ещё раз."))
    ed.view.dispatch(revealAiEdit(applyProofEdits(ed.state.tr, edits)))
    toast.success(translate("Исправления применены"), { action: aiUndoAction(ed) })
  }

  const runNoteBoard = async (scope: SummaryScope) => {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed || aiRequest.current) return
    const { doc, selection } = ed.state
    const adapter = useVault.getState().adapter
    const controller = new AbortController()
    aiRequest.current = controller
    const cancel = { label: translate("Отмена"), onClick: () => controller.abort() }
    const toastId = toast.loading(translate("Собираю доску…"), { cancel })
    try {
      const parts = scope === "selection" ? noteBoardParts(doc, selection.from, selection.to) : noteBoardParts(doc)
      if (!parts.length) throw new Error(translate("Для доски нужно хотя бы две связанные мысли. Добавь их в конспект."))
      const chunks = boardSourceChunks(parts)
      flush()
      const title = doc.firstChild?.type.name === "heading" ? doc.firstChild.textContent.trim() || note.title : note.title
      const key = await loadAiKey().catch(() => null)
      const { aiBaseUrl, aiModel } = useUi.getState()
      const { data, fallback } = await generateNoteBoard(
        { baseUrl: aiBaseUrl, model: aiModel },
        key ?? "",
        title,
        chunks,
        { subjectId: note.subjectId, noteId: id },
        (message) => toast.loading(message, { id: toastId, cancel }),
        controller.signal,
      )
      if (controller.signal.aborted || ed.isDestroyed || useVault.getState().adapter !== adapter) return
      if (!ed.state.doc.eq(doc)) throw new Error(translate("Текст изменился, пока помощник думал. Попробуй ещё раз."))
      toast.loading(translate("Сохраняю доску…"), { id: toastId, cancel: undefined })
      const board = await useVault.getState().createBoard(note.subjectId, title.slice(0, 100), data)
      if (controller.signal.aborted || ed.isDestroyed || useVault.getState().adapter !== adapter) return
      if (fallback) toast.warning(translate("Модель не собрала схему. Доска создана из фрагментов конспекта."))
      else toast.success(translate("Доска создана"))
      navigate(`/s/${note.subjectId}/b/${board.id}`)
    } catch (e) {
      if (!controller.signal.aborted) toast.error(translate("Не удалось создать доску"), { description: errorText(e) })
    } finally {
      toast.dismiss(toastId)
      aiRequest.current = null
    }
  }

  const runAiCommand = (command: AiCommand, scope: SummaryScope = "selection") => {
    if (command === "summary") void runSummary(scope)
    else if (command === "proofread") void runProofread(scope)
    else if (command === "board") void runNoteBoard(scope)
    else void runAi(command, scope)
  }

  const currentMarkdown = () => {
    const ed = editorRef.current
    return ed && !ed.isDestroyed ? ed.getMarkdown() : note.body
  }

  const createSubnote = async (name: string) => {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) throw new Error(translate("Открой конспект и попробуй ещё раз"))
    const child = await useVault.getState().createNote(note.subjectId, `# ${name}`, note.id)
    if (ed.isDestroyed) return
    ed.commands.insertContentAt(ed.state.doc.content.size, {
      type: "paragraph",
      content: [{ type: "text", text: name, marks: [{ type: "link", attrs: { href: noteHref(child) } }] }],
    })
  }

  return (
    <div ref={attachAssistant} className="flex min-h-full flex-col">
      <SideToolbar
        editor={editor}
        onFormula={formulaFromSelection}
        onBlockFormula={() => editor && openMath(editor.state.selection.from, "block", "new")}
        onImage={() => fileInput.current?.click()}
      />
      {editor && (
        <MobileEditorBar
          editor={editor}
          onFonts={() => setFontsOpen(true)}
          onFormula={formulaFromSelection}
          onBlockFormula={() => openMath(editor.state.selection.from, "block", "new")}
          onImage={() => fileInput.current?.click()}
          onPin={() => {
            const { from, to } = editor.state.selection
            const text = editor.state.doc.textBetween(from, to, " ").trim()
            if (text) pinSelection(text)
          }}
          onExport={() => exportMarkdown(note, currentMarkdown())}
          onCreateBoard={() => void runNoteBoard("note")}
          onCreateSubnote={() => setNewSubnote(true)}
          onDelete={remove}
          saveState={saveState}
          noteSize={noteSize}
          onNoteSize={setNoteSize}
        />
      )}
      {editor && (
        <BubbleToolbar
          editor={editor}
          linkRequest={linkRequest}
          onFormula={formulaFromSelection}
          onPin={pinSelection}
          onAi={runAiCommand}
        />
      )}
      {editor && <TableMenu editor={editor} />}

      <div className="pointer-events-none sticky top-14 z-10 -mt-1 hidden items-center justify-end gap-2 px-3 pt-1 [&>*]:pointer-events-auto md:top-12 md:flex">
        <div className="hidden">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              void insertImages(imagesOf(e.target.files))
              e.target.value = ""
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SaveIndicator state={saveState} />
          <ExportMarkdownButton note={note} getMarkdown={currentMarkdown} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={translate("Действия с конспектом")}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => setNewSubnote(true)}>
                <FilePlus2 /> {translate("Новый дочерний конспект")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void runNoteBoard("note")}>
                <LayoutDashboard /> {translate("Создать доску по конспекту")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Type /> {translate("Шрифт текста")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-48">
                  <DropdownMenuRadioGroup value={font} onValueChange={(value) => setNoteFont(normalizeNoteFont(value))}>
                    {Object.entries(NOTE_FONTS).map(([id, { name, family }]) => (
                      <DropdownMenuRadioItem key={id} value={id} style={{ fontFamily: family }}>
                        {name}
                      </DropdownMenuRadioItem>
                    ))}
                    {customFonts.fonts.map(({ id, name }) => (
                      <DropdownMenuRadioItem key={id} value={id}>
                        <span className="max-w-48 truncate">{name}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setFontsOpen(true)}>{translate("Управление шрифтами…")}</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Type /> {translate("Размер текста")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={noteSize} onValueChange={(v) => setNoteSize(v as NoteSize)}>
                    <DropdownMenuRadioItem value="s">{translate("Мелкий")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="m">{translate("Обычный")}</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="l">{translate("Крупный")}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={remove}>
                <Trash2 /> {translate("Удалить конспект")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        className="note-prose mx-auto w-full pt-6 pb-44 pr-[max(1rem,var(--safe-right))] pl-[max(1rem,var(--safe-left))] transition-colors duration-(--dur-slow) md:pt-8 md:pr-20 md:pb-32 md:pl-6 lg:px-6"
        data-font={font}
        style={{ "--note-scale": noteScale(noteSize), "--note-font": customFonts.family } as CSSProperties}
      >
        <p className="mb-5 text-center text-[13px] text-muted-foreground">
          {note.created === note.updated ? translate("Новый конспект") : translate("Изменено {0}", relativeTime(note.updated))}
        </p>

        <div className="relative">
          <EditorContent editor={editor} />
          {editor && <BlockHandle editor={editor} disabled={mapMode} />}
          {editor && <NoteCanvas key={note.id} editor={editor} noteId={note.id} />}
        </div>
      </div>

      <MathPopover edit={math} onSave={saveMath} onDelete={deleteMath} onCancel={cancelMath} onPin={pinMath} />
      {newSubnote && <NewSubnoteDialog onClose={() => setNewSubnote(false)} onCreate={createSubnote} />}
      {fontsOpen && <NoteFontsDialog custom={customFonts} onClose={() => setFontsOpen(false)} />}
      {proof && <ProofreadDialog edits={proof.edits} onClose={() => setProof(null)} onApply={applyProof} />}
      {editor && (
        <AiAssistant
          container={assistantContainer}
          view={assistant}
          onTool={(command) => runAiCommand(command, "note")}
          onClose={closeAssistant}
          onRetry={() => void runSummary(assistant.scope)}
        />
      )}
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  useLanguage()
  return (
    <span
      aria-live="polite"
      className={cn(
        "flex items-center gap-1 px-1 text-[12px]",
        state === "error" || state === "conflict" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {state === "saving" || state === "dirty" ? (
        <>
          <Loader2 className="size-3 animate-spin" /> {translate("Сохранение…")}
        </>
      ) : state === "error" ? (
        translate("Ошибка сохранения")
      ) : state === "conflict" ? (
        translate("Не сохранено: файл изменён вне приложения")
      ) : (
        <>
          <Check className="size-3" /> {translate("Сохранено")}
        </>
      )}
    </span>
  )
}
