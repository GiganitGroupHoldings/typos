import { Placeholder } from "@tiptap/extensions"
import { TextSelection } from "@tiptap/pm/state"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import { BookOpen, Check, Loader2, MoreHorizontal, PenLine, Trash2, Type } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { translate, useLanguage } from "@/app/i18n"
import { useUi, type NoteFont } from "@/app/store"
import { Button } from "@/components/ui/Button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import { AI_TEXT_LIMIT, summaryRequest, textRequest, type AiAction, type AiCommand, type SummaryScope } from "@/features/ai/prompts"
import { exportMarkdown } from "@/features/notes/exportMarkdown"
import { ExportMarkdownButton } from "@/features/notes/ExportMarkdownButton"
import { openPinEditor } from "@/features/pins/PinEditorDialog"
import { errorText } from "@/lib/errors"
import { relativeTime } from "@/lib/format"
import { noteScale, type NoteSize } from "@/lib/noteSize"
import { toastUndo } from "@/lib/undo"
import { cn } from "@/lib/utils"
import { dirname, joinPath } from "@/storage/VaultAdapter"
import type { Note } from "@/types"
import { sameBody } from "@/vault/format"
import { mergeText } from "@/vault/mergeText"
import { NoteConflictError, useVault, vaultFileUrl } from "@/vault/store"
import { BubbleToolbar } from "./BubbleToolbar"
import { buildExtensions } from "./extensions"
import { MathPopover, type MathEdit } from "./MathPopover"
import { MobileEditorBar } from "./MobileEditorBar"
import { SideToolbar } from "./SideToolbar"
import { TableMenu } from "./TableMenu"
import { htmlMathToNodes, looksLikeMarkdown, normalizeMarkdownMath } from "./texImport"
import { useEditorLanguage } from "./useEditorLanguage"

const SAVE_DELAY = 500

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict"

const mounted = new Set<string>()

