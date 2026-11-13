import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { translate, useLanguage } from "@/app/i18n"
import { cn } from "@/lib/utils"
import { Spinner } from "./Spinner"

const OFFICE_CSS = `
html,body{margin:0;min-height:100%;background:transparent;font-family:system-ui,sans-serif}
#root{min-height:100vh}
.docx-wrapper{background:transparent!important;padding:24px 16px!important}
.docx-wrapper>section.docx{margin:0 auto 24px!important;border-radius:4px;box-shadow:0 1px 3px rgb(0 0 0/.14),0 10px 30px rgb(0 0 0/.1)!important}
.pptx-preview-wrapper{background:transparent!important;padding:16px 0 6px}
.pptx-preview-slide-wrapper{margin:0 auto 16px!important;border-radius:10px;box-shadow:0 1px 3px rgb(0 0 0/.14),0 10px 30px rgb(0 0 0/.1)}
html.is-present,html.is-present body,html.is-present #root{height:100%;min-height:0;overflow:hidden;background:#0b0b0d}
html.is-present #root{position:relative}
html.is-present .pptx-preview-wrapper{position:absolute!important;inset:0!important;width:auto!important;height:auto!important;margin:0!important;padding:0!important;background:transparent!important;overflow:hidden!important}
html.is-present .pptx-preview-slide-wrapper{margin:0!important}
.present-next-label{position:absolute;z-index:3;padding:3px 7px;border-radius:999px;background:rgb(0 0 0 / .55);color:rgb(255 255 255 / .82);font:600 10px/1.2 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;pointer-events:none;white-space:nowrap}
`

function officeDoc() {
  const src = `${location.origin}/viewers/office.js`
  const csp = [
    "default-src 'none'",
    `script-src ${src}`,
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data: blob:",
    "media-src data: blob:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ")
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="color-scheme" content="light dark"><style>${OFFICE_CSS}</style></head><body><div id="root"></div><script src="${src}"></script></body></html>`
}

type OfficeMessage = { type: "boot" } | { type: "ready"; pages: number } | { type: "error"; message: string }

interface Props {
  blob: Blob
  kind: "docx" | "pptx"
  title: string
  present?: boolean
  slide?: number
  onReady?: (pages: number) => void
}

/** Просмотр офисного файла; для pptx умеет включать режим презентации без перезагрузки. */
export function OfficeView({ blob, kind, title, present = false, slide = 0, onReady }: Props) {
  useLanguage()
  const nextLabel = translate("Дальше")
  const ref = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<"loading" | "ready" | { error: string }>("loading")
  const srcDoc = useMemo(() => officeDoc(), [])
  const onReadyRef = useRef(onReady)
  const state = useRef({ booted: false, ready: false, present, slide })

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  const send = useCallback((message: unknown) => {
    ref.current?.contentWindow?.postMessage(message, "*")
  }, [])

  useEffect(() => {
    state.current.present = present
    if (state.current.ready) send({ type: "present", value: present })
  }, [present, send])

  useEffect(() => {
    state.current.slide = slide
    if (state.current.ready) send({ type: "slide", index: slide })
  }, [slide, send])

  useEffect(() => {
    send({ type: "next-label", label: nextLabel })
  }, [nextLabel, send])

  useEffect(() => {
    let booted = false
    let timer = 0
    state.current.booted = false
    state.current.ready = false

    const onMessage = async (event: MessageEvent<OfficeMessage>) => {
      const win = ref.current?.contentWindow
      if (!win || event.source !== win) return
      if (event.data?.type === "boot") {
        booted = true
        state.current.booted = true
        win.postMessage({ type: "next-label", label: translate("Дальше") }, "*")
        const data = await blob.arrayBuffer()
        win.postMessage(
          {
            type: "render",
            kind,
            data,
            present: state.current.present,
            slide: state.current.slide,
          },
          "*",
          [data],
        )
      } else if (event.data?.type === "ready") {
        state.current.ready = true
        setStatus("ready")
        onReadyRef.current?.(event.data.pages)
        win.postMessage({ type: "present", value: state.current.present }, "*")
        win.postMessage({ type: "slide", index: state.current.slide }, "*")
      } else if (event.data?.type === "error") {
        setStatus({ error: String(event.data.message) })
      }
    }

    const onLoad = () => {
      timer = window.setTimeout(() => !booted && setStatus({ error: translate("Просмотрщик недоступен.") }), 1500)
    }

    const frame = ref.current
    addEventListener("message", onMessage)
    frame?.addEventListener("load", onLoad)
    return () => {
      clearTimeout(timer)
      removeEventListener("message", onMessage)
      frame?.removeEventListener("load", onLoad)
    }
  }, [blob, kind])

  return (
    <div className="relative size-full">
      <iframe
        ref={ref}
        title={title}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        referrerPolicy="no-referrer"
        className={cn("size-full border-0", present && "bg-neutral-950", status !== "ready" && "invisible")}
      />
      {status === "loading" && (
        <div className="absolute inset-0">
          <Spinner text={translate("Загрузка…")} />
        </div>
      )}
      {typeof status === "object" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-[13px] text-muted-foreground">
          <p className="font-medium text-foreground">{translate("Не удалось показать файл")}</p>
          <p className="max-w-sm">{translate(status.error)}</p>
          <p>{translate("Скачай оригинал.")}</p>
        </div>
      )}
    </div>
  )
}
