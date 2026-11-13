/**
 * Ищет слайды в HTML-документе. Функция полностью самодостаточна: её текст
 * попадает в sandbox-iframe через withCsp.
 */
export function findSlides(doc: Document): HTMLElement[] | null {
  const concrete = (nodes: Element[]) => nodes.filter((node): node is HTMLElement => node instanceof HTMLElement)

  const explicit = doc.querySelector("[data-typos-slides]")
  if (explicit) {
    const slides = concrete([...explicit.children])
    if (slides.length > 1) return slides
  }

  const byClass = concrete([...doc.querySelectorAll(".slide")])
  if (byClass.length > 1) return byClass

  const deck = doc.querySelector(".slides, .deck, [data-slides]")
  if (deck) {
    const slides = concrete([...deck.children])
    if (slides.length > 1) return slides
  }

  const marked = concrete([...doc.querySelectorAll("[data-slide]")])
  if (marked.length > 1) return marked

  const sections = concrete([...doc.querySelectorAll("main > section")])
  if (sections.length > 1) return sections

  return null
}

/** Быстрая проверка перед показом кнопки режима презентации для HTML-тулзы. */
export function looksLikeSlides(html: string): boolean {
  return /data-typos-slides|class\s*=\s*["'][^"']*\bslides?\b/i.test(html)
}

/** Мост внутри iframe: навигация по слайдам и превью следующего. */
export function installHtmlSlides(win: Window, find: (doc: Document) => HTMLElement[] | null): void {
  const doc = win.document
  let slides: HTMLElement[] = []
  let active = 0
  let present = false
  let previewOn = true
  let nextLabel = "Дальше"
  let busy = false
  let pending = -1
  let preview: HTMLElement | null = null
  let busyTimer = 0

  const send = (type: string, data?: Record<string, unknown>) => {
    const message: Record<string, unknown> = { type }
    if (data) {
      for (const key in data) message[key] = data[key]
    }
    try {
      win.parent.postMessage(message, "*")
    } catch {
      // Родитель может быть недоступен в момент выгрузки iframe.
    }
  }

  const activeIndex = () => {
    for (let i = 0; i < slides.length; i++) {
      const el = slides[i]
      if (el.classList.contains("active") || el.classList.contains("present") || el.getAttribute("aria-hidden") === "false") return i
    }
    return 0
  }

  const showByClass = (index: number) => {
    slides.forEach((el, i) => {
      el.classList.toggle("active", i === index)
      el.setAttribute("aria-hidden", i === index ? "false" : "true")
    })
  }

  const removePreview = () => {
    if (preview) {
      preview.remove()
      preview = null
    }
  }

  const refreshPreview = () => {
    removePreview()
    if (!present || !previewOn || active + 1 >= slides.length) return

    const currentSlide = slides[active]
    if (!currentSlide) return
    const rect = currentSlide.getBoundingClientRect()
    const width = rect.width > 0 ? rect.width : 1920
    const height = rect.height > 0 ? rect.height : 1080
    const background = win.getComputedStyle(doc.body).backgroundColor || "#02080d"

    const box = doc.createElement("div")
    box.setAttribute("aria-hidden", "true")
    box.style.cssText = `position:fixed;right:16px;bottom:16px;width:min(210px,28vw);aspect-ratio:${width}/${height};z-index:2147483647;overflow:hidden;border-radius:10px;background:${background};box-shadow:0 0 0 1px rgb(255 255 255 / .18),0 12px 32px rgb(0 0 0 / .45);cursor:pointer;`

    const backgrounds = doc.querySelectorAll(".scene-background")
    const nextBackground = backgrounds[active + 1]
    if (nextBackground) {
      const copy = nextBackground.cloneNode(true) as HTMLElement
      copy.style.opacity = "1"
      copy.style.pointerEvents = "none"
      box.append(copy)
    }

    const clone = slides[active + 1].cloneNode(true) as HTMLElement
    // Колода может прятать оригиналы текста и медиа, перенося их в отдельные слои.
    // В статичном превью этих слоёв нет, поэтому возвращаем оригиналы на место.
    clone.querySelectorAll<HTMLElement>("[style]").forEach((node) => {
      if (node.style.fillOpacity === "0") node.style.fillOpacity = "1"
      if (node.style.visibility === "hidden") node.style.visibility = "visible"
      if (node.style.opacity === "0") node.style.opacity = "1"
    })
    clone.classList.add("active")
    clone.removeAttribute("aria-hidden")
    clone.style.display = "block"
    clone.style.position = "absolute"
    clone.style.inset = "0"
    clone.style.width = "100%"
    clone.style.height = "100%"
    clone.style.margin = "0"
    clone.style.transform = "none"
    clone.style.zIndex = "1"
    clone.style.pointerEvents = "none"
    box.append(clone)

    const label = doc.createElement("div")
    label.textContent = nextLabel
    label.style.cssText =
      "position:absolute;left:8px;top:8px;z-index:3;padding:3px 7px;border-radius:999px;background:rgb(0 0 0 / .55);color:rgb(255 255 255 / .82);font:600 10px/1.2 system-ui,sans-serif;letter-spacing:.04em;text-transform:uppercase;pointer-events:none;"
    box.append(label)

    box.addEventListener("click", (event) => {
      event.stopPropagation()
      go(active + 1)
    })
    doc.body.append(box)
    preview = box
  }

  function finishBusy(): void {
    if (!busy) return
    if (busyTimer) {
      win.clearTimeout(busyTimer)
      busyTimer = 0
    }
    busy = false
    const index = activeIndex()
    if (index !== active) {
      active = index
      send("typos:index", { index })
      refreshPreview()
    }
    const target = pending
    pending = -1
    if (target >= 0 && target !== active) go(target)
  }

  function go(index: number): void {
    if (!present || !slides.length) return
    const target = Math.max(0, Math.min(slides.length - 1, Math.round(index)))
    if (busy) {
      pending = target
      return
    }
    if (target === activeIndex()) {
      pending = -1
      return
    }

    busy = true
    const show = (win as unknown as { show?: (index: number) => void }).show
    try {
      if (typeof show === "function") show.call(win, target)
      else showByClass(target)
    } catch {
      showByClass(target)
    }
    active = activeIndex()
    if (active !== target) pending = target
    send("typos:index", { index: active })
    refreshPreview()
    if (busyTimer) win.clearTimeout(busyTimer)
    busyTimer = win.setTimeout(finishBusy, 1600)
  }

  const maybeFinish = () => {
    if (!busy) return
    if (doc.querySelector(".slide.departing")) return
    finishBusy()
  }

  const applyPresent = () => {
    if (present) {
      doc.documentElement.classList.add("typos-present")
      refreshPreview()
    } else {
      doc.documentElement.classList.remove("typos-present")
      removePreview()
    }
  }

  const init = () => {
    slides = find(doc) || []
    if (slides.length < 2) {
      send("typos:slides", { pages: 0 })
      return
    }

    active = activeIndex()
    send("typos:slides", { pages: slides.length, index: active })

    // Явная разметка data-typos-slides сама по себе не обязана скрывать слайды.
    const style = doc.createElement("style")
    style.textContent =
      ".typos-present [data-typos-slides] > *{display:none!important}.typos-present [data-typos-slides] > .active{display:block!important}"
    doc.head.append(style)

    const observer = new MutationObserver(() => {
      const index = activeIndex()
      if (index !== active) {
        active = index
        send("typos:index", { index })
        refreshPreview()
      }
      maybeFinish()
    })
    slides.forEach((slide) => observer.observe(slide, { attributes: true, attributeFilter: ["class", "aria-hidden"] }))

    win.addEventListener("message", (event: MessageEvent) => {
      if (event.source !== win.parent) return
      const data = event.data as { type?: unknown; value?: unknown; index?: unknown; label?: unknown } | null
      if (!data || typeof data.type !== "string") return
      if (data.type === "typos:present") {
        present = !!data.value
        applyPresent()
      } else if (data.type === "typos:slide" && typeof data.index === "number") {
        go(data.index)
      } else if (data.type === "typos:preview") {
        previewOn = !!data.value
        if (typeof data.label === "string") nextLabel = data.label
        refreshPreview()
      } else if (data.type === "typos:hello") {
        send("typos:slides", { pages: slides.length, index: active })
      }
    })
  }

  if (doc.readyState === "loading") {
    // Даём скриптам самой тулзы создать слайды на DOMContentLoaded.
    doc.addEventListener("DOMContentLoaded", () => win.setTimeout(init, 0), { once: true })
  } else {
    init()
  }
}

export const HTML_SLIDES_RUNTIME = `(() => { const findSlides = ${findSlides.toString()}; (${installHtmlSlides.toString()})(window, findSlides); })()`
