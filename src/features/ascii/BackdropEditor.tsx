import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import { toast } from "sonner"
import { translate, useLanguage } from "@/app/i18n"
import { useUi } from "@/app/store"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog"
import { errorText } from "@/lib/errors"
import { genId } from "@/vault/format"
import { BackdropCanvas } from "./BackdropCanvas"
import { backdropPosition, overlaps, placeBackdrop } from "./backdropLayout"
import { useBackdropMedia } from "./backdropMedia"
import { useAsciiBackdrop, useBackdropEditor, type AsciiBackground, type BackdropDraft } from "./backdropStore"
import { parseAsciiArt } from "./format"
import { DEFAULT_CONTRAST, DEFAULT_DETAIL, fitRect, MAX_CONTRAST, moveRect, resizeRect, type AsciiRect } from "./photo"

export function BackdropEditor() {
  const draft = useBackdropEditor((s) => s.draft)
  return draft ? <Editor draft={draft} /> : null
}

function ExistingItem({ item }: { item: AsciiBackground }) {
  const { media } = useBackdropMedia(item.source) ?? {}
  return (
    <div className="pointer-events-none absolute overflow-hidden rounded-sm border border-border" style={backdropPosition(item.rect)}>
      <BackdropCanvas
        media={media ?? null}
        rect={null}
        detail={item.detail}
        contrast={item.contrastEnabled ? item.contrast : DEFAULT_CONTRAST}
        removeBackground={item.removeBackground}
        preview
        local
      />
    </div>
  )
}

