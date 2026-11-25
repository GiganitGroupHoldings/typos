import { frameContainsPoint } from "./frameGeometry"
import { boardBounds, boardItemId, type BoardData, type BoardEdge, type BoardNode, type Bounds } from "./model"

/** Расстояние между центрами блоков сверх их радиусов: ближе — будет тесно. */
const LINK_GAP = 80
/** Зазор между прямоугольниками блоков, чтобы рамки не наезжали друг на друга. */
const UNIT_GAP = 48
const ITERATIONS = 320
const MAX_STEP = 14

export interface StructureUnit {
  id: string
  nodes: BoardNode[]
  bounds: Bounds
  group?: BoardNode
  label: string
  /** Текст для микропромта: название рамки и её содержимое. */
  text: string
}

export interface BoardBranch {
  id: string
  parent: string
  order: number
}

const CARD_TEXT_LIMIT = 180

const nodeText = (n: BoardNode): string => {
  const raw = n.type === "text" ? (n.text ?? "") : n.type === "link" ? (n.label ?? n.url ?? "") : ((n.file ?? "").split("/").pop() ?? "")
  return raw.replace(/\s+/g, " ").trim()
}

const clip = (text: string) => (text.length > CARD_TEXT_LIMIT ? `${text.slice(0, CARD_TEXT_LIMIT - 1)}…` : text)

/** Рамка и её содержимое — один блок: на доске их нельзя разрывать при раскладке. */
export function structureUnits(data: BoardData): StructureUnit[] {
  const groups = data.nodes.filter((n) => n.type === "group")
  const claimed = new Set<string>()
  const units: StructureUnit[] = []

  for (const group of groups) {
    const children = data.nodes.filter((n) => {
      if (n.type === "group" || claimed.has(n.id)) return false
      return frameContainsPoint(
        { x: group.x, y: group.y, width: group.width, height: group.height },
        group.shape,
        n.x + n.width / 2,
        n.y + n.height / 2,
      )
    })
    for (const child of children) claimed.add(child.id)
    const nodes = [group, ...children]
    const label = group.label || "Рамка"
    const details = children.map(nodeText).filter(Boolean).slice(0, 6).join(", ")
    units.push({
      id: group.id,
      nodes,
      bounds: boardBounds(nodes)!,
      group,
      label,
      text: clip(details ? `${label} (рамка): ${details}` : `${label} (рамка)`),
    })
  }

  for (const node of data.nodes) {
    if (node.type === "group" || claimed.has(node.id)) continue
    const label = nodeText(node) || "Карточка"
    units.push({ id: node.id, nodes: [node], bounds: boardBounds([node])!, label, text: clip(label) })
  }

  return units
}

export function structureUnitNodes(units: StructureUnit[]): BoardNode[] {
  return units.map((u) => ({
    id: u.id,
    type: u.group ? "group" : "text",
    x: u.bounds.x,
    y: u.bounds.y,
    width: u.bounds.width,
    height: u.bounds.height,
    label: u.group ? u.label : undefined,
    text: u.group ? undefined : u.label,
  }))
}

export const structureUnitOf = (units: StructureUnit[]) => {
  const at = new Map<string, string>()
  for (const unit of units) for (const node of unit.nodes) at.set(node.id, unit.id)
  return at
}

export interface StructureLink {
  a: string
  b: string
  edge: BoardEdge
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Внешние связи между блоками: общие для ИИ и раскладки. */
export function structureLinks(data: BoardData, units: StructureUnit[]): StructureLink[] {
  const unitOf = structureUnitOf(units)
  const links = new Map<string, StructureLink>()
  for (const edge of data.edges) {
    const a = unitOf.get(edge.fromNode)
    const b = unitOf.get(edge.toNode)
    if (!a || !b || a === b) continue
    const key = pairKey(a, b)
    if (links.has(key)) continue
    links.set(key, { a, b, edge: { ...edge, fromNode: a, toNode: b } })
  }
  return [...links.values()]
}

export const structureLinkEdges = (links: StructureLink[]) => links.map((link) => link.edge)

export function isStructureConnected(units: StructureUnit[], links: StructureLink[]): boolean {
  const parent = new Map(units.map((u) => [u.id, u.id]))
  const find = (id: string): string => {
    let cur = id
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!
      parent.set(cur, parent.get(next)!)
      cur = next
    }
    return cur
  }
  for (const link of links) {
    const a = find(link.a)
    const b = find(link.b)
    if (a !== b) parent.set(a, b)
  }
  const roots = new Set(units.map((u) => find(u.id)))
  return roots.size <= 1
}

