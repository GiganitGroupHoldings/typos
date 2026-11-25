import { describe, expect, it } from "vitest"
import { readToolDrag, TOOL_DRAG_TYPE, writeToolDrag } from "./drag"

const transfer = () => {
  const data = new Map<string, string>()
  return {
    data,
    effectAllowed: "",
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  } as unknown as DataTransfer
}

describe("перенос файла проекта на доску", () => {
  it("кладёт id проекта и файла в свой тип и в запасной текст", () => {
    const dt = transfer()
    writeToolDrag(dt, { id: "t1", subjectId: "s1", name: "Схема.pdf" })
    expect(dt.effectAllowed).toBe("copy")
    expect(dt.getData(TOOL_DRAG_TYPE)).toContain('"toolId":"t1"')
    expect(readToolDrag(dt)).toEqual({ subjectId: "s1", toolId: "t1", name: "Схема.pdf" })

    const plain = transfer()
    plain.setData("text/plain", `typos-tool:${JSON.stringify({ subjectId: "s2", toolId: "t2" })}`)
    expect(readToolDrag(plain)).toEqual({ subjectId: "s2", toolId: "t2", name: "" })
  })

  it("не принимает чужие id, битый JSON и обычный текст", () => {
    const dt = transfer()
    dt.setData(TOOL_DRAG_TYPE, JSON.stringify({ subjectId: "../s", toolId: "t" }))
    expect(readToolDrag(dt)).toBeNull()

    dt.setData(TOOL_DRAG_TYPE, "{")
    expect(readToolDrag(dt)).toBeNull()

    dt.setData(TOOL_DRAG_TYPE, "")
    dt.setData("text/plain", "просто текст")
    expect(readToolDrag(dt)).toBeNull()
  })
})
