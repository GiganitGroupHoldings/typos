import { useRef, useState } from "react"
import { toast } from "sonner"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import { errorText } from "@/lib/errors"
import { useAsciiBackdrop, useBackdropEditor } from "./backdropStore"

const MIB = 1024 * 1024

export function AsciiBackdropSettings({ onClose }: { onClose: () => void }) {
  useLanguage()
  const items = useAsciiBackdrop((s) => s.items)
  const removeItem = useAsciiBackdrop((s) => s.remove)
  const open = useBackdropEditor((s) => s.open)
  const photoInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = (file: File | undefined, kind: "photo" | "video") => {
    if (!file) return
    const limit = kind === "photo" ? 20 : 100
    if (file.size > limit * MIB) {
      toast.error(translate("Файл больше {0} МБ. Выбери файл поменьше.", limit))
      return
    }
    onClose()
    const sourceKind = kind === "video" && (file.type === "image/gif" || /\.gif$/i.test(file.name)) ? "gif" : kind
    open({ source: { kind: sourceKind, blob: file } })
  }

  const remove = async (id: string) => {
    setBusy(true)
    try {
      await removeItem(id)
    } catch (error) {
      toast.error(translate("Не удалось удалить фон"), { description: errorText(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset disabled={busy} className="grid gap-2">
      <legend className="mb-2 font-medium">{translate("Источник ASCII-фона")}</legend>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => photoInput.current?.click()}>
          {translate("Загрузить фото")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => videoInput.current?.click()}>
          {translate("Загрузить видео или GIF")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onClose()
            open({ source: null })
          }}
        >
          {translate("Пустой холст")}
        </Button>
      </div>
      {items.map((item, index) => (
        <div key={item.id} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">
            {translate({ photo: "Фото", video: "Видео", gif: "GIF", text: "ASCII-рисунок" }[item.source.kind])} {index + 1}
          </span>
          <Button
            size="sm"
            onClick={() => {
              onClose()
              open(item)
            }}
          >
            {translate("Настроить")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void remove(item.id)}>
            {translate("Удалить")}
          </Button>
        </div>
      ))}
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          pick(event.currentTarget.files?.[0], "photo")
          event.currentTarget.value = ""
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/*,image/gif,.gif"
        hidden
        onChange={(event) => {
          pick(event.currentTarget.files?.[0], "video")
          event.currentTarget.value = ""
        }}
      />
    </fieldset>
  )
}