const isBlank = (md: string) => md.replace(/^#{1,6}\s*$/gm, "").trim() === ""

export function NoteEditor({ note, autoFocus }: { note: Note; autoFocus?: boolean }) {
  const font = useUi((s) => s.noteFont)
  const setNoteFont = useUi((s) => s.setNoteFont)
  const noteSize = useUi((s) => s.noteSize)
  const setNoteSize = useUi((s) => s.setNoteSize)
  const toggleReading = useUi((s) => s.toggleReading)
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
  const formulaRef = useRef<() => void>(() => {})
  const [assistant, setAssistant] = useState<AssistantView>(CLOSED_ASSISTANT)
  const assistantSeq = useRef(0)
  const aiBusy = useRef(false)

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

  const openedBody = useRef(note.body)
  useEffect(() => useVault.getState().adoptNote(id, openedBody.current), [id])

  useEffect(() => {
    if (!editor || conflict.current || saving.current > 0 || timer.current !== null) return
    const base = useVault.getState().noteBase(id)
    if (base === undefined || sameBody(base, note.body)) return
    loadFromDisk(note.body)
    toast(translate("Конспект обновлён"), { id: `reload-${id}` })
  }, [editor, id, note.body, loadFromDisk])

  const reading = useUi((s) => s.readingMode)
  const mapMode = useUi((s) => s.mapMode)
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!reading, false)
  }, [editor, reading])

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

  const runAi = async (action: AiAction) => {
    const ed = editorRef.current
    if (!ed || ed.isDestroyed || aiBusy.current) return
    const { from, to } = ed.state.selection
    const text = ed.state.doc.textBetween(from, to, "\n").trim()
    if (!text) {
      toast.error(translate("Выдели текст"))
      return
    }
    if (text.length > AI_TEXT_LIMIT) {
      toast.error(translate("Слишком много текста для помощника. Выдели фрагмент покороче."))
      return
    }
    aiBusy.current = true
    const toastId = toast.loading(translate("Помощник работает…"))
    try {
      const key = await loadAiKey().catch(() => null)
      const { aiBaseUrl, aiModel } = useUi.getState()
      const request = textRequest(action, text)
      const result = await chat({ baseUrl: aiBaseUrl, model: aiModel }, key ?? "", request.messages, request)
      if (ed.isDestroyed) {
        toast.dismiss(toastId)
        return
      }
      // Пока модель отвечала, выделение могли изменить: старые позиции уже не те.
      if (ed.state.doc.textBetween(from, to, "\n").trim() !== text) {
        toast.error(translate("Текст изменился, пока помощник думал. Попробуй ещё раз."), { id: toastId })
        return
      }
      ed.chain().focus().deleteRange({ from, to }).insertContent(result, { contentType: "markdown" }).run()
      toast.success(translate("Готово"), {
        id: toastId,
        action: { label: translate("Отменить"), onClick: () => ed.commands.undo() },
      })
    } catch (e) {
      if (ed.isDestroyed) toast.dismiss(toastId)
      else toast.error(translate("Помощник не справился"), { id: toastId, description: errorText(e) })
    } finally {
      aiBusy.current = false
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

  const openAssistant = () => {
    const ed = editorRef.current
    const selected = ed && !ed.isDestroyed ? ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, "\n").trim() : ""
    void runSummary(selected ? "selection" : "note")
  }

  const runAiCommand = (command: AiCommand) => {
    if (command === "summary") void runSummary("selection")
    else void runAi(command)
  }

  const currentMarkdown = () => {
    const ed = editorRef.current
    return ed && !ed.isDestroyed ? ed.getMarkdown() : note.body
  }

  return (
    <div className="flex min-h-full flex-col">
      <SideToolbar
        editor={editor}
        hidden={reading}
        onFormula={formulaFromSelection}
        onBlockFormula={() => editor && openMath(editor.state.selection.from, "block", "new")}
        onImage={() => fileInput.current?.click()}
      />
      {editor && (
        <MobileEditorBar
          editor={editor}
          reading={reading}
          onReading={toggleReading}
          onFormula={formulaFromSelection}
          onBlockFormula={() => openMath(editor.state.selection.from, "block", "new")}
          onImage={() => fileInput.current?.click()}
          onPin={() => {
            const { from, to } = editor.state.selection
            const text = editor.state.doc.textBetween(from, to, " ").trim()
            if (text) pinSelection(text)
          }}
          onExport={() => exportMarkdown(note, currentMarkdown())}
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
          {reading ? (
            <Button variant="ghost" size="sm" onClick={toggleReading}>
              <PenLine /> {translate("Редактировать")}
            </Button>
          ) : (
            <SaveIndicator state={saveState} />
          )}
          <ExportMarkdownButton note={note} getMarkdown={currentMarkdown} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={translate("Действия с конспектом")}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuCheckboxItem checked={reading} onCheckedChange={toggleReading}>
                <BookOpen /> {translate("Режим чтения")}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Type /> {translate("Шрифт текста")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={font} onValueChange={(v) => setNoteFont(v as NoteFont)}>
                    <DropdownMenuRadioItem value="inter">Inter</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="golos">Golos</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="serif">PT Serif</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
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
        className={cn(
          "note-prose mx-auto w-full pt-6 pb-44 pr-[max(1rem,var(--safe-right))] pl-[max(1rem,var(--safe-left))] transition-colors duration-(--dur-slow) md:pt-8 md:pr-20 md:pb-32 md:pl-6 lg:px-6",
          reading && "note-reading",
        )}
        data-font={reading ? "serif" : font}
        style={{ "--note-scale": noteScale(noteSize) } as CSSProperties}
      >
        <p className="mb-5 text-center text-[13px] text-muted-foreground">
          {note.created === note.updated ? translate("Новый конспект") : translate("Изменено {0}", relativeTime(note.updated))}
        </p>

        <div className="relative">
          <EditorContent editor={editor} />
          {editor && <BlockHandle editor={editor} disabled={reading || mapMode} />}
          {editor && <NoteCanvas key={note.id} editor={editor} noteId={note.id} readOnly={reading} />}
        </div>
      </div>

      <MathPopover edit={math} onSave={saveMath} onDelete={deleteMath} onCancel={cancelMath} onPin={pinMath} />
      {editor && (
        <AiAssistant view={assistant} onOpen={openAssistant} onClose={closeAssistant} onRetry={() => void runSummary(assistant.scope)} />
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