function Editor({ draft }: { draft: BackdropDraft }) {
  useLanguage()
  const close = useBackdropEditor((s) => s.close)
  const save = useAsciiBackdrop((s) => s.save)
  const items = useAsciiBackdrop((s) => s.items)
  const others = items.filter((item) => item.id !== draft.id)
  const occupied = others.map((item) => item.rect)
  const [source, setSource] = useState(draft.source)
  const [rect, setRect] = useState(draft.rect ?? null)
  const [detail, setDetail] = useState(draft.detail ?? DEFAULT_DETAIL)
  const [contrast, setContrast] = useState(draft.contrast ?? DEFAULT_CONTRAST)
  const [contrastEnabled, setContrastEnabled] = useState(draft.contrastEnabled ?? false)
  const [removeBackground, setRemoveBackground] = useState(draft.removeBackground ?? false)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const [busy, setBusy] = useState(false)
  const [pasteError, setPasteError] = useState("")
  const drag = useRef<{ mode: "move" | "resize"; x: number; y: number; rect: AsciiRect } | null>(null)
  const pendingRect = useRef<AsciiRect | null>(null)
  const pendingFrame = useRef(0)
  const resource = useBackdropMedia(source)
  const media = resource?.media ?? null
  const aspect = media?.aspect ?? 1
  const effectiveRect = media && stage.w && stage.h ? (rect ?? placeBackdrop(fitRect(stage.w, stage.h, aspect), occupied, 0.1)) : null
  const textCanvas = !draft.source || draft.source.kind === "text"

  const stageRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const observer = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const pasteText = (clipboard: string) => {
    const text = /^\s*```ascii[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*\s*$/i.exec(clipboard)?.[1] ?? clipboard
    const parsed = parseAsciiArt(text)
    if (!parsed.ok) {
      setPasteError(translate(parsed.error))
      return
    }
    setPasteError("")
    setRect(null)
    setSource({ kind: "text", text })
  }

  const readClipboard = async () => {
    try {
      pasteText(await navigator.clipboard.readText())
    } catch {
      setPasteError(translate("Буфер недоступен. Вставь ASCII через Ctrl+V, Cmd+V или меню вставки."))
    }
  }

  const start = (mode: "move" | "resize") => (event: PointerEvent<HTMLDivElement>) => {
    if (!effectiveRect || busy) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { mode, x: event.clientX, y: event.clientY, rect: effectiveRect }
  }

  const schedule = (next: AsciiRect) => {
    pendingRect.current = next
    if (pendingFrame.current) return
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = 0
      if (pendingRect.current) setRect(pendingRect.current)
      pendingRect.current = null
    })
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || !stage.w || !stage.h) return
    event.stopPropagation()
    const next =
      current.mode === "move"
        ? moveRect(current.rect, (event.clientX - current.x) / stage.w, (event.clientY - current.y) / stage.h)
        : resizeRect(current.rect, (current.rect.x + current.rect.w) * stage.w + event.clientX - current.x, stage.w, stage.h, aspect)
    if (!occupied.some((other) => overlaps(next, other))) schedule(next)
  }

  const end = () => {
    drag.current = null
    if (!pendingFrame.current) return
    cancelAnimationFrame(pendingFrame.current)
    pendingFrame.current = 0
    if (pendingRect.current) setRect(pendingRect.current)
    pendingRect.current = null
  }

  useEffect(
    () => () => {
      cancelAnimationFrame(pendingFrame.current)
    },
    [],
  )

  const apply = async () => {
    if (!source || !effectiveRect) return
    setBusy(true)
    try {
      await save({ id: draft.id ?? genId(), source, rect: effectiveRect, detail, contrast, contrastEnabled, removeBackground })
      useUi.getState().setBackdrop("ascii")
      close()
      toast.success(translate("ASCII-фон обновлён"))
    } catch (error) {
      toast.error(translate("Не удалось сохранить фон"), { description: errorText(error) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && close()}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 top-0 left-0 z-[100] h-dvh max-w-none translate-none gap-0 overflow-hidden rounded-none border-0 bg-[var(--app-bg)] p-0 sm:max-w-none"
        onInteractOutside={(event) => event.preventDefault()}
        onPaste={(event) => {
          if (!textCanvas || busy) return
          event.preventDefault()
          pasteText(event.clipboardData.getData("text/plain"))
        }}
      >
        <div ref={stageRef} className="absolute inset-0 overflow-hidden">
          {others.map((item) => (
            <ExistingItem key={item.id} item={item} />
          ))}
          <BackdropCanvas
            media={media}
            rect={effectiveRect}
            detail={detail}
            contrast={contrastEnabled ? contrast : DEFAULT_CONTRAST}
            removeBackground={removeBackground}
            preview
          />
          {effectiveRect && (
            <div
              className="absolute cursor-move touch-none border border-highlight"
              style={backdropPosition(effectiveRect)}
              onPointerDown={start("move")}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onLostPointerCapture={end}
            >
              <div
                className="absolute -right-3 -bottom-3 grid size-8 cursor-nwse-resize place-items-center after:size-3 after:rounded-sm after:border after:border-highlight after:bg-background"
                onPointerDown={start("resize")}
                onPointerMove={move}
              />
            </div>
          )}
          {source && !resource && (
            <p role="status" className="p-4 text-center text-sm text-muted-foreground">
              {translate("Загрузка…")}
            </p>
          )}
          {(pasteError || resource?.error || (media && stage.w > 0 && !effectiveRect)) && (
            <p
              role="alert"
              className="absolute inset-x-0 top-4 mx-auto max-w-sm rounded-lg bg-background px-3 py-2 text-center text-destructive"
            >
              {pasteError || resource?.error || translate("На холсте нет свободного места. Уменьши или удали один из элементов.")}
            </p>
          )}
        </div>
        <aside className="absolute inset-x-0 bottom-0 z-10 flex max-h-[46dvh] flex-col gap-4 overflow-y-auto rounded-t-2xl border-t border-border bg-background/85 p-4 backdrop-blur-xl sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[19rem] sm:rounded-none sm:border-t-0 sm:border-l">
          <header className="grid gap-1">
            <DialogTitle>{translate("ASCII-фон")}</DialogTitle>
            <DialogDescription>
              {translate(source ? "Перетащи рисунок, за угол — размер." : "Вставь ASCII из буфера через Ctrl+V или Cmd+V.")}
            </DialogDescription>
          </header>
          {source && source.kind !== "text" && (
            <div className="grid gap-4 border-t border-border pt-4">
              <RangeControl label={translate("Детализация")} value={detail} max={100} disabled={busy} onChange={setDetail} />
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={contrastEnabled}
                  disabled={busy}
                  onChange={(event) => setContrastEnabled(event.currentTarget.checked)}
                />
                {translate("Включить контраст")}
              </label>
              {contrastEnabled && (
                <RangeControl label={translate("Контраст")} value={contrast} max={MAX_CONTRAST} disabled={busy} onChange={setContrast} />
              )}
              {source.kind === "photo" && (
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={removeBackground}
                    disabled={busy}
                    onChange={(event) => setRemoveBackground(event.currentTarget.checked)}
                  />
                  {translate("Убрать однотонный фон")}
                </label>
              )}
            </div>
          )}
          <div className="mt-auto grid gap-2">
            <Button className="w-full" disabled={busy || !effectiveRect} onClick={apply}>
              {translate(busy ? "Сохраняю…" : "Применить")}
            </Button>
            {textCanvas && (
              <Button variant="outline" className="w-full" disabled={busy} onClick={readClipboard}>
                {translate("Вставить из буфера")}
              </Button>
            )}
            <Button variant="ghost" className="w-full" disabled={busy} onClick={close}>
              {translate("Отмена")}
            </Button>
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  )
}

function RangeControl({
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  label: string
  value: number
  max: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="grid min-w-0 gap-2">
      <span className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        <span aria-hidden className="text-xs text-muted-foreground tabular-nums">
          {value}%
        </span>
      </span>
      <input
        className="h-9 w-full min-w-0"
        type="range"
        min={0}
        max={max}
        value={value}
        aria-valuetext={`${value}%`}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </label>
  )
}
