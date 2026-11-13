import { describe, expect, it } from "vitest"
import { findSlides, looksLikeSlides } from "./htmlSlides"

const doc = (html: string) => new DOMParser().parseFromString(html, "text/html")

describe("слайды в HTML-презентации", () => {
  it("находит слайды по классу slide", () => {
    const slides = findSlides(doc("<main><section class='slide active'>1</section><section class='slide'>2</section></main>"))
    expect(slides).toHaveLength(2)
  })

  it("находит слайды по явной разметке", () => {
    const slides = findSlides(doc("<div data-typos-slides><section>1</section><section>2</section><section>3</section></div>"))
    expect(slides).toHaveLength(3)
  })

  it("не принимает один слайд за презентацию", () => {
    expect(findSlides(doc("<main><section class='slide'>1</section></main>"))).toBeNull()
  })

  it("распознаёт частые разметки для кнопки режима", () => {
    expect(looksLikeSlides('<section class="slide active"></section>')).toBe(true)
    expect(looksLikeSlides("<div data-typos-slides></div>")).toBe(true)
    expect(looksLikeSlides("<div class='slides'><section></section></div>")).toBe(true)
    expect(looksLikeSlides("<div class='slider'></div>")).toBe(false)
    expect(looksLikeSlides("<canvas></canvas>")).toBe(false)
  })
})
