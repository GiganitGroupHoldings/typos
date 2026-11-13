import { GraduationCap, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useNavigate } from "react-router"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu"
import { toastUndo } from "@/lib/undo"
import type { Subject } from "@/types"
import { useVault } from "@/vault/store"
import { openEditSubject } from "./NewSubjectDialog"

export function SubjectActions({ subject }: { subject: Subject }) {
  useLanguage()
  const navigate = useNavigate()

  const remove = async () => {
    const undo = await useVault.getState().trashSubject(subject.id)
    navigate("/")
    toastUndo(translate("Предмет «{0}» в корзине", subject.name), undo, () => navigate(`/s/${subject.id}`))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={translate("Действия с предметом «{0}»", subject.name)}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate(`/s/${subject.id}/review`)}>
          <GraduationCap /> {translate("Повторение закрепа")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openEditSubject(subject.id)}>
          <Pencil /> {translate("Изменить")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={remove}>
          <Trash2 /> {translate("Удалить предмет")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
