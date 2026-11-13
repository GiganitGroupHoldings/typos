import { Download } from "lucide-react"
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import { kindLabels, toolIcon } from "@/features/subjects/visuals"
import { fileSize } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Tool } from "@/types"
import { OfficeView } from "./OfficeView"
import { downloadProjectFile } from "./projectFiles"
import { Spinner } from "./Spinner"
import { ToolFrame } from "./ToolFrame"
import { useProjectFile } from "./useProjectFile"

const SpreadsheetView = lazy(() => import("./SpreadsheetView"))

interface Props {
  tool: Tool
  runKey?: number
  present?: boolean
  slide?: number
  preview?: boolean
  onSlides?: (pages: number) => void
  onSlide?: (index: number) => void
}

export function ProjectViewer({ tool, runKey = 0, present = false, slide = 0, preview = true, onSlides, onSlide }: Props) {
  if (tool.kind === "html") {
    return (
      <ToolFrame
        html={tool.html}
        title={tool.name}
        runKey={runKey}
        present={present}
        slide={slide}
        preview={preview}
        onSlides={onSlides}
        onSlide={onSlide}
      />
    )
  }

  return <FileView key={`${tool.path}:${runKey}`} tool={tool} present={present} slide={slide} onSlides={onSlides} />
}

function FileView({ tool, present, slide, onSlides }: { tool: Tool; present: boolean; slide: number; onSlides?: (pages: number) => void }) {
  useLanguage()
  const file = useProjectFile(tool.path, tool.ext)
  if (!file) return <Spinner />
  if ("error" in file) return <FileCard tool={tool} note={file.error} />
  switch (tool.kind) {
    case "image":
      return <ImageView url={file.url} name={tool.name} />
    case "pdf":
      return <iframe src={file.url} title={tool.name} className="size-full border-0" />
    case "video":
      return (
        <div className="flex size-full items-center justify-center bg-black/90 p-2">
          <video src={file.url} controls playsInline className="max-h-full max-w-full rounded-lg" />
        </div>
      )
    case "audio":
      return (
        <FileCard tool={tool} size={file.blob.size}>
          <audio src={file.url} controls className="w-full max-w-md" />
        </FileCard>
      )
    case "text":
      return <TextView blob={file.blob} />
    case "spreadsheet":
      return (
        <Suspense fallback={<Spinner />}>
          <SpreadsheetView blob={file.blob} title={tool.name} />
        </Suspense>
      )
    case "docx":
    case "pptx":
      return <OfficeView blob={file.blob} kind={tool.kind} title={tool.name} present={present} slide={slide} onReady={onSlides} />
    default:
      return <FileCard tool={tool} size={file.blob.size} note={translate("Просмотр недоступен. Скачай файл.")} />
  }
}

function FileCard({ tool, size, note, children }: { tool: Tool; size?: number; note?: string; children?: ReactNode }) {
  useLanguage()
  const Icon = toolIcon(tool)
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon className="size-12 text-highlight" strokeWidth={1.5} />
      <div>
        <div className="text-[17px] font-semibold">{tool.name}</div>
        <div className="flex justify-center gap-2 text-[13px] text-muted-foreground">
          <span>{translate(kindLabels[tool.kind])}</span>
          {tool.ext && <span>.{tool.ext}</span>}
          {size !== undefined && <span>{fileSize(size)}</span>}
        </div>
      </div>
      {children}
      {note && <p className="max-w-sm text-[13px] text-muted-foreground">{note}</p>}
      <Button variant="outline" size="sm" onClick={() => void downloadProjectFile(tool)}>
        <Download /> {translate("Скачать")}
      </Button>
    </div>
  )
}

function ImageView({ url, name }: { url: string; name: string }) {
  useLanguage()
  const [actual, setActual] = useState(false)
  return (
    <div className={cn("size-full overflow-auto", !actual && "flex items-center justify-center p-4")}>
      <button
        type="button"
        aria-label={actual ? translate("Вписать в окно") : translate("В исходном размере")}
        onClick={() => setActual((v) => !v)}
        className={cn(
          "block outline-none focus-visible:ring-2 focus-visible:ring-ring",
          actual ? "m-auto cursor-zoom-out" : "size-full cursor-zoom-in",
        )}
      >
        <img src={url} alt={name} draggable={false} className={cn("select-none", actual ? "max-w-none" : "size-full object-contain")} />
      </button>
    </div>
  )
}

const TEXT_LIMIT = 2 * 1024 * 1024

function TextView({ blob }: { blob: Blob }) {
  useLanguage()
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void blob
      .slice(0, TEXT_LIMIT)
      .text()
      .then((t) => alive && setText(t))
    return () => {
      alive = false
    }
  }, [blob])
  if (text === null) return <Spinner />
  return (
    <pre className="size-full overflow-auto p-5 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap">
      {text}
      {blob.size > TEXT_LIMIT && translate("\n\nПоказаны первые 2 МБ. Полный файл доступен для скачивания.")}
    </pre>
  )
}
