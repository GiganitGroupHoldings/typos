import { useEffect, useSyncExternalStore } from "react"
import { useUi } from "./store"

const query = "(prefers-color-scheme: dark)"

function subscribe(cb: () => void) {
  const mq = window.matchMedia(query)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

const systemDark = () => window.matchMedia(query).matches

export function useResolvedTheme(): "light" | "dark" {
  const pref = useUi((s) => s.theme)
  const isSystemDark = useSyncExternalStore(subscribe, systemDark, () => false)
  return pref === "system" ? (isSystemDark ? "dark" : "light") : pref
}

export function useThemeSync() {
  const theme = useResolvedTheme()
  const bgColor = useUi((s) => s.bgColor)
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    root.style.colorScheme = theme
    if (bgColor) root.style.setProperty("--app-bg", bgColor)
    else root.style.removeProperty("--app-bg")
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute("content", bgColor ?? (theme === "dark" ? "#191918" : "#f3f2ed"))
  }, [theme, bgColor])
}
