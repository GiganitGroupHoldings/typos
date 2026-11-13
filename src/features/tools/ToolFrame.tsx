import { useCallback, useEffect, useMemo, useRef } from "react"
import { translate, useLanguage } from "@/app/i18n"
import { useResolvedTheme } from "@/app/theme"
import { cn } from "@/lib/utils"
import { HTML_SLIDES_RUNTIME } from "./presentation/htmlSlides"
import { TOOL_SANDBOX, withCsp, type ToolMessage } from "./sandbox"

interface Props {
  html: string
  title: string

  runKey?: number
  className?: string
  present?: boolean
  slide?: number
  preview?: boolean
  onSlides?: (pages: number) => void
  onSlide?: (index: number) => void
}

type SlideMessage = { type: "typos:slides"; pages?: unknown; index?: unknown } | { type: "typos:index"; index?: unknown }

export function ToolFrame({ html, title, runKey = 0, className, present = false, slide = 0, preview = true, onSlides, onSlide }: Props) {
  useLanguage()
  const nextLabel = translate("Дальше")
  const ref = useRef<HTMLIFrameElement>(null)
  const theme = useResolvedTheme()
  const srcDoc = useMemo(() => withCsp(html, HTML_SLIDES_RUNTIME), [html])
  const onSlidesRef = useRef(onSlides)
  const onSlideRef = useRef(onSlide)
  const reported = useRef<number | null>(null)

  useEffect(() => {
    onSlidesRef.current = onSlides
    onSlideRef.current = onSlide
  }, [onSlides, onSlide])

  const post = useCallback((msg: ToolMessage | Record<string, unknown>) => {
    ref.current?.contentWindow?.postMessage(msg, "*")
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent<SlideMessage>) => {
      const win = ref.current?.contentWindow
      if (!win || event.source !== win) return
      const data = event.data
      if (!data || typeof data.type !== "string") return
      if (data.type === "typos:slides") {
        if (typeof data.pages === "number") onSlidesRef.current?.(data.pages)
        if (typeof data.index === "number") {
          reported.current = data.index
          onSlideRef.current?.(data.index)
        }
      } else if (data.type === "typos:index" && typeof data.index === "number") {
        reported.current = data.index
        onSlideRef.current?.(data.index)
      }
    }
    addEventListener("message", onMessage)
    return () => removeEventListener("message", onMessage)
  }, [])

  useEffect(() => {
    post({ type: "typos:present", value: present })
  }, [present, post])

  useEffect(() => {
    // Не отправляем обратно тот же индекс, который только что сообщил сам iframe.
    if (reported.current === slide) return
    post({ type: "typos:slide", index: slide })
  }, [slide, post])

  useEffect(() => {
    post({ type: "typos:preview", value: preview, label: nextLabel })
  }, [preview, nextLabel, post])

  const sync = () => {
    post({ type: "theme", value: theme })
    post({ type: "typos:hello" })
    post({ type: "typos:present", value: present })
    post({ type: "typos:slide", index: slide })
    post({ type: "typos:preview", value: preview, label: nextLabel })
  }

  useEffect(() => {
    post({ type: "theme", value: theme })
  }, [theme, post])

  return (
    <iframe
      key={runKey}
      ref={ref}
      title={title}
      sandbox={TOOL_SANDBOX}
      srcDoc={srcDoc}
      referrerPolicy="no-referrer"
      onLoad={sync}
      className={cn("size-full border-0 bg-background", className)}
    />
  )
}
