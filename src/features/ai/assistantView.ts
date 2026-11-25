import type { SummaryScope } from "./prompts"

export type AssistantStatus = "closed" | "loading" | "ready" | "error"

/** Состояние окна помощника: закрытое окно показывает круглую кнопку. */
export interface AssistantView {
  status: AssistantStatus
  scope: SummaryScope
  text: string
  truncated: boolean
  error: string
}

export const CLOSED_ASSISTANT: AssistantView = { status: "closed", scope: "note", text: "", truncated: false, error: "" }

export type BoardAssistantStatus = "idle" | "loading" | "done" | "error"

/** Окно помощника на доске: open отдельно от статуса, чтобы результат не терялся при закрытии. */
export interface BoardAssistantView {
  open: boolean
  status: BoardAssistantStatus
  step: string
  summary: string
  error: string
}

export const CLOSED_BOARD_ASSISTANT: BoardAssistantView = { open: false, status: "idle", step: "", summary: "", error: "" }
