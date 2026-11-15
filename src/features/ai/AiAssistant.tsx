import { Loader2, Sparkles, X } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { translate, useLanguage } from "@/app/i18n"
import { useUi, type BallPosition } from "@/app/store"
import { Button } from "@/components/ui/Button"
import { springSoft } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { AssistantView } from "./assistantView"
import { AI_BALL_SIZE, AI_PANEL_MAX_HEIGHT, clampBall, placePanel } from "./ballPlacement"
import { summaryBlocks } from "./summaryBlocks"

const DRAG_SLOP = 4

interface DragState {
  pointerId: number
  fromX: number
  fromY: number
  originX: number
  originY: number
  moved: boolean
}

/** Круглая кнопка помощника: перетаскивается по экрану и разворачивается в окно в свободную сторону. */
export function AiAssistant({
  view,
  onOpen,
  onClose,
  onRetry,
}: {
  view: AssistantView
  onOpen: () => void
  onClose: () => void
  onRetry: () => void
}) {
  useLanguage()
  const stored = useUi((s) => s.aiBall)
  const saveBall = useUi((s) => s.setAiBall)
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [pos, setPos] = useState<BallPosition | null>(() => (stored ? clampBall(stored, viewport) : null))
  const [dragging, setDragging] = useState(false)
  const drag = useRef<DragState | null>(null)
  const lastPointerUp = useRef(0)
  const ballRef = useRef<HTMLButtonElement>(null)
  const open = view.status !== "closed"

  useEffect(() => {
    const onResize = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      setViewport({ width, height })
      const current = useUi.getState().aiBall
      if (!current) return
      const next = clampBall(current, { width, height })
      if (next.x === current.x && next.y === current.y) return
      setPos(next)
      saveBall(next)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [saveBall])

  const origin = (): BallPosition => {
    if (pos) return pos
    const rect = ballRef.current?.getBoundingClientRect()
    if (rect) return { x: rect.left, y: rect.top }
    return { x: viewport.width - AI_BALL_SIZE - 16, y: viewport.height - AI_BALL_SIZE - 72 }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    // Иначе при перетаскивании мышью выделяется текст под шариком.
    event.preventDefault()
    const start = origin()
    drag.current = {
      pointerId: event.pointerId,
      fromX: event.clientX,
      fromY: event.clientY,
      originX: start.x,
      originY: start.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    const dx = event.clientX - state.fromX
    const dy = event.clientY - state.fromY
    if (!state.moved && Math.hypot(dx, dy) < DRAG_SLOP) return
    if (!state.moved) {
      state.moved = true
      setDragging(true)
    }
    setPos(clampBall({ x: state.originX + dx, y: state.originY + dy }, viewport))
  }

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    drag.current = null
    lastPointerUp.current = Date.now()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!state.moved) {
      if (!cancelled) onOpen()
      return
    }
    setDragging(false)
    const next =
      cancelled && pos
        ? pos
        : clampBall({ x: state.originX + event.clientX - state.fromX, y: state.originY + event.clientY - state.fromY }, viewport)
    setPos(next)
    saveBall(next)
  }

  // pointerup уже открыл окно; click после перетаскивания и после обычного нажатия не нужен.
  const handleClick = () => {
    if (Date.now() - lastPointerUp.current < 400) return
    onOpen()
  }

  const placement = pos && open ? placePanel(pos, viewport) : null
  const maxHeight = placement?.maxHeight ?? Math.min(viewport.height * 0.6, AI_PANEL_MAX_HEIGHT)
  const wrapperStyle: CSSProperties | undefined = !pos
    ? undefined
    : placement
      ? {
          left: placement.left,
          width: placement.width,
          ...(placement.top !== null ? { top: placement.top } : { bottom: placement.bottom ?? 0 }),
        }
      : { left: pos.x, top: pos.y }

  return createPortal(
    <motion.div
      layout
      initial={false}
      animate={{ borderRadius: open ? 18 : 28 }}
      transition={dragging ? { duration: 0 } : springSoft}
      style={wrapperStyle}
      className={cn(
        "glass fixed z-40 overflow-hidden",
        !open && "size-14",
        !pos && "right-[max(1rem,var(--safe-right))] bottom-[calc(4.5rem+var(--safe-bottom))] md:bottom-5",
        open && !pos && "w-[min(22rem,calc(100vw-2rem))]",
        dragging && "shadow-float",
      )}
    >
      {open ? (
        <motion.div
          key="panel"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.18, delay: 0.05 } }}
          style={{ maxHeight }}
          className="flex flex-col"
        >
          <header className="flex items-start gap-2 px-3.5 pt-3 pb-2">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-highlight/15">
              <Sparkles className="size-3.5 text-highlight" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-tight font-semibold">{translate("О чём текст?")}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {translate(view.scope === "selection" ? "Выделенный фрагмент" : "Весь конспект")}
              </p>
            </div>
            <button
              type="button"
              aria-label={translate("Закрыть")}
              onClick={onClose}
              className="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          </header>

          <div aria-live="polite" className="thin-scrollbar overflow-y-auto px-3.5 pb-3">
            {view.status === "loading" && (
              <p className="flex items-center gap-2 py-2 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {translate("Помощник читает…")}
              </p>
            )}

            {view.status === "error" && (
              <div className="space-y-2 py-1">
                <p className="text-[13px] font-medium text-destructive">{translate("Не удалось объяснить текст")}</p>
                <p className="text-[12.5px] text-muted-foreground">{view.error}</p>
                <Button size="sm" variant="outline" onClick={onRetry}>
                  {translate("Повторить")}
                </Button>
              </div>
            )}

            {view.status === "ready" && <SummaryBody text={view.text} />}

            {view.status === "ready" && view.truncated && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">{translate("Текст длинный — помощник прочитал начало.")}</p>
            )}
          </div>
        </motion.div>
      ) : (
        <motion.button
          key="button"
          ref={ballRef}
          type="button"
          onClick={handleClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => finishDrag(event, false)}
          onPointerCancel={(event) => finishDrag(event, true)}
          aria-label={translate("Объяснить текст")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, scale: dragging ? 1.08 : 1, transition: { duration: 0.15 } }}
          className={cn(
            "flex size-14 touch-none items-center justify-center rounded-full text-highlight outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          <Sparkles className="size-5" />
        </motion.button>
      )}
    </motion.div>,
    document.body,
  )
}

function SummaryBody({ text }: { text: string }) {
  const blocks = summaryBlocks(text)
  return (
    <div className="space-y-2 pb-1 text-[13px] leading-relaxed">
      {blocks.map((block, index) => {
        if (block.kind === "heading")
          return (
            <p key={index} className="pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {inline(block.text)}
            </p>
          )
        if (block.kind === "list")
          return (
            <ul key={index} className={cn("space-y-1 pl-4 marker:text-muted-foreground", block.ordered ? "list-decimal" : "list-disc")}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item)}</li>
              ))}
            </ul>
          )
        return <p key={index}>{inline(block.text)}</p>
      })}
    </div>
  )
}

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={index} className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      )
    return part
  })
}
