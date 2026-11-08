import { useEditorState, type Editor } from "@tiptap/react"
import {
  Bold,
  BookOpen,
  Download,
  Heading2,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  MoreHorizontal,
  PenLine,
  Pin,
  Quote,
  Radical,
  SquareFunction,
  Table,
  Trash2,
  Type,
  Workflow,
  type LucideIcon,
} from "lucide-react"
import { useState, type PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { useUi } from "@/app/store"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/Sheet"
import { useVisualViewport } from "@/hooks/useVisualViewport"
import { NOTE_SIZE_LABELS, NOTE_SIZES, type NoteSize } from "@/lib/noteSize"
import { cn } from "@/lib/utils"

interface Props {
  editor: Editor
  reading?: boolean
  onReading: () => void
  onFormula: () => void
  onBlockFormula: () => void
  onImage: () => void
  onPin: () => void
  onExport: () => void
  onDelete: () => void
  saveState: "saved" | "dirty" | "saving" | "error" | "conflict"
  noteSize: NoteSize
  onNoteSize: (size: NoteSize) => void
}

const SAVE_LABEL: Record<Props["saveState"], string> = {
  saved: "Сохранено",
  dirty: "Сохранение…",
  saving: "Сохранение…",
  error: "Ошибка сохранения",
  conflict: "Файл изменён вне приложения",
}

const BUTTON =
  "flex size-10 shrink-0 items-center justify-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px]"
const keep = (e: ReactPointerEvent) => e.preventDefault()

function BarButton({ icon: Icon, label, active, onClick }: { icon: LucideIcon; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onPointerDown={keep}
      onClick={onClick}
      className={cn(BUTTON, active ? "liquid-active" : "text-foreground/80 hover:bg-foreground/5")}
    >
      <Icon />
    </button>
  )
}

/** Нижняя панель форматирования для телефона: не перекрывает текст и поднимается над клавиатурой. */
export function MobileEditorBar({
  editor,
  reading,
  onReading,
  onFormula,
  onBlockFormula,
  onImage,
  onPin,
  onExport,
  onDelete,
  saveState,
  noteSize,
  onNoteSize,
}: Props) {
  const [more, setMore] = useState(false)
  const keyboard = useVisualViewport()
  const mapMode = useUi((s) => s.mapMode)
  const setMapMode = useUi((s) => s.setMapMode)
  const pinsOpen = useUi((s) => s.pinsOpen)
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      table: e.isActive("table"),
      h2: e.isActive("heading", { level: 2 }),
    }),
  })

  if (pinsOpen || !state) return null
  const c = () => editor.chain().focus()
  const close = (job: () => void) => {
    setMore(false)
    job()
  }

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-30 md:hidden"
          style={{
            transform: `translateY(-${keyboard}px)`,
            paddingBottom: keyboard ? 6 : "max(6px, var(--safe-bottom))",
          }}
        >
          <div
            role="toolbar"
            aria-label="Форматирование"
            style={{ marginLeft: "max(0.5rem, var(--safe-left))", marginRight: "max(0.5rem, var(--safe-right))" }}
            className="liquid liquid-lava flex items-center gap-0.5 overflow-x-auto rounded-2xl p-1 shadow-float no-scrollbar"
          >
            {reading ? (
              <>
                <BarButton icon={PenLine} label="Редактировать" onClick={onReading} />
                <BarButton icon={Download} label="Скачать Markdown" onClick={onExport} />
                <BarButton icon={MoreHorizontal} label="Ещё" onClick={() => setMore(true)} />
              </>
            ) : (
              <>
                <BarButton icon={Bold} label="Жирный" active={state.bold} onClick={() => c().toggleBold().run()} />
                <BarButton icon={Italic} label="Курсив" active={state.italic} onClick={() => c().toggleItalic().run()} />
                <BarButton icon={List} label="Список" active={state.bullet} onClick={() => c().toggleBulletList().run()} />
                <BarButton icon={Radical} label="Формула в строке" onClick={onFormula} />
                <BarButton icon={ImagePlus} label="Картинка" onClick={onImage} />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label="Размер текста" className={cn(BUTTON, "text-foreground/80 hover:bg-foreground/5")}>
                      <Type />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="center" className="min-w-36">
                    <DropdownMenuLabel>Размер текста</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={noteSize} onValueChange={(v) => onNoteSize(v as NoteSize)}>
                      {NOTE_SIZES.map((size) => (
                        <DropdownMenuRadioItem key={size} value={size}>
                          {NOTE_SIZE_LABELS[size]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                <BarButton icon={MoreHorizontal} label="Ещё" onClick={() => setMore(true)} />
              </>
            )}
          </div>
        </div>,
        document.body,
      )}

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="md:hidden" style={{ paddingBottom: "max(1rem, var(--safe-bottom))" }}>
          <SheetHeader>
            <SheetTitle>Ещё</SheetTitle>
            <SheetDescription aria-live="polite">{SAVE_LABEL[saveState]}</SheetDescription>
          </SheetHeader>
          {!reading && (
            <>
              <p className="px-4 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Форматирование</p>
              <div className="grid grid-cols-3 gap-1.5 px-4">
                <MoreButton
                  icon={Heading2}
                  label="Подзаголовок"
                  active={state.h2}
                  onClick={() => close(() => c().toggleHeading({ level: 2 }).run())}
                />
                <MoreButton
                  icon={ListOrdered}
                  label="Нумерация"
                  active={state.ordered}
                  onClick={() => close(() => c().toggleOrderedList().run())}
                />
                <MoreButton
                  icon={ListChecks}
                  label="Чек-лист"
                  active={state.task}
                  onClick={() => close(() => c().toggleTaskList().run())}
                />
                <MoreButton icon={Quote} label="Цитата" active={state.quote} onClick={() => close(() => c().toggleBlockquote().run())} />
                <MoreButton
                  icon={Table}
                  label="Таблица"
                  active={state.table}
                  onClick={() => close(() => !state.table && c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
                />
                <MoreButton icon={SquareFunction} label="Блочная формула" onClick={() => close(onBlockFormula)} />
                <MoreButton icon={Pin} label="В закреп" onClick={() => close(onPin)} />
                <MoreButton
                  icon={Workflow}
                  label={mapMode ? "Выйти из карты" : "Карта"}
                  active={mapMode}
                  onClick={() => close(() => setMapMode(!mapMode))}
                />
              </div>
            </>
          )}
          <p className="mt-2 px-4 text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Конспект</p>
          <div className="grid grid-cols-3 gap-1.5 px-4 pb-2">
            <MoreButton icon={reading ? PenLine : BookOpen} label={reading ? "Редактировать" : "Чтение"} onClick={() => close(onReading)} />
            <MoreButton icon={Download} label="Скачать .md" onClick={() => close(onExport)} />
            <MoreButton icon={Trash2} label="Удалить" danger onClick={() => close(onDelete)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function MoreButton({
  icon: Icon,
  label,
  active,
  danger,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onPointerDown={keep}
      onClick={onClick}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border bg-background px-1.5 py-2 text-[12px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring",
        danger ? "border-destructive/25 text-destructive" : active ? "border-highlight bg-accent text-highlight" : "text-foreground",
      )}
    >
      <Icon className="size-[18px]" />
      <span className="text-center">{label}</span>
    </button>
  )
}
