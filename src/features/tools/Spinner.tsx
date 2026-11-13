import { Loader2 } from "lucide-react"
import { translate, useLanguage } from "@/app/i18n"

export function Spinner({ text }: { text?: string }) {
  useLanguage()
  return (
    <div role="status" className="flex size-full flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      {text ?? translate("Открываю…")}
    </div>
  )
}
