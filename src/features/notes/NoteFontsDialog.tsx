import { FileUp, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { translate } from "@/app/i18n"
import { useUi } from "@/app/store"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { errorText } from "@/lib/errors"
import { normalizeNoteFont, NOTE_FONTS } from "@/lib/noteFonts"
import type { useCustomNoteFonts } from "./useCustomNoteFonts"

export function NoteFontsDialog({ custom, onClose }: { custom: ReturnType<typeof useCustomNoteFonts>; onClose: () => void }) {
  const font = useUi((s) => s.noteFont)
  const setFont = useUi((s) => s.setNoteFont)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function run(job: () => Promise<void>) {
    setBusy(true)
    try {
      await job()
    } catch (e) {
      toast.error(translate("Не удалось изменить шрифты"), { description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{translate("Шрифт текста")}</DialogTitle>
          <DialogDescription>{translate("Шрифты из файлов сохраняются на этом устройстве.")}</DialogDescription>
        </DialogHeader>
        <select
          aria-label={translate("Шрифт текста")}
          value={font.startsWith("custom-") && !custom.selected ? "inter" : font}
          onChange={(event) => setFont(normalizeNoteFont(event.target.value))}
          className="w-full rounded-lg border bg-background px-3 py-2 text-foreground"
        >
          {Object.entries(NOTE_FONTS).map(([id, { name }]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
          {custom.fonts.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <div>
          <input
            ref={input}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ""
              if (file) void run(() => custom.importFont(file))
            }}
          />
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <FileUp /> {translate("Добавить свой шрифт")}
          </Button>
        </div>
        {!!custom.fonts.length && (
          <ul>
            {custom.fonts.map(({ id, name }) => (
              <li key={id} className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate" title={name}>
                  {name}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate("Удалить шрифт «{0}»", name)}
                  disabled={busy}
                  onClick={() => void run(() => custom.removeFont(id))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
