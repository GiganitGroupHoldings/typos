import { BookOpen, ChevronLeft, ChevronRight, Download, Eye, EyeOff, PictureInPicture2, Play, RotateCw, Smartphone, X } from "lucide-react"
import { motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router"
import { translate, useLanguage } from "@/app/i18n"
import { useUi } from "@/app/store"
import { Button } from "@/components/ui/Button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip"
import { kindLabels, toolIcon } from "@/features/subjects/visuals"
import { PhonePreview } from "@/features/tools/PhonePreview"
import { looksLikeSlides } from "@/features/tools/presentation/htmlSlides"
import { PresentationNotes } from "@/features/tools/presentation/PresentationNotes"
import { loadPresentNote, pickPresentNote, savePresentNote } from "@/features/tools/presentation/presentNote"
import { downloadProjectFile } from "@/features/tools/projectFiles"
import { ProjectViewer } from "@/features/tools/ProjectViewer"
import { ToolActions } from "@/features/tools/ToolActions"
import { fileSize } from "@/lib/format"
import { pageEnter } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { useNotesOf, useSubject, useTool } from "@/vault/hooks"

export function ToolPage() {
  useLanguage()
  const { subjectId, toolId } = useParams()
  const tool = useTool(toolId)
  const subject = useSubject(subjectId)
  const notes = useNotesOf(subjectId)
  const [runKey, setRunKey] = useState(0)
  const [presentFor, setPresentFor] = useState<string | null>(null)
  const [slide, setSlide] = useState(0)
  const [pages, setPages] = useState(0)
  const [preview, setPreview] = useState(true)
  const [notesOpen, setNotesOpen] = useState(true)
  const [noteId, setNoteId] = useState<string | null>(null)
  const openWindow = useUi((s) => s.openWindow)
  const phone = useUi((s) => s.phonePreview)
  const togglePhone = useUi((s) => s.togglePhone)
  const setFocusMode = useUi((s) => s.setFocusMode)
  const navigate = useNavigate()

  const handlePages = useCallback((count: number) => {
    const next = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0))
    setPages(next)
    setSlide((s) => Math.max(0, Math.min(s, Math.max(0, next - 1))))
  }, [])

  const handleSlide = useCallback((index: number) => {
    if (Number.isFinite(index)) setSlide(Math.max(0, Math.floor(index)))
  }, [])

  const canPresent = !!tool && (tool.kind === "pptx" || (tool.kind === "html" && looksLikeSlides(tool.html)))
  const presenting = !!tool && presentFor === tool.id && canPresent

  useEffect(() => {
    if (!presenting) return
    const previous = useUi.getState().focusMode
    setFocusMode(true)
    return () => setFocusMode(previous)
  }, [presenting, setFocusMode])

  useEffect(() => {
    if (!presenting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest("[role='menu'], [role='menuitem'], [role='dialog'], input, textarea, select")) return
      if (event.key === "Escape") {
        event.preventDefault()
        setPresentFor(null)
        return
      }
      if (pages < 2) return
      // Пробел на кнопке должен нажимать кнопку, а стрелки — листать слайды.
      if ((event.key === " " || event.key === "Enter") && target?.closest("button, a, [contenteditable='true']")) return
      if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault()
        setSlide((s) => Math.max(0, Math.min(pages - 1, s + 1)))
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault()
        setSlide((s) => Math.max(0, Math.min(pages - 1, s - 1)))
      } else if (event.key === "Home") {
        event.preventDefault()
        setSlide(0)
      } else if (event.key === "End") {
        event.preventDefault()
        setSlide(pages - 1)
      }
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [presenting, pages])

  if (!tool || !subject || tool.subjectId !== subject.id) return <Navigate to={subject ? `/s/${subject.id}?tab=tools` : "/"} replace />

  const Icon = toolIcon(tool)
  const isHtml = tool.kind === "html"
  const inPhone = !presenting && isHtml && phone
  const note = pickPresentNote(notes, noteId)
  const currentSlide = pages > 0 ? Math.min(slide, pages - 1) : 0

  const go = (delta: number) => setSlide((s) => Math.max(0, Math.min(pages - 1, s + delta)))

  const togglePresent = () => {
    if (presenting) {
      setPresentFor(null)
      return
    }
    setNoteId(loadPresentNote(tool.id))
    setSlide(0)
    setPreview(true)
    setNotesOpen(true)
    setPresentFor(tool.id)
  }

  const chooseNote = (id: string) => {
    setNoteId(id)
    savePresentNote(tool.id, id)
  }

  return (
    <motion.div
      {...pageEnter}
      key={tool.id}
      className="flex h-full flex-col p-3 pt-2 pr-[max(0.75rem,var(--safe-right))] pl-[max(0.75rem,var(--safe-left))]"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        <Icon className="size-4 shrink-0 text-highlight" />
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{tool.name}</h1>
        {!isHtml && (
          <span className="hidden gap-2 px-2 text-[12px] text-muted-foreground sm:inline-flex">
            <span>{translate(kindLabels[tool.kind])}</span>
            {tool.size !== undefined && <span>{fileSize(tool.size)}</span>}
          </span>
        )}
        {presenting && pages > 0 && (
          <div className="flex items-center gap-0.5 rounded-lg border bg-background/60 px-1" role="group" aria-label={translate("Слайды")}>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate("Предыдущий слайд")}
              disabled={currentSlide === 0}
              onClick={() => go(-1)}
            >
              <ChevronLeft />
            </Button>
            <span aria-live="polite" className="min-w-12 text-center text-[12px] text-muted-foreground tabular-nums">
              {currentSlide + 1} / {pages}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate("Следующий слайд")}
              disabled={currentSlide >= pages - 1}
              onClick={() => go(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
        {presenting && isHtml && (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={preview}
            aria-label={translate("Превью следующего слайда")}
            onClick={() => setPreview((value) => !value)}
          >
            {preview ? <EyeOff /> : <Eye />}
            <span className="max-md:hidden">{translate("Превью")}</span>
          </Button>
        )}
        {presenting && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={translate("Показать или скрыть конспект")}
            className="lg:hidden"
            onClick={() => setNotesOpen((value) => !value)}
          >
            <BookOpen />
          </Button>
        )}
        {isHtml && !presenting && (
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={phone}
              aria-label={translate("Телефон")}
              onClick={togglePhone}
              className={cn(phone && "bg-accent text-highlight")}
            >
              <Smartphone />
              <span className="max-md:hidden">{translate("Телефон")}</span>
            </Button>
            <Button variant="ghost" size="sm" aria-label={translate("Перезапустить")} onClick={() => setRunKey((k) => k + 1)}>
              <RotateCw />
              <span className="max-md:hidden">{translate("Перезапустить")}</span>
            </Button>
          </>
        )}
        {canPresent && (
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={presenting}
            aria-label={presenting ? translate("Выйти из режима презентации") : translate("Режим презентации")}
            onClick={togglePresent}
            className={cn(presenting && "bg-accent text-highlight")}
          >
            {presenting ? <X /> : <Play />}
            <span className="max-md:hidden">{presenting ? translate("Выйти") : translate("Презентация")}</span>
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={translate("Скачать")} onClick={() => void downloadProjectFile(tool)}>
              <Download />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{translate("Скачать")}</TooltipContent>
        </Tooltip>
        {!presenting && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={translate("В отдельном окне")}
            onClick={() => {
              openWindow("tool", tool.id)
              navigate(`/s/${subject.id}`)
            }}
          >
            <PictureInPicture2 />
            <span className="max-md:hidden">{translate("В отдельном окне")}</span>
          </Button>
        )}
        <ToolActions tool={tool} onOpenWindow={() => navigate(`/s/${subject.id}`)} />
      </div>

      <div className="flex min-h-0 flex-1 gap-3 max-lg:relative">
        {presenting && (
          <PresentationNotes
            key="presentation-notes"
            notes={notes}
            note={note}
            onNote={chooseNote}
            className={cn(
              "max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-20 max-lg:w-[min(88vw,360px)] max-lg:shadow-float",
              !notesOpen && "max-lg:hidden",
            )}
          />
        )}
        <div
          key="stage"
          className={cn(
            "min-w-0 flex-1 overflow-hidden",
            !inPhone && "rounded-2xl border bg-background shadow-card",
            presenting && isHtml && "bg-neutral-950",
          )}
        >
          {inPhone ? (
            <PhonePreview html={tool.html} title={tool.name} runKey={runKey} />
          ) : (
            <ProjectViewer
              tool={tool}
              runKey={runKey}
              present={presenting}
              slide={slide}
              preview={preview}
              onSlides={handlePages}
              onSlide={handleSlide}
            />
          )}
        </div>
      </div>
    </motion.div>
  )
}