export function fallbackRoot(nodes: BoardNode[], edges: BoardEdge[]): string {
  const ids = new Set(nodes.map((n) => n.id))
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  for (const e of edges) {
    if (!ids.has(e.fromNode) || !ids.has(e.toNode) || e.fromNode === e.toNode) continue
    outgoing.set(e.fromNode, (outgoing.get(e.fromNode) ?? 0) + 1)
    incoming.set(e.toNode, (incoming.get(e.toNode) ?? 0) + 1)
  }
  const score = (id: string) =>
    (incoming.get(id) ?? 0) === 0 ? 1000 + (outgoing.get(id) ?? 0) : (outgoing.get(id) ?? 0) + (incoming.get(id) ?? 0)
  return [...nodes].sort((a, b) => score(b.id) - score(a.id) || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)).at(0)?.id ?? ""
}

/** Запасное дерево, если ИИ недоступен: связи с доски, остальные блоки — к корню. */
export function fallbackBranches(nodes: BoardNode[], edges: BoardEdge[], root: string): BoardBranch[] {
  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const at = new Map(nodes.map((n) => [n.id, n]))
  const next = new Map<string, { id: string; outgoing: boolean; edge: number }[]>()
  const push = (from: string, item: { id: string; outgoing: boolean; edge: number }) => {
    const list = next.get(from)
    if (list) list.push(item)
    else next.set(from, [item])
  }
  for (const [i, e] of edges.entries()) {
    if (e.fromNode === e.toNode || !index.has(e.fromNode) || !index.has(e.toNode)) continue
    push(e.fromNode, { id: e.toNode, outgoing: true, edge: i })
    push(e.toNode, { id: e.fromNode, outgoing: false, edge: i })
  }
  for (const list of next.values())
    list.sort(
      (a, b) =>
        Number(b.outgoing) - Number(a.outgoing) ||
        at.get(a.id)!.y - at.get(b.id)!.y ||
        at.get(a.id)!.x - at.get(b.id)!.x ||
        a.edge - b.edge,
    )

  const seen = new Set([root])
  const queue = [root]
  const branches: BoardBranch[] = []
  while (queue.length) {
    const id = queue.shift()!
    let order = 0
    for (const item of next.get(id) ?? []) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      branches.push({ id: item.id, parent: id, order: order++ })
      queue.push(item.id)
    }
  }
  for (const [id, i] of index) if (!seen.has(id)) branches.push({ id, parent: root, order: i })
  return branches
}

/** Добавляет связи ИИ только там, где компоненты доски ещё не соединены. */
export function completionEdges(units: StructureUnit[], links: StructureLink[], branches: BoardBranch[]): BoardEdge[] {
  const ids = new Set(units.map((u) => u.id))
  const parent = new Map(units.map((u) => [u.id, u.id]))
  const find = (id: string): string => {
    let cur = id
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!
      parent.set(cur, parent.get(next)!)
      cur = next
    }
    return cur
  }
  for (const link of links) {
    const a = find(link.a)
    const b = find(link.b)
    if (a !== b) parent.set(a, b)
  }
  const out: BoardEdge[] = []
  for (const branch of branches) {
    if (!ids.has(branch.id) || !ids.has(branch.parent) || branch.id === branch.parent) continue
    const a = find(branch.parent)
    const b = find(branch.id)
    if (a === b) continue
    parent.set(a, b)
    out.push({ id: boardItemId(), fromNode: branch.parent, toNode: branch.id })
  }
  return out
}

interface Body {
  unit: StructureUnit
  x: number
  y: number
  r: number
}

const centerOf = (b: Bounds) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
const clampStep = (v: number) => Math.max(-MAX_STEP, Math.min(MAX_STEP, v))

