import { renderAsync } from "docx-preview"
import JSZip from "jszip"
import { init } from "pptx-preview"
import { presentationLayout } from "./presentationLayout"

type Kind = "docx" | "pptx"
type Incoming =
  | { type: "render"; kind: Kind; data: ArrayBuffer; present?: boolean; slide?: number }
  | { type: "present"; value: boolean }
  | { type: "slide"; index: number }
  | { type: "next-label"; label: string }

const root = document.getElementById("root") as HTMLElement
const post = (msg: { type: "boot" } | { type: "ready"; pages: number } | { type: "error"; message: string }) => parent.postMessage(msg, "*")

let current: { kind: Kind; data: ArrayBuffer } | null = null
let width = 0
let present = false
let slide = 0
let nextLabelText = "Дальше"
let baseWidth = 0
let baseHeight = 0
let savedStyles = new Map<HTMLElement, string>()
let nextLabel: HTMLElement | null = null

async function tidyPptx(data: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(data)
  const types = zip.file("[Content_Types].xml")
  if (!types) return data
  const xml = await types.async("text")
  const tidy = xml.replace(/<Override\b[^>]*PartName="\/([^"]+)"[^>]*\/>/g, (m, part: string) => (zip.file(decodeURI(part)) ? m : ""))
  if (tidy === xml) return data
  zip.file("[Content_Types].xml", tidy)
  return zip.generateAsync({ type: "arraybuffer" })
}

function fitDocx() {
  const page = root.querySelector<HTMLElement>("section.docx")
  root.style.zoom = page ? String(Math.min(1, (document.documentElement.clientWidth - 24) / (page.offsetWidth + 32))) : ""
}

function captureStyles() {
  savedStyles.clear()
  for (const el of root.querySelectorAll<HTMLElement>(".pptx-preview-slide-wrapper")) {
    savedStyles.set(el, el.getAttribute("style") ?? "")
  }
}

function removeLabel() {
  if (nextLabel) {
    nextLabel.remove()
    nextLabel = null
  }
}

function restoreStyles() {
  for (const [el, style] of savedStyles) el.setAttribute("style", style)
  savedStyles.clear()
  removeLabel()
}

function layoutPresent() {
  if (!current || current.kind !== "pptx") return
  const slides = [...root.querySelectorAll<HTMLElement>(".pptx-preview-slide-wrapper")]
  if (!slides.length) return
  slide = Math.max(0, Math.min(slide, slides.length - 1))

  const layout = presentationLayout(
    { width: root.clientWidth, height: root.clientHeight },
    { width: baseWidth || 1280, height: baseHeight || 720 },
    slide < slides.length - 1,
  )

  slides.forEach((el, index) => {
    if (index !== slide && index !== slide + 1) {
      el.style.display = "none"
      return
    }
    const box = index === slide ? layout.main : layout.next
    el.style.display = "block"
    el.style.position = "absolute"
    el.style.left = `${box.left}px`
    el.style.top = `${box.top}px`
    el.style.transformOrigin = "0 0"
    el.style.transform = `scale(${box.scale})`
    el.style.zIndex = index === slide ? "1" : "2"
  })

  if (layout.nextVisible) {
    if (!nextLabel) {
      nextLabel = document.createElement("div")
      nextLabel.className = "present-next-label"
      nextLabel.textContent = nextLabelText
      root.append(nextLabel)
    }
    nextLabel.style.display = "block"
    nextLabel.style.left = `${layout.next.left}px`
    nextLabel.style.top = `${Math.max(6, layout.next.top - 22)}px`
  } else if (nextLabel) {
    nextLabel.style.display = "none"
  }
}

function applyPresent() {
  if (!current || current.kind !== "pptx") return
  document.documentElement.classList.toggle("is-present", present)
  root.classList.toggle("is-present", present)
  if (!present) {
    restoreStyles()
    return
  }
  if (!savedStyles.size) captureStyles()
  layoutPresent()
}

async function render() {
  if (!current) return
  root.replaceChildren()
  root.style.zoom = ""
  document.documentElement.classList.remove("is-present")
  root.classList.remove("is-present")
  savedStyles.clear()
  nextLabel = null
  width = root.clientWidth
  try {
    if (current.kind === "docx") {
      await renderAsync(current.data, root, undefined, {
        className: "docx",
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        experimental: true,
        renderAltChunks: false,
        renderComments: false,
        useBase64URL: false,
      })
      fitDocx()
      post({ type: "ready", pages: root.querySelectorAll("section.docx").length })
    } else {
      const base = present ? Math.min(Math.max(width, 960), 1920) : Math.min(Math.max(width - 32, 320), 1600)
      const previewer = init(root, { width: base, mode: "list" })
      const pptx = (await previewer.preview(await tidyPptx(current.data.slice(0)))) as { slides?: unknown[] }
      if (!pptx.slides?.length) throw new Error("Не удалось показать ни один слайд презентации.")
      const first = root.querySelector<HTMLElement>(".pptx-preview-slide-wrapper")
      baseWidth = first?.offsetWidth || base
      baseHeight = first?.offsetHeight || Math.round((base * 9) / 16)
      slide = Math.max(0, Math.min(slide, pptx.slides.length - 1))
      if (present) applyPresent()
      post({ type: "ready", pages: pptx.slides.length })
    }

    for (const a of root.querySelectorAll("a[href]")) a.removeAttribute("href")
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) })
  }
}

addEventListener("message", (event: MessageEvent<Incoming>) => {
  if (event.source !== parent) return
  const data = event.data
  if (!data) return
  if (data.type === "render") {
    present = !!data.present
    slide = Math.max(0, Math.floor(data.slide ?? 0) || 0)
    current = { kind: data.kind, data: data.data }
    void render()
  } else if (data.type === "present") {
    present = !!data.value
    applyPresent()
  } else if (data.type === "slide") {
    slide = Math.max(0, Math.floor(data.index) || 0)
    if (present) layoutPresent()
  } else if (data.type === "next-label" && typeof data.label === "string") {
    nextLabelText = data.label
    if (present) layoutPresent()
  }
})

let timer = 0
new ResizeObserver(() => {
  if (current?.kind === "docx") return fitDocx()
  if (current?.kind !== "pptx") return
  if (present) {
    layoutPresent()
    return
  }
  if (Math.abs(root.clientWidth - width) < 24) return
  clearTimeout(timer)
  timer = window.setTimeout(render, 200)
}).observe(document.documentElement)

post({ type: "boot" })
