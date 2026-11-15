import { Editor } from "@tiptap/core"
import { afterEach, expect, it, vi } from "vitest"
import { buildExtensions } from "./extensions"

const context = () =>
  ({
    setTransform() {},
    clearRect() {},
    fillText() {},
    measureText: () => ({ width: 8 }),
    font: "",
    textBaseline: "",
    fillStyle: "",
  }) as unknown as CanvasRenderingContext2D

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it("блок ```ascii показывает canvas и прячет исходник до клика", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context())
  const element = document.createElement("div")
  document.body.append(element)
  const editor = new Editor({
    element,
    extensions: buildExtensions({ ascii: true }),
    content: "```ascii\n(o o)\n```",
    contentType: "markdown",
  })
  const block = element.querySelector(".ascii-block")
  expect(block).not.toBeNull()
  expect(block?.hasAttribute("data-editing")).toBe(false)
  expect(block?.querySelector("canvas")).not.toBeNull()
  editor.destroy()
  element.remove()
})
