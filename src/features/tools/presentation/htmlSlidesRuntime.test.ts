import { afterEach, describe, expect, it, vi } from "vitest"
import { HTML_SLIDES_RUNTIME } from "./htmlSlides"

const slides = `<main>
  <section class="slide active">1</section>
  <section class="slide">2</section>
  <section class="slide">3</section>
</main>`

afterEach(() => {
  document.body.innerHTML = ""
  document.documentElement.className = ""
  vi.restoreAllMocks()
})

describe("мост HTML-презентации", () => {
  it("включает послайдовый режим и переключает слайды", () => {
    document.body.innerHTML = slides
    const post = vi.spyOn(window, "postMessage").mockImplementation(() => {})
    window.eval(HTML_SLIDES_RUNTIME)
    window.dispatchEvent(new MessageEvent("message", { source: window.parent, data: { type: "typos:present", value: true } }))

    expect(document.documentElement.classList.contains("typos-present")).toBe(true)
    expect(document.body.querySelector("div[aria-hidden='true']")).not.toBeNull()

    window.dispatchEvent(new MessageEvent("message", { source: window.parent, data: { type: "typos:slide", index: 2 } }))
    const sections = [...document.querySelectorAll("main > .slide")]
    expect(sections[2].classList.contains("active")).toBe(true)
    expect(sections[0].classList.contains("active")).toBe(false)
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: "typos:slides", pages: 3 }), "*")
  })
})
