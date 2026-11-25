import { useState } from "react"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import type { ProofEdit } from "./proofread"

export function ProofreadDialog({
  edits,
  onClose,
  onApply,
}: {
  edits: ProofEdit[]
  onClose: () => void
  onApply: (edits: ProofEdit[]) => void
}) {
  useLanguage()
  const [skipped, setSkipped] = useState<Set<number>>(() => new Set())
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pr-6">
          <DialogTitle>{translate("Исправить ошибки")}</DialogTitle>
          <DialogDescription>{translate("Выбери правки, которые хочешь применить.")}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50dvh] space-y-1.5 overflow-y-auto">
          {edits.map(({ from, before, after }) => (
            <li key={from}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={!skipped.has(from)}
                  onChange={(event) => {
                    const next = new Set(skipped)
                    if (event.currentTarget.checked) next.delete(from)
                    else next.add(from)
                    setSkipped(next)
                  }}
                />
                <span className="min-w-0 break-words">
                  <del className="text-destructive">{before}</del>
                  <span aria-hidden className="px-2 text-muted-foreground">
                    →
                  </span>
                  <ins className="font-medium no-underline">{after || translate("Удалить")}</ins>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {translate("Отмена")}
          </Button>
          <Button disabled={skipped.size === edits.length} onClick={() => onApply(edits.filter((edit) => !skipped.has(edit.from)))}>
            {translate("Применить")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
