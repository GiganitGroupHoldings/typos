import { GripVertical, Maximize2, Plus, X } from "lucide-react"
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react"
import { useEffect, useState } from "react"
import { useParams } from "react-router"
import { translate, useLanguage } from "@/app/i18n"
import { useUi } from "@/app/store"
import { Button } from "@/components/ui/Button"
import { useLiquidLens } from "@/components/ui/LiquidLens"
import { CARD_LENS } from "@/components/ui/liquidLensOptions"
import { useIsMobile } from "@/hooks/useIsMobile"
import { dur, easeIn, springSoft } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { Pin } from "@/types"
import { usePinsOf, useSubject } from "@/vault/hooks"
import { useVault } from "@/vault/store"
import { PinActions } from "./PinActions"
import { PinBody } from "./PinCard"
import { openPinEditor } from "./PinEditorDialog"

export function PinsDrawer() {
  useLanguage()
  const { subjectId } = useParams()
  const subject = useSubject(subjectId)
  const pins = usePinsOf(subjectId)
  const open = useUi((s) => s.pinsOpen)
  const setOpen = useUi((s) => s.setPinsOpen)
  const lens = useLiquidLens(CARD_LENS)
  const mobile = useIsMobile()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="pins"
          aria-label={translate("Закреп")}
          initial={mobile ? { y: 40, opacity: 0 } : { x: 24, opacity: 0 }}
          animate={mobile ? { y: 0, opacity: 1, transition: springSoft } : { x: 0, opacity: 1, transition: springSoft }}
          exit={
            mobile
              ? { y: 40, opacity: 0, transition: { duration: dur.base * 0.65, ease: easeIn } }
              : { x: 24, opacity: 0, transition: { duration: dur.base * 0.65, ease: easeIn } }
          }
          className={cn(
            lens.className,
            "absolute top-14 right-3 bottom-3 z-20 flex w-[min(340px,calc(100%-24px))] flex-col rounded-[var(--radius-surface)]",
            "max-md:inset-x-0 max-md:top-auto max-md:right-0 max-md:bottom-0 max-md:h-[85dvh] max-md:w-full max-md:rounded-b-none max-md:pb-[var(--safe-bottom)]",
          )}
        >
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border md:hidden" />
          <header className="flex items-center gap-1 border-b py-2 pr-2 pl-4">
            <h2 className="flex-1 truncate text-sm font-semibold">{subject ? subject.name : translate("Закреп")}</h2>
            {subject && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={translate("Новый закреп")}
                className="max-md:size-10"
                onClick={() => openPinEditor({ subjectId: subject.id })}
              >
                <Plus />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate("Закрыть закреп")}
              className="max-md:size-10"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </header>

          {!subject ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{translate("Выбери предмет")}</p>
          ) : !pins.length ? (
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">{translate("Нет закрепов")}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => openPinEditor({ subjectId: subject.id })}>
                <Plus /> {translate("Закреп")}
              </Button>
            </div>
          ) : (
            <PinList pins={pins} subjectId={subject.id} />
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function PinList({ pins, subjectId }: { pins: Pin[]; subjectId: string }) {
  const [order, setOrder] = useState(pins)
  useEffect(() => setOrder(pins), [pins])
  const commit = () => {
    const ids = order.map((p) => p.id)
    if (ids.join() !== pins.map((p) => p.id).join()) void useVault.getState().reorderPins(subjectId, ids)
  }

  return (
    <Reorder.Group axis="y" values={order} onReorder={setOrder} className="thin-scrollbar flex-1 space-y-2 overflow-y-auto p-3">
      {order.map((p) => (
        <PinRow key={p.id} pin={p} siblings={pins} onDrop={commit} />
      ))}
    </Reorder.Group>
  )
}

function PinRow({ pin, siblings, onDrop }: { pin: Pin; siblings: Pin[]; onDrop: () => void }) {
  useLanguage()
  const controls = useDragControls()
  const floating = useUi((s) => s.windows.some((w) => w.id === `pin:${pin.id}`))
  const openWindow = useUi((s) => s.openWindow)

  return (
    <Reorder.Item value={pin} dragListener={false} dragControls={controls} onDragEnd={onDrop} className="relative list-none">
      {floating ? (
        <div className="rounded-xl border border-dashed px-4 py-3 text-[13px] text-muted-foreground">
          {translate("«{0}» открыто в окне", pin.title)}
        </div>
      ) : (
        <motion.div
          layoutId={`pin-${pin.id}`}
          transition={springSoft}
          onDoubleClick={() => openPinEditor({ subjectId: pin.subjectId, pinId: pin.id })}
          className={cn("group relative py-3", pin.kind === "link" ? "pr-14" : "rounded-xl border bg-background pr-9 pl-7")}
        >
          <button
            type="button"
            aria-label={translate("Перетащить «{0}»", pin.title)}
            onPointerDown={(e) => controls.start(e)}
            className={cn(
              "absolute cursor-grab touch-none rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 hover:text-foreground focus-visible:opacity-100 active:cursor-grabbing",
              pin.kind === "link" ? "top-3 right-8" : "top-3 left-1.5",
            )}
          >
            <GripVertical className="size-4" />
          </button>
          <PinBody pin={pin} size={pin.kind === "link" ? "lg" : "md"} />
          <div className="absolute top-2 right-1.5 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 pointer-coarse:opacity-100 focus-within:opacity-100">
            <PinActions pin={pin} siblings={siblings} />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={translate("Открыть «{0}» в окне", pin.title)}
              onClick={() => openWindow("pin", pin.id)}
            >
              <Maximize2 />
            </Button>
          </div>
        </motion.div>
      )}
    </Reorder.Item>
  )
}
