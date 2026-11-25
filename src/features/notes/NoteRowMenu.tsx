import { Pencil, Trash2 } from "lucide-react"
import { ContextMenu } from "radix-ui"
import { useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { translate } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { errorText } from "@/lib/errors"
import { toastUndo } from "@/lib/undo"
import type { Note } from "@/types"
import { useVault } from "@/vault/store"
import { noteHref } from "./subnotes"

const itemClass =
  "flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none data-highlighted:bg-accent [&_svg]:size-4"

export function NoteRowMenu({ note, active, children }: { note: Note; active: boolean; children: ReactNode }) {
  const navigate = useNavigate()
  const [name, setName] = useState<string>()
  const [busy, setBusy] = useState(false)

  const rename = async (title: string) => {
    setBusy(true)
    try {
      await useVault.getState().renameNote(note.id, title)
      setName(undefined)
    } catch (e) {
      toast.error(translate("Не удалось переименовать конспект"), { description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    try {
      const undo = await useVault.getState().trashNote(note.id)
      if (active) navigate(`/s/${note.subjectId}`)
      toastUndo(translate("Конспект в корзине"), undo, active ? () => navigate(noteHref(note)) : undefined)
    } catch (e) {
      toast.error(translate("Не удалось удалить конспект"), { description: errorText(e) })
    }
  }

  return (
    <>
      <ContextMenu.Root modal={false}>
        <ContextMenu.Trigger asChild>
          <div className="flex min-w-0 items-center gap-1">{children}</div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="glass z-50 min-w-40 rounded-xl p-1 text-popover-foreground">
            <ContextMenu.Item className={itemClass} onSelect={() => setName(note.title)}>
              <Pencil /> {translate("Переименовать")}
            </ContextMenu.Item>
            <ContextMenu.Item className={`${itemClass} text-destructive`} onSelect={remove}>
              <Trash2 /> {translate("Удалить")}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <Dialog open={name !== undefined} onOpenChange={(open) => !open && !busy && setName(undefined)}>
        {name !== undefined && (
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{translate("Переименовать конспект")}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                if (!busy && name.trim()) void rename(name.trim())
              }}
            >
              <Input
                aria-label={translate("Название")}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                disabled={busy}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setName(undefined)} disabled={busy}>
                  {translate("Отмена")}
                </Button>
                <Button type="submit" disabled={busy || !name.trim()}>
                  {translate("Сохранить")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
