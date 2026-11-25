import { isBoardToolRef } from "@/features/boards/model"
import type { Tool } from "@/types"

/** Свой тип переноса, чтобы доска не путала файл из «Проектов» с файлом с рабочего стола. */
export const TOOL_DRAG_TYPE = "application/x-typos-tool"
const TEXT_MARK = "typos-tool:"

export interface ToolDragPayload {
  subjectId: string
  toolId: string
  name: string
}

export function writeToolDrag(dataTransfer: DataTransfer, tool: Pick<Tool, "id" | "subjectId" | "name">) {
  const payload = JSON.stringify({ subjectId: tool.subjectId, toolId: tool.id, name: tool.name })
  dataTransfer.effectAllowed = "copy"
  dataTransfer.setData(TOOL_DRAG_TYPE, payload)
  // Запасной формат для браузеров, которые прячут нестандартные типы.
  dataTransfer.setData("text/plain", `${TEXT_MARK}${payload}`)
}

export function readToolDrag(dataTransfer: DataTransfer): ToolDragPayload | null {
  const custom = dataTransfer.getData(TOOL_DRAG_TYPE)
  const plain = dataTransfer.getData("text/plain")
  const raw = custom || (plain.startsWith(TEXT_MARK) ? plain.slice(TEXT_MARK.length) : "")
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!isBoardToolRef(value)) return null
    const record = value as unknown as Record<string, unknown>
    return {
      subjectId: value.subjectId,
      toolId: value.toolId,
      name: typeof record.name === "string" ? record.name.slice(0, 200) : "",
    }
  } catch {
    return null
  }
}
