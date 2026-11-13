import { BookOpen, ChevronDown } from "lucide-react"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu"
import { cn } from "@/lib/utils"
import type { Note } from "@/types"
import { NoteReader } from "./NoteReader"

interface Props {
  notes: Note[]
  note?: Note
  onNote: (id: string) => void
  className?: string
}

/** Левая колонка режима презентации: выбор и чтение конспекта. */
export function PresentationNotes({ notes, note, onNote, className }: Props) {
  useLanguage()
  return (
    <aside
      aria-label={translate("Конспект")}
      className={cn(
        "flex w-[clamp(280px,32vw,440px)] shrink-0 flex-col overflow-hidden rounded-2xl border bg-background shadow-card",
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <BookOpen className="size-4 shrink-0 text-highlight" />
        <span className="text-[13px] font-semibold">{translate("Конспект")}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={!notes.length} className="ml-auto min-w-0 max-w-[65%] justify-between">
              <span className="truncate">{note?.title || (notes.length ? translate("Выбрать") : translate("Нет конспектов"))}</span>
              <ChevronDown className="shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-64">
            <DropdownMenuLabel>{translate("Конспекты предмета")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={note?.id} onValueChange={onNote}>
              {notes.map((n) => (
                <DropdownMenuRadioItem key={n.id} value={n.id}>
                  <span className="truncate">{n.title || translate("Без названия")}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {note ? (
          <NoteReader key={note.id} note={note} />
        ) : (
          <p className="px-1 py-6 text-center text-[13px] text-muted-foreground">{translate("В этом предмете пока нет конспектов.")}</p>
        )}
      </div>
    </aside>
  )
}
