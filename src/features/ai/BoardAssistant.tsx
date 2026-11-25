import { Loader2, Workflow } from "lucide-react"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import { AssistantBall } from "./AssistantBall"
import type { BoardAssistantView } from "./assistantView"

/** Помощник доски: собирает хаотичные карточки в симметричное дерево мыслей. */
export function BoardAssistant({
  view,
  boardName,
  onOpen,
  onClose,
  onRetry,
  onUndo,
}: {
  view: BoardAssistantView
  boardName: string
  onOpen: () => void
  onClose: () => void
  onRetry: () => void
  onUndo: () => void
}) {
  useLanguage()
  return (
    <AssistantBall
      open={view.open}
      onClose={onClose}
      label={translate("Помощник доски")}
      title={translate("Дерево мыслей")}
      subtitle={translate("Доска «{0}»", boardName)}
      toolScope={translate("Помощник доски")}
      tools={[{ id: "structure", label: translate("Структурировать доску"), icon: Workflow, run: onOpen }]}
    >
      {view.status === "idle" && (
        <div className="space-y-2 py-1">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {translate("Помощник разложит блоки: рамки с содержимым и отдельные карточки.")}
          </p>
          <Button size="sm" onClick={onRetry}>
            {translate("Структурировать")}
          </Button>
        </div>
      )}

      {view.status === "loading" && (
        <p className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {view.step || translate("Помощник раскладывает доску…")}
        </p>
      )}

      {view.status === "error" && (
        <div className="space-y-2 py-1">
          <p className="text-[13px] font-medium text-destructive">{translate("Не удалось собрать дерево")}</p>
          <p className="text-[12.5px] text-muted-foreground">{view.error}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {translate("Повторить")}
          </Button>
        </div>
      )}

      {view.status === "done" && (
        <div className="space-y-2 py-1">
          <p className="text-[13px] font-medium">{translate("Готово: мысли собраны в дерево.")}</p>
          {view.summary && <p className="text-[12.5px] text-muted-foreground">{view.summary}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={onRetry}>
              {translate("Разложить снова")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onUndo}>
              {translate("Отменить")}
            </Button>
          </div>
        </div>
      )}
    </AssistantBall>
  )
}
