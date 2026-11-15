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
