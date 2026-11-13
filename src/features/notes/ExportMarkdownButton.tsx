import { Download } from "lucide-react"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import type { Note } from "@/types"
import { exportMarkdown } from "./exportMarkdown"

export function ExportMarkdownButton({ note, getMarkdown }: { note: Note; getMarkdown?: () => string }) {
  useLanguage()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={translate("Скачать Markdown")}
      title={translate("Скачать Markdown (.md)")}
      onClick={() => exportMarkdown(note, getMarkdown?.())}
    >
      <Download />
    </Button>
  )
}
