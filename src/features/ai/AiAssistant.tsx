import { AlignLeft, BookOpen, LayoutDashboard, Loader2, Maximize2, Minimize2, PenLine, SpellCheck, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { AssistantBall } from "./AssistantBall"
import type { AssistantView } from "./assistantView"
import { AI_MENU, type AiCommand } from "./prompts"
import { summaryBlocks } from "./summaryBlocks"

const ICONS: Record<AiCommand, LucideIcon> = {
  summary: BookOpen,
  proofread: SpellCheck,
  rewrite: PenLine,
  shorten: Minimize2,
  lengthen: Maximize2,
  format: AlignLeft,
  board: LayoutDashboard,
}

/** Команды веера относятся ко всему конспекту, а окно показывает результат объяснения. */
export function AiAssistant({
  container,
  view,
  onTool,
  onClose,
  onRetry,
}: {
  container?: HTMLElement | null
  view: AssistantView
  onTool: (command: AiCommand) => void
  onClose: () => void
  onRetry: () => void
}) {
  useLanguage()
  return (
    <AssistantBall
      placement="note"
      container={container}
      open={view.status !== "closed"}
      onClose={onClose}
      label={translate("Помощник конспекта")}
      title={translate("О чём текст?")}
      subtitle={translate(view.scope === "selection" ? "Выделенный фрагмент" : "Весь конспект")}
      toolScope={translate("Инструменты для всего конспекта")}
      tools={AI_MENU.map(({ id, label }) => ({
        id,
        label: translate(id === "board" ? "Создать доску по конспекту" : label),
        caption: id === "board" ? translate("Создать доску") : undefined,
        icon: ICONS[id],
        run: () => onTool(id),
      }))}
    >
      {view.status === "loading" && (
        <p className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {translate("Помощник читает…")}
        </p>
      )}

      {view.status === "error" && (
        <div className="space-y-2 py-1">
          <p className="text-[13px] font-medium text-destructive">{translate("Не удалось объяснить текст")}</p>
          <p className="text-[12.5px] text-muted-foreground">{view.error}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {translate("Повторить")}
          </Button>
        </div>
      )}

      {view.status === "ready" && <SummaryBody text={view.text} />}

      {view.status === "ready" && view.truncated && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">{translate("Текст длинный — помощник прочитал начало.")}</p>
      )}
    </AssistantBall>
  )
}

function SummaryBody({ text }: { text: string }) {
  const blocks = summaryBlocks(text)
  return (
    <div className="space-y-2 pb-1 text-[13px] leading-relaxed">
      {blocks.map((block, index) => {
        if (block.kind === "heading")
          return (
            <p key={index} className="pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {inline(block.text)}
            </p>
          )
        if (block.kind === "list")
          return (
            <ul key={index} className={cn("space-y-1 pl-4 marker:text-muted-foreground", block.ordered ? "list-decimal" : "list-disc")}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item)}</li>
              ))}
            </ul>
          )
        return <p key={index}>{inline(block.text)}</p>
      })}
    </div>
  )
}

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={index} className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      )
    return part
  })
}
