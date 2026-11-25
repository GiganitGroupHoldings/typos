import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { AiAssistant } from "./AiAssistant"
import { CLOSED_ASSISTANT } from "./assistantView"

it("раскрывает инструменты без запуска запроса и запускает только выбранную команду", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const host = document.createElement("div")
  const container = document.body.appendChild(document.createElement("main"))
  const root = createRoot(host)
  const onTool = vi.fn()
  try {
    await act(async () =>
      root.render(createElement(AiAssistant, { container, view: CLOSED_ASSISTANT, onTool, onClose: vi.fn(), onRetry: vi.fn() })),
    )
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Помощник конспекта"]')!
    await act(async () => trigger.click())
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(trigger.hasAttribute("data-lit")).toBe(true)
    expect(onTool).not.toHaveBeenCalled()
    const menu = document.querySelector('[aria-label="Инструменты для всего конспекта"]')!
    expect(menu.querySelectorAll("button")).toHaveLength(7)
    const board = menu.querySelector<HTMLButtonElement>('button[aria-label="Создать доску по конспекту"]')!
    await act(async () => board.click())
    expect(onTool).toHaveBeenCalledExactlyOnceWith("board")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(menu.hasAttribute("inert")).toBe(true)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
