import { ArrowDown, ArrowUp, Maximize2, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { translate, useLanguage } from "@/app/i18n"
import { useUi } from "@/app/store"
import { Button } from "@/components/ui/Button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu"
import { toastUndo } from "@/lib/undo"
import { cn } from "@/lib/utils"
import type { Pin } from "@/types"
import { useVault } from "@/vault/store"
import { openPinEditor } from "./PinEditorDialog"

export function PinActions({ pin, siblings, className }: { pin: Pin; siblings: Pin[]; className?: string }) {
  useLanguage()
  const openWindow = useUi((s) => s.openWindow)
  const closeWindow = useUi((s) => s.closeWindow)
  const index = siblings.findIndex((p) => p.id === pin.id)

  const move = (delta: number) => {
    const ids = siblings.map((p) => p.id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + delta, 0, id)
    void useVault.getState().reorderPins(pin.subjectId, ids)
  }

  const remove = async () => {
    closeWindow(`pin:${pin.id}`)
    const undo = await useVault.getState().trashPin(pin.id)
    toastUndo(translate("«{0}» в корзине", pin.title), undo)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate("Действия: {0}", pin.title)}
          className={cn(className)}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => openPinEditor({ subjectId: pin.subjectId, pinId: pin.id })}>
          <Pencil /> {translate("Изменить")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openWindow("pin", pin.id)}>
          <Maximize2 /> {translate("В отдельном окне")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index <= 0} onSelect={() => move(-1)}>
          <ArrowUp /> {translate("Выше")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index < 0 || index >= siblings.length - 1} onSelect={() => move(1)}>
          <ArrowDown /> {translate("Ниже")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={remove}>
          <Trash2 /> {translate("Удалить")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
