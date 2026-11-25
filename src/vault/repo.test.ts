import { describe, expect, it } from "vitest"
import { noteBranches, noteHref, resolveNoteLink } from "@/features/notes/subnotes"
import { buildDocs, createIndex } from "@/features/search/searchIndex"
import { folderHref, resolveFolderLink } from "@/features/subjects/folderLinks"
import { createMemoryAdapter } from "@/storage/flatAdapter"
import { sampleVault } from "@/test/sampleVault"
import * as repo from "./repo"

describe("vault repo", () => {
  it("субконспект хранится с родителем и остаётся доступным, пока родитель в корзине", async () => {
    const a = createMemoryAdapter()
    const subject = await repo.createSubject(a, { name: "Запас", color: "orange", icon: "book" }, 0)
    const overview = await repo.createNote(a, subject, "# Обзор")
    const child = await repo.createNote(a, subject, "# Цена", overview.id)
    const other = await repo.createNote(a, subject, "# Цена")
    const body = `# Обзор\n\n[Цена](${noteHref(child)})`
    await repo.saveNote(a, overview, body)
    const { notes } = await repo.loadVault(a)
    expect(noteBranches(notes).roots.map((n) => n.id)).toEqual(expect.arrayContaining([overview.id, other.id]))
    expect(
      noteBranches(notes)
        .parents.get(overview.id)
        ?.map((n) => n.id),
    ).toEqual([child.id])
    expect(resolveNoteLink(notes, overview, "цена")?.id).toBe(child.id)
    expect(notes.find((n) => n.id === overview.id)?.body).toBe(body)

    await repo.trashNote(a, overview)
    const [trash] = await repo.listTrash(a)
    expect(noteBranches((await repo.loadVault(a)).notes).roots.some((n) => n.id === child.id)).toBe(true)
    await repo.restoreFromTrash(a, trash.trashPath, trash.originalPath)
    expect(noteBranches((await repo.loadVault(a)).notes).parents.get(overview.id)?.[0].id).toBe(child.id)
  })
  it("load: предметы, конспекты, закреп, тулзы", async () => {
    const a = sampleVault()
    const v = await repo.loadVault(a)
    expect(v.subjects.map((s) => s.name)).toEqual(["Линейная алгебра", "Физика", "Алгоритмы", "История"])
    expect(v.notes).toHaveLength(7)
    expect(v.pins.filter((p) => p.subjectId === v.subjects[0].id).map((p) => p.title)[0]).toBe("Определитель 2×2")
    expect(v.tools.find((t) => t.name === "Калькулятор матриц")?.icon).toBe("grid")
  })

  it("создание → сохранение переименовывает файл по заголовку", async () => {
    const a = sampleVault()
    const { subjects } = await repo.loadVault(a)
    const note = await repo.createNote(a, subjects[1])
    expect(note.path).toBe("Физика/Конспекты/Без названия.md")

    const saved = await repo.saveNote(a, note, "# Импульс: закон сохранения\n\n$p = mv$")
    expect(saved.path).toBe("Физика/Конспекты/Импульс закон сохранения.md")
    expect(saved.title).toBe("Импульс: закон сохранения")
    expect(await a.exists(note.path)).toBe(false)

    const again = await repo.saveNote(a, saved, "# Импульс: закон сохранения\n\n$p = mv$, правка")
    expect(again.path).toBe(saved.path)

    const reloaded = (await repo.loadVault(a)).notes.find((n) => n.id === note.id)
    expect(reloaded?.body).toBe("# Импульс: закон сохранения\n\n$p = mv$, правка")
  })

  it("одинаковые заголовки не перезаписывают друг друга", async () => {
    const a = sampleVault()
    const { subjects } = await repo.loadVault(a)
    const n1 = await repo.saveNote(a, await repo.createNote(a, subjects[3]), "# Лекция")
    const n2 = await repo.saveNote(a, await repo.createNote(a, subjects[3]), "# Лекция")
    expect(n1.path).not.toBe(n2.path)
    expect(n2.path).toBe("История/Конспекты/Лекция (2).md")
  })

  it("новое имя конспекта переживает сохранение, сохраняя текст, путь и родителя", async () => {
    const a = sampleVault()
    const { subjects } = await repo.loadVault(a)
    const note = await repo.createNote(a, subjects[0], "# Старый заголовок\n\nТекст", "parent-id")
    const title = '"Новое имя: план"'
    const renamed = await repo.renameNote(a, note, title)
    expect(renamed).toMatchObject({ id: note.id, path: note.path, body: note.body, title, meta: { parentNoteId: "parent-id" } })
    const updated = await repo.saveNote(a, renamed, `${note.body}\n\nДополнение`)
    expect((await repo.loadVault(a)).notes.find((n) => n.id === note.id)).toMatchObject({
      path: note.path,
      title,
      body: updated.body,
      meta: { parentNoteId: "parent-id" },
    })
  })

  it("корзина и восстановление", async () => {
    const a = sampleVault()
    const { notes } = await repo.loadVault(a)
    const n = notes[0]
    const trash = await repo.trashNote(a, n)
    expect(await a.exists(n.path)).toBe(false)
    expect((await repo.loadVault(a)).notes.some((x) => x.id === n.id)).toBe(false)
    await repo.restoreFromTrash(a, trash, n.path)
    expect((await repo.loadVault(a)).notes.find((x) => x.id === n.id)?.body).toBe(n.body)
  })

  it("папка, созданная руками, становится предметом", async () => {
    const a = createMemoryAdapter({ "Химия/Конспекты/Моль.md": "# Моль\n\nКоличество вещества" })
    const v = await repo.loadVault(a)
    expect(v.subjects[0].name).toBe("Химия")
    expect(v.notes[0].title).toBe("Моль")
    expect(await a.exists("Химия/_subject.json")).toBe(true)
  })

  it("перенос браузер → папка: всё копируется, существующее не перезаписывается, корзина пропускается", async () => {
    const browser = sampleVault()
    const n = (await repo.loadVault(browser)).notes[0]
    await repo.trashNote(browser, (await repo.loadVault(browser)).notes[1])
    const folder = createMemoryAdapter({ [n.path]: "# Моя версия" })

    const copied = await repo.copyVault(browser, folder)
    expect(copied).toBeGreaterThan(10)
    expect(await folder.readText(n.path)).toBe("# Моя версия")
    expect(await folder.list(".studynotes")).toEqual([])
    expect((await repo.loadVault(folder)).subjects).toHaveLength(4)
  })

  it("новый предмет: безопасное имя папки и без коллизий", async () => {
    const a = createMemoryAdapter()
    const s1 = await repo.createSubject(a, { name: "Мат/анализ: 1 курс", color: "blue", icon: "sigma" }, 0)
    expect(s1.dir).toBe("Мат анализ 1 курс")
    const s2 = await repo.createSubject(a, { name: "Мат/анализ: 1 курс", color: "rose", icon: "book" }, 1)
    expect(s2.dir).toBe("Мат анализ 1 курс (2)")
    const v = await repo.loadVault(a)
    expect(v.subjects.map((s) => [s.name, s.color])).toEqual([
      ["Мат анализ 1 курс", "blue"],
      ["Мат анализ 1 курс (2)", "rose"],
    ])
  })

  it("вложенные папки, пустые ветки и ссылки переживают переименование родителя и восстановление из корзины", async () => {
    const a = createMemoryAdapter()
    const input = { name: "Запас", color: "orange", icon: "book", customColor: "#ff6500" } as const
    const root = await repo.createSubject(a, input, 0)
    const section = await repo.createSubject(a, { ...input, name: "7P", customColor: undefined }, 0, root)
    const empty = await repo.createSubject(a, { ...input, name: "Цена" }, 0, section)
    const second = await repo.createSubject(a, { ...input, name: "Другой проект" }, 1)
    await repo.createSubject(a, { ...input, name: "Цена" }, 0, second)
    const body = `# Обзор\n\n[Цена](${folderHref(empty.id)})`
    const note = await repo.createNote(a, section, body)

    const renamed = await repo.updateSubject(a, root, { ...input, name: "ЗАПАС 2" })
    const loaded = await repo.loadVault(a)
    expect(await repo.countNotes(a)).toBe(1)
    expect(loaded.subjects.find((s) => s.id === root.id)?.customColor).toBe("#ff6500")
    expect(loaded.subjects.find((s) => s.id === section.id)?.parentId).toBe(root.id)
    expect(resolveFolderLink(loaded.subjects, section.id, "цена")?.id).toBe(empty.id)
    expect(resolveFolderLink(loaded.subjects, second.id, "ЗАПАС 2 / 7P / Цена")?.id).toBe(empty.id)
    expect(loaded.notes.find((n) => n.id === note.id)).toMatchObject({ subjectId: section.id, body })
    expect(loaded.notes.some((n) => n.subjectId === empty.id)).toBe(false)

    await repo.trashEntry(a, renamed.dir)
    const [item] = await repo.listTrash(a)
    expect((await repo.loadVault(a)).subjects.some((s) => s.id === empty.id)).toBe(false)
    await repo.restoreFromTrash(a, item.trashPath, item.originalPath)
    expect((await repo.loadVault(a)).subjects.find((s) => s.id === empty.id)?.parentId).toBe(section.id)
  })

  it("картинка сохраняется рядом с конспектом", async () => {
    const a = sampleVault()
    const n = (await repo.loadVault(a)).notes[0]
    const rel = await repo.saveAsset(a, "Физика/Конспекты", new Blob(["x"], { type: "image/gif" }))
    expect(rel).toMatch(/^assets\/\w+\.gif$/)
    expect(await a.exists(`Физика/Конспекты/${rel}`)).toBe(true)
    expect((await repo.loadVault(a)).notes.find((x) => x.id === n.id)).toBeTruthy()
  })

  it("один id у двух конспектов (переименовали на двух устройствах) — записи разные, поиск строится", async () => {
    const file = (body: string) => `---\nid: kryo0jmd\ncreated: 2026-10-18T13:29:37.044Z\n---\n\n${body}`
    const a = createMemoryAdapter({
      "Матан/Конспекты/Скибиди в.md": file("# Скибиди в"),
      "Матан/Конспекты/Скибиди а.md": file("# Скибиди а"),
    })
    const v = await repo.loadVault(a)
    expect(v.notes.find((n) => n.title === "Скибиди а")?.id).toBe("kryo0jmd")
    const other = v.notes.find((n) => n.title === "Скибиди в")!
    expect(other.id).not.toBe("kryo0jmd")
    expect(() => createIndex(buildDocs(v))).not.toThrow()

    expect((await repo.loadVault(a)).notes.find((n) => n.title === "Скибиди в")?.id).toBe(other.id)
    await repo.saveNote(a, other, "# Скибиди в\n\nправка")
    expect((await a.readText("Матан/Конспекты/Скибиди в.md"))!).toContain(`id: ${other.id}`)
  })

  it("папку предмета скопировали руками — у копии свой id, конспекты не путаются", async () => {
    const a = sampleVault()
    const files = await repo.loadVault(a)
    const la = files.subjects.find((s) => s.name === "Линейная алгебра")!
    for (const n of files.notes.filter((x) => x.subjectId === la.id))
      await a.writeText(n.path.replace(la.dir, "Копия"), (await a.readText(n.path))!)
    await a.writeText("Копия/_subject.json", (await a.readText(`${la.dir}/_subject.json`))!)

    const v = await repo.loadVault(a)
    const copy = v.subjects.find((s) => s.name === "Копия")!
    expect(copy.id).not.toBe(v.subjects.find((s) => s.name === "Линейная алгебра")!.id)
    expect(new Set(v.notes.map((n) => n.id)).size).toBe(v.notes.length)
    expect(v.notes.filter((n) => n.subjectId === copy.id)).toHaveLength(files.notes.filter((x) => x.subjectId === la.id).length)
    expect(() => createIndex(buildDocs(v))).not.toThrow()
  })
})
