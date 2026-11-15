import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { mountAsciiCanvas2d } from "./asciiCanvas2d"
import { mountAsciiWebgl } from "./asciiWebgl"
import type { useBackdropMedia } from "./backdropMedia"
import type { AsciiRect } from "./photo"
import type { AsciiRenderer, AsciiRenderOptions } from "./renderer"

interface Props {
  media: NonNullable<ReturnType<typeof useBackdropMedia>>["media"]
  rect: AsciiRect | null
  local?: boolean
  detail: number
  contrast: number
  preview?: boolean
  removeBackground?: boolean
  className?: string
}

export function BackdropCanvas({
  media,
  rect,
  detail,
  contrast,
  local = false,
  preview = false,
  removeBackground = false,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<AsciiRenderer | null>(null)
  const latest = useRef<AsciiRenderOptions>({ rect, detail, contrast })

  useEffect(() => {
    latest.current = { rect, detail, contrast }
    renderer.current?.update(latest.current)
  }, [rect, detail, contrast])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !media) return
    const mount = { local, preview, removeBackground }
    const active = (media.kind === "text" ? null : mountAsciiWebgl(canvas, media, mount)) ?? mountAsciiCanvas2d(canvas, media, mount)
    renderer.current = active
    active.update(latest.current)
    return () => {
      renderer.current = null
      active.destroy()
    }
  }, [media, local, preview, removeBackground])

  // Смена типа источника меняет контекст canvas: 2D и WebGL на одном элементе не живут.
  const kind = !media ? "none" : media.kind === "text" ? "2d" : "gl"
  return (
    <canvas
      key={kind}
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 size-full text-highlight", className)}
    />
  )
}
