import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { translate } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { errorText } from "@/lib/errors"

export function NewSubnoteDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onCreate(name.trim())
      onClose()
    } catch (error) {
      toast.error(translate("Не удалось создать конспект"), { description: errorText(error) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{translate("Новый дочерний конспект")}</DialogTitle>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm">
            {translate("Название")}
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={100} />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              {translate("Отмена")}
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {translate("Создать")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
