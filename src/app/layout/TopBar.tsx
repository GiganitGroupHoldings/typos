import { ArrowLeft, ChevronRight, Focus, List as ListIcon, Pin, Search } from "lucide-react"
import { Link, useLocation, useNavigate, useParams } from "react-router"
import { translate, useLanguage } from "@/app/i18n"
import { useUi } from "@/app/store"
import { Button } from "@/components/ui/Button"
import { Kbd } from "@/components/ui/Kbd"
import { useLiquidLens } from "@/components/ui/LiquidLens"
import { SidebarTrigger } from "@/components/ui/Sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip"
import { cn } from "@/lib/utils"
import { useBoard, useNote, useSubject, useTool } from "@/vault/hooks"
import { WindowControls } from "./WindowControls"

export function TopBar() {
  useLanguage()
  const { subjectId, noteId, toolId, boardId } = useParams()
  const subject = useSubject(subjectId)
  const note = useNote(noteId)
  const tool = useTool(toolId)
  const board = useBoard(boardId)
  const leaf = note ? note.title || translate("Без названия") : (tool?.name ?? board?.name)
  const pinsOpen = useUi((s) => s.pinsOpen)
  const togglePins = useUi((s) => s.togglePins)
  const focusMode = useUi((s) => s.focusMode)
  const toggleFocus = useUi((s) => s.toggleFocus)
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  const setListOpen = useUi((s) => s.setListOpen)
  const lens = useLiquidLens({ fallback: "liquid liquid-lava" })
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const backTarget = subject ? (note || tool || board ? `/s/${subject.id}` : "/") : pathname === "/" ? null : "/"

  return (
    <div
      data-tauri-drag-region
      className="flex h-14 shrink-0 items-center gap-1 pl-[max(0.5rem,var(--safe-left))] pr-[max(0.5rem,var(--safe-right))] md:h-12"
    >
      {backTarget && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate("Назад")}
          className="size-11 rounded-full md:hidden"
          onClick={() => navigate(backTarget)}
        >
          <ArrowLeft />
        </Button>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarTrigger
            aria-label={translate("Показать или скрыть предметы")}
            className={cn("max-md:size-11", subject && "max-md:hidden")}
          />
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          {translate("Предметы")} <Kbd>Ctrl B</Kbd>
        </TooltipContent>
      </Tooltip>

      <span className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold md:hidden">{leaf ?? subject?.name ?? ""}</span>

      <nav
        data-tauri-drag-region
        aria-label={translate("Путь")}
        className="hidden min-w-0 flex-1 items-center gap-1 px-1 text-[13px] text-muted-foreground md:flex"
      >
        {subject ? (
          <>
            <Link
              to={`/s/${subject.id}`}
              className="truncate rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {subject.name}
            </Link>
            {leaf && (
              <>
                <ChevronRight aria-hidden className="size-3.5 shrink-0" />
                <span aria-current="page" className="truncate text-foreground">
                  {leaf}
                </span>
              </>
            )}
          </>
        ) : null}
      </nav>

      {subject && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate("Содержание предмета")}
          className="size-11 rounded-full md:hidden"
          onClick={() => setListOpen(true)}
        >
          <ListIcon />
        </Button>
      )}

      <div className={cn(lens.className, "flex items-center gap-0.5 rounded-full p-1")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate("Поиск")}
              className="size-11 rounded-full hover:bg-foreground/5 md:size-7"
              onClick={() => setPaletteOpen(true)}
            >
              <Search />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            {translate("Поиск")} <Kbd>Ctrl K</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate("Режим фокуса")}
              aria-pressed={focusMode}
              onClick={toggleFocus}
              className={cn("rounded-full hover:bg-foreground/5 max-md:hidden", focusMode && "liquid-active hover:bg-transparent")}
            >
              <Focus />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            {translate("Режим фокуса")} <Kbd>Ctrl \</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate("Закреп")}
              aria-pressed={pinsOpen}
              onClick={togglePins}
              className={cn("size-11 rounded-full hover:bg-foreground/5 md:size-7", pinsOpen && "liquid-active hover:bg-transparent")}
            >
              <Pin />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            {translate("Закреп")} <Kbd>Ctrl J</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
      <WindowControls />
    </div>
  )
}
