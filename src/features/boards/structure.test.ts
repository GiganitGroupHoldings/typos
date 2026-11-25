import { describe, expect, it } from "vitest"
import { boardBounds, type BoardData, type BoardEdge, type BoardNode } from "./model"
import {
  completionEdges,
  fallbackBranches,
  fallbackRoot,
  isStructureConnected,
  layoutStructure,
  structureLinks,
  structureUnits,
} from "./structure"

const card = (id: string, x = 0, y = 0, width = 120, height = 60): BoardNode => ({
  id,
  type: "text",
  x,
  y,
  width,
  height,
  text: id,
})

const frame = (id: string, x: number, y: number, label: string): BoardNode => ({
  id,
  type: "group",
  x,
  y,
  width: 300,
  height: 260,
  label,
})

const overlaps = (a: BoardNode, b: BoardNode) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y

function board(): BoardData {
  const a = frame("group-a", 0, 0, "A")
  const b = frame("group-b", 350, 0, "B")
  const c = frame("group-c", 700, 0, "C")
  const nodes = [a, card("a1", 40, 60), b, card("b1", 390, 60), c, card("c1", 740, 60), card("note", 0, 400, 160, 96)]
  const edges: BoardEdge[] = [
    { id: "inside-a", fromNode: "group-a", toNode: "a1" },
    { id: "external", fromNode: "a1", toNode: "b1" },
    { id: "note-a", fromNode: "note", toNode: "group-a" },
    { id: "b-c", fromNode: "group-b", toNode: "group-c" },
    { id: "inside-b", fromNode: "group-b", toNode: "b1" },
  ]
  return { nodes, edges }
}

describe("блоки доски", () => {
  it("собирает рамку с содержимым в один блок, а отдельные карточки — сами по себе", () => {
    const units = structureUnits(board())
    expect(units.map((u) => u.id)).toEqual(["group-a", "group-b", "group-c", "note"])
    expect(units[0].nodes.map((n) => n.id)).toEqual(["group-a", "a1"])
    expect(units[0].text).toContain("A (рамка)")
    expect(units[0].text).toContain("a1")
    expect(units[3].nodes.map((n) => n.id)).toEqual(["note"])
  })

  it("оставляет внутренние связи блока и поднимает внешние до рамок", () => {
    const data = board()
    const units = structureUnits(data)
    const links = structureLinks(data, units)
    expect(links.map((l) => `${l.a}>${l.b}`).sort()).toEqual(["group-a>group-b", "group-b>group-c", "note>group-a"])
  })

  it("двигает рамку вместе с содержимым и не даёт блокам наехать друг на друга", () => {
    const data = board()
    const units = structureUnits(data)
    const before = new Map(data.nodes.map((n) => [n.id, n]))
    const result = layoutStructure(data, units)

    for (const unit of units) {
      if (!unit.group) continue
      const group = result.nodes.find((n) => n.id === unit.group!.id)!
      for (const child of unit.nodes) {
        if (child.id === group.id) continue
        const moved = result.nodes.find((n) => n.id === child.id)!
        expect(Math.abs(moved.x - group.x - (child.x - unit.group.x))).toBeLessThanOrEqual(1)
        expect(Math.abs(moved.y - group.y - (child.y - unit.group.y))).toBeLessThanOrEqual(1)
      }
    }

    const frames = result.nodes.filter((n) => n.type === "group")
    const note = result.nodes.find((n) => n.id === "note")!
    for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) expect(overlaps(frames[i], frames[j])).toBe(false)
    for (const f of frames) expect(overlaps(f, note)).toBe(false)

    // Связь из карточки внутри рамки теперь идёт от рамки, внутренняя связь осталась.
    const external = result.edges.find((e) => e.id === "external")!
    expect(external).toMatchObject({ fromNode: "group-a", toNode: "group-b" })
    expect(result.edges.find((e) => e.id === "inside-a")).toMatchObject({ fromNode: "group-a", toNode: "a1" })
    expect(result.edges.some((e) => e.fromNode === "a1" && e.id !== "inside-a")).toBe(false)

    const again = layoutStructure(data, structureUnits(data))
    expect(again.nodes).toEqual(result.nodes)
    expect(before.get("note")!.x).toBe(0)
  })

  it("добавляет связи ИИ только между ещё не соединёнными блоками", () => {
    const units = structureUnits(board())
    const links = structureLinks(board(), units).filter((l) => l.a === "group-a" && l.b === "group-b")
    expect(isStructureConnected(units, links)).toBe(false)

    const extra = completionEdges(units, links, [
      { id: "group-b", parent: "group-a", order: 0 },
      { id: "group-c", parent: "group-b", order: 0 },
      { id: "note", parent: "group-c", order: 0 },
    ])
    expect(extra.map((e) => `${e.fromNode}>${e.toNode}`)).toEqual(["group-b>group-c", "group-c>note"])
    expect(new Set(extra.map((e) => e.id)).size).toBe(2)
  })
})

describe("запасная структура без ИИ", () => {
  it("берёт корень из связей и обходит все блоки", () => {
    const nodes = [card("a", 0, 0), card("b", 400, 0), card("c", 800, 0), card("d", 1200, 0)]
    const edges: BoardEdge[] = [
      { id: "e1", fromNode: "a", toNode: "b" },
      { id: "e2", fromNode: "b", toNode: "c" },
    ]
    expect(fallbackRoot(nodes, edges)).toBe("a")

    const branches = fallbackBranches(nodes, edges, "a")
    expect(new Set(branches.map((b) => b.id))).toEqual(new Set(["b", "c", "d"]))
    expect(branches.find((b) => b.id === "b")?.parent).toBe("a")
    expect(branches.find((b) => b.id === "c")?.parent).toBe("b")
    expect(branches.find((b) => b.id === "d")?.parent).toBe("a")
  })

  it("считает доску связной, когда все блоки в одной компоненте", () => {
    const units = structureUnits(board())
    const all = structureLinks(board(), units)
    expect(isStructureConnected(units, all)).toBe(true)
    expect(isStructureConnected(units, all.slice(0, 1))).toBe(false)
  })
})

describe("границы блоков", () => {
  it("не меняет координаты, если блок один", () => {
    const data: BoardData = { nodes: [frame("only", 10, 20, "Один")], edges: [] }
    const result = layoutStructure(data, structureUnits(data))
    expect(result).toEqual(data)
    expect(boardBounds(result.nodes)).toEqual({ x: 10, y: 20, width: 300, height: 260 })
  })
})
