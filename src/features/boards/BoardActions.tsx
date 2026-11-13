import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu"
import { errorText } from "@/lib/errors"
import { toastUndo } from "@/lib/undo"
import { cn } from "@/lib/utils"
import type { Board } from "@/types"
import { useVault } from "@/vault/store"

export function BoardActions({ board, className }: { board: Board; className?: string }) {
  useLanguage()
  const navigate = useNavigate()

  const remove = async () => {
    try {
      const undo = await useVault.getState().trashBoard(board.id)
      if (location.pathname.includes(`/b/${board.id}`)) navigate(`/s/${board.subjectId}?tab=boards`)
      toastUndo(translate("«{0}» в корзине", board.name), undo)
    } catch (e) {
      toast.error(translate("Не удалось удалить доску"), { description: errorText(e) })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate("Действия: {0}", board.name)}
          className={cn(className)}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate(`/s/${board.subjectId}/b/${board.id}?rename=1`)}>
          <Pencil /> {translate("Переименовать")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={remove}>
          <Trash2 /> {translate("Удалить")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
