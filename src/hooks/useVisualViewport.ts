import { useEffect, useState } from "react"

/** Высота клавиатуры: на iOS visual viewport не меняет layout viewport, поэтому считаем разницу. */
export function useVisualViewport() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)))
    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
    }
  }, [])
  return inset
}
