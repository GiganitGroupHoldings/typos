import { Sparkles, X, type LucideIcon } from "lucide-react"
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { translate, useLanguage } from "@/app/i18n"
import { useVisualViewport } from "@/hooks/useVisualViewport"
import { NebulaDrop } from "./NebulaDrop"

export interface AssistantTool {
  id: string
  label: string
  icon: LucideIcon
  run: () => void
  disabled?: boolean
  caption?: string
}

function fanAngle(index: number, total: number) {
  return total === 1 ? 52 : (index / (total - 1)) * 90
}

const compactViewport = "(max-height: 380px), (max-width: 290px), (max-width: 767px) and (max-height: 435px)"

/** Каждый инструмент веера запускается отдельной кнопкой. */
export function AssistantBall({
  placement,
  container,
  open,
  onClose,
  label,
  title,
  subtitle,
  toolScope,
  tools,
  children,
}: {
  placement?: "note"
  container?: HTMLElement | null
  open: boolean
  onClose: () => void
  label: string
  title: string
  subtitle: ReactNode
  toolScope: string
  tools: AssistantTool[]
  children: ReactNode
}) {
  useLanguage()
  const [expanded, setExpanded] = useState(false)
  const keyboard = useVisualViewport()
  const compactQuery = placement === "note" ? `${compactViewport}, (hover: none)` : compactViewport
  const watchSpace = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia?.(compactQuery)
      media?.addEventListener("change", notify)
      const observer = container && typeof ResizeObserver !== "undefined" ? new ResizeObserver(notify) : null
      if (container) observer?.observe(container)
      return () => {
        media?.removeEventListener("change", notify)
        observer?.disconnect()
      }
    },
    [compactQuery, container],
  )
  const compact = useSyncExternalStore(
    watchSpace,
    () =>
      Boolean(window.matchMedia?.(compactQuery).matches || (container && (container.clientWidth < 460 || container.clientHeight < 360))),
    () => false,
  )
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const fan = useRef<HTMLUListElement>(null)
  const focusFirstTool = useRef(false)
  const showFan = expanded && !open

  useEffect(() => {
    if (!showFan) return
    if (placement !== "note" || focusFirstTool.current) {
      fan.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true })
    }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setExpanded(false)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [placement, showFan])

  const close = () => {
    setExpanded(false)
    if (open) onClose()
    trigger.current?.focus({ preventScroll: true })
  }

  return createPortal(
    <div
      ref={root}
      data-ai-assistant=""
      data-placement={placement}
      data-compact-fan={compact || keyboard > 0 || undefined}
      data-fan-open={showFan || undefined}
      style={{ "--assistant-keyboard": `${keyboard}px` } as CSSProperties}
      // Портал остаётся React-ребёнком доски и не должен запускать её жесты.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerCancel={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape" && (showFan || open)) {
          e.preventDefault()
          close()
        }
      }}
      onKeyUp={(e) => e.stopPropagation()}
      onDragOver={(e) => e.stopPropagation()}
      onDrop={(e) => e.stopPropagation()}
      className="assistant-corner"
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={showFan || open}
        aria-controls={open ? id : `${id}-tools`}
        data-lit={showFan || open || undefined}
        className="assistant-drop"
        onClick={(event) => {
          focusFirstTool.current = event.detail === 0
          if (open) onClose()
          setExpanded(!showFan)
        }}
      >
        {placement === "note" ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="assistant-star">
            <path d="M12 2.75C13.5 8.65 15.35 10.5 21.25 12C15.35 13.5 13.5 15.35 12 21.25C10.5 15.35 8.65 13.5 2.75 12C8.65 10.5 10.5 8.65 12 2.75Z" />
          </svg>
        ) : (
          <>
            <NebulaDrop />
            {showFan ? <X className="assistant-drop-icon" /> : <Sparkles className="assistant-drop-icon" />}
          </>
        )}
      </button>
      <ul ref={fan} id={`${id}-tools`} aria-label={toolScope} aria-hidden={!showFan} inert={!showFan} className="assistant-fan">
        {tools.map(({ id: toolId, label: toolLabel, caption, icon: Icon, disabled, run }, index) => {
          const angle = fanAngle(index, tools.length)
          return (
            <li
              key={toolId}
              data-top={angle >= 60 || undefined}
              style={
                {
                  "--fan-angle": `${angle}deg`,
                  "--fan-in-order": tools.length - index - 1,
                  "--fan-out-order": index,
                  "--fan-caption-rise": `${17 + Math.max(0, angle - 60) * 1.2}px`,
                  "--fan-caption-drop": `${Math.max(0, angle - 30) * 0.55}px`,
                } as CSSProperties
              }
            >
              <button
                type="button"
                aria-label={toolLabel}
                title={placement === "note" ? undefined : toolLabel}
                disabled={disabled}
                className="assistant-tool"
                onClick={() => {
                  setExpanded(false)
                  trigger.current?.focus({ preventScroll: true })
                  run()
                }}
              >
                <span className="assistant-tool-orb glass" aria-hidden>
                  <Icon className="size-[19px]" />
                </span>
                <span className="assistant-tool-label glass" aria-hidden>
                  {caption ?? toolLabel}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {open && (
        <section id={id} aria-label={title} className="assistant-result glass">
          <header className="flex items-start gap-2 px-3.5 pt-3 pb-2">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-highlight/15">
              <Sparkles className="size-3.5 text-highlight" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-tight font-semibold">{title}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">{subtitle}</p>
            </div>
            <button
              type="button"
              aria-label={translate("Закрыть")}
              onClick={close}
              className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          </header>
          <div aria-live="polite" className="thin-scrollbar min-h-0 overflow-y-auto px-3.5 pb-3">
            {children}
          </div>
        </section>
      )}
    </div>,
    container ?? document.body,
  )
}
