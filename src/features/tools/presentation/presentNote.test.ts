import { describe, expect, it } from "vitest"
import type { Note } from "@/types"
import { pickPresentNote } from "./presentNote"

const note = (id: string, updated: string): Note => ({
  id,
  subjectId: "s",
  path: `Конспекты/${id}.md`,
  title: id,
  created: updated,
  updated,
  excerpt: "",
  body: "",
  meta: {},
})

const notes = [note("fresh", "2026-02-01"), note("old", "2026-01-01")]

describe("конспект для режима презентации", () => {
  it("берёт сохранённый конспект", () => {
    expect(pickPresentNote(notes, "old")?.id).toBe("old")
  })

  it("иначе берёт самый свежий", () => {
    expect(pickPresentNote(notes, "deleted")?.id).toBe("fresh")
    expect(pickPresentNote(notes)?.id).toBe("fresh")
  })

  it("без конспектов ничего не выбирает", () => {
    expect(pickPresentNote([], "old")).toBeUndefined()
  })
})