/** Органическая раскладка блоков: связи как пружины, рамки не наезжают друг на друга. */
export function layoutStructure(data: BoardData, units: StructureUnit[], extra: BoardEdge[] = []): BoardData {
  if (units.length < 2) return data
  const unitOf = structureUnitOf(units)

  const links = new Map<string, StructureLink>()
  for (const link of structureLinks(data, units)) links.set(pairKey(link.a, link.b), link)
  for (const edge of extra) {
    const a = unitOf.get(edge.fromNode) ?? edge.fromNode
    const b = unitOf.get(edge.toNode) ?? edge.toNode
    if (a === b || links.has(pairKey(a, b))) continue
    links.set(pairKey(a, b), { a, b, edge: { ...edge, fromNode: a, toNode: b } })
  }
  const graph = [...links.values()]

  const bodies: Body[] = units.map((unit) => ({
    unit,
    ...centerOf(unit.bounds),
    r: Math.hypot(unit.bounds.width, unit.bounds.height) / 2,
  }))
  const byId = new Map(bodies.map((body) => [body.unit.id, body]))
  const at = new Map(bodies.map((body, i) => [body.unit.id, i]))
  const springs = graph
    .map((link) => ({ a: byId.get(link.a), b: byId.get(link.b) }))
    .filter((link): link is { a: Body; b: Body } => !!link.a && !!link.b)

  const board = boardBounds(data.nodes)
  const center = board ? centerOf(board) : { x: 0, y: 0 }

  for (let step = 0; step < ITERATIONS; step++) {
    const alpha = 1 - step / ITERATIONS
    const fx = new Float64Array(bodies.length)
    const fy = new Float64Array(bodies.length)

    for (const { a, b } of springs) {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = Math.max(1, Math.hypot(dx, dy))
      const ideal = a.r + b.r + LINK_GAP
      const force = (dist - ideal) * 0.016 * alpha
      const ux = dx / dist
      const uy = dy / dist
      const ia = at.get(a.unit.id)!
      const ib = at.get(b.unit.id)!
      fx[ia] += ux * force
      fy[ia] += uy * force
      fx[ib] -= ux * force
      fy[ib] -= uy * force
    }

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]
        const b = bodies[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy)
        const min = a.r + b.r + LINK_GAP * 0.7
        if (dist >= min) continue
        const force = (min - dist) * 0.05 * alpha
        const ux = dist ? dx / dist : 1
        const uy = dist ? dy / dist : 0
        fx[i] += ux * force
        fy[i] += uy * force
        fx[j] -= ux * force
        fy[j] -= uy * force
      }
    }

    for (const [i, body] of bodies.entries()) {
      fx[i] += (center.x - body.x) * 0.0005 * alpha
      fy[i] += (center.y - body.y) * 0.0005 * alpha
      body.x += clampStep(fx[i])
      body.y += clampStep(fy[i])
    }

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]
        const b = bodies[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy)
        const min = a.r + b.r + UNIT_GAP
        if (dist >= min) continue
        const push = (min - dist) / 2
        const ux = dist ? dx / dist : 1
        const uy = dist ? dy / dist : 0
        a.x -= ux * push
        a.y -= uy * push
        b.x += ux * push
        b.y += uy * push
      }
    }
  }

  const delta = new Map<string, { x: number; y: number }>()
  // Доска обычно шире, чем выше: растягиваем центры блоков по горизонтали,
  // не трогая расстояния внутри рамок.
  const left = Math.min(...bodies.map((b) => b.x - b.unit.bounds.width / 2))
  const right = Math.max(...bodies.map((b) => b.x + b.unit.bounds.width / 2))
  const top = Math.min(...bodies.map((b) => b.y - b.unit.bounds.height / 2))
  const bottom = Math.max(...bodies.map((b) => b.y + b.unit.bounds.height / 2))
  if (right > left && bottom > top) {
    const ratio = (right - left) / (bottom - top)
    if (ratio < 1.5) {
      const k = Math.min(1.7, 1.5 / ratio)
      const cx = (left + right) / 2
      for (const body of bodies) body.x = cx + (body.x - cx) * k
    }
  }
  for (const body of bodies) {
    const was = centerOf(body.unit.bounds)
    delta.set(body.unit.id, { x: body.x - was.x, y: body.y - was.y })
  }

  let nodes = data.nodes.map((node) => {
    const unit = unitOf.get(node.id)
    const d = unit ? delta.get(unit) : undefined
    return d ? { ...node, x: node.x + d.x, y: node.y + d.y } : node
  })

  // Возвращаем весь граф на прежнее место, чтобы взгляд не потерялся.
  const was = boardBounds(data.nodes)
  const now = boardBounds(nodes)
  if (was && now) {
    const shiftX = was.x + was.width / 2 - (now.x + now.width / 2)
    const shiftY = was.y + was.height / 2 - (now.y + now.height / 2)
    nodes = nodes.map((node) => ({ ...node, x: Math.round(node.x + shiftX), y: Math.round(node.y + shiftY) }))
  }

  const internal = data.edges.filter((edge) => {
    const a = unitOf.get(edge.fromNode)
    const b = unitOf.get(edge.toNode)
    return !!a && a === b
  })
  const external: BoardEdge[] = graph.map(({ a, b, edge }) => ({
    id: edge.id,
    fromNode: a,
    toNode: b,
    fromEnd: edge.fromEnd,
    toEnd: edge.toEnd,
    color: edge.color,
    label: edge.label,
  }))

  return { ...data, nodes, edges: [...internal, ...external] }
}
