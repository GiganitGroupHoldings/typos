import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { errorText } from "@/lib/errors"
import { SUBJECT_COLORS, SUBJECT_ICONS } from "@/lib/subjectPalette"
import { cn } from "@/lib/utils"
import type { SubjectColor, SubjectIcon } from "@/types"
import { useVault } from "@/vault/store"
import { useSubjectDialog } from "./subjectDialog"
import { SubjectBadge, subjectIcons } from "./visuals"

export function NewSubjectDialog() {
  useLanguage()
  const open = useSubjectDialog((s) => s.open)
  const editId = useSubjectDialog((s) => s.editId)
  const parentId = useSubjectDialog((s) => s.parentId)
  const setOpen = (v: boolean) => useSubjectDialog.getState().set(v, v ? editId : undefined, v ? parentId : undefined)
  const editing = useVault((s) => s.subjects.find((x) => x.id === editId))
  const createSubject = useVault((s) => s.createSubject)
  const updateSubject = useVault((s) => s.updateSubject)
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [color, setColor] = useState<SubjectColor>("blue")
  const [customColor, setCustomColor] = useState<string>()
  const [icon, setIcon] = useState<SubjectIcon>("book")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? "")
    setColor(editing?.color ?? "blue")
    setCustomColor(editing?.customColor)
    setIcon(editing?.icon ?? "book")
  }, [open, editing])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      if (editing) {
        await updateSubject(editing.id, { name: name.trim(), color, customColor, icon })
        setOpen(false)
      } else {
        const s = await createSubject({ name: name.trim(), color, customColor, icon }, parentId)
        setOpen(false)
        navigate(`/s/${s.id}`)
      }
    } catch (err) {
      toast.error(editing ? translate("Не удалось сохранить предмет") : translate("Не удалось создать предмет"), {
        description: errorText(err),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>
              {editing ? translate("Изменить предмет") : parentId ? translate("Новая подпапка") : translate("Новый предмет")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3">
            <SubjectBadge subject={{ id: "", name, color, customColor, icon, order: 0, dir: "" }} size="lg" />
            <div className="flex-1">
              <label htmlFor="subject-name" className="mb-1 block text-[13px] font-medium">
                {translate("Название")}
              </label>
              <Input
                id="subject-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={translate("Матанализ")}
                maxLength={80}
              />
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">{translate("Цвет")}</legend>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_COLORS.map(({ id: c, name: colorName }) => (
                <button
                  key={c}
                  type="button"
                  aria-label={translate(colorName)}
                  title={translate(colorName)}
                  aria-pressed={!customColor && color === c}
                  onClick={() => {
                    setColor(c)
                    setCustomColor(undefined)
                  }}
                  style={{ background: `var(--subject-${c})` }}
                  className={cn(
                    "size-8 rounded-full outline-none transition-transform duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95",
                    !customColor && color === c && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background",
                  )}
                />
              ))}
            </div>
            <label className="mt-3 flex w-fit items-center gap-2 text-[13px]">
              <input
                type="color"
                value={customColor ?? "#ff6500"}
                onChange={(e) => setCustomColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded-md border bg-background p-0.5"
              />
              {translate("Свой цвет")}
            </label>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">{translate("Иконка")}</legend>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_ICONS.map(({ id: i, label }) => {
                const Icon = subjectIcons[i]
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label={translate(label)}
                    title={translate(label)}
                    aria-pressed={icon === i}
                    onClick={() => setIcon(i)}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl border outline-none transition-colors duration-(--dur-fast) focus-visible:ring-2 focus-visible:ring-ring",
                      icon === i
                        ? "border-highlight bg-accent text-highlight"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                  </button>
                )
              })}
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {translate("Отмена")}
            </Button>
            <Button type="submit" disabled={!name.trim() || busy}>
              {editing ? translate("Сохранить") : translate("Создать")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
