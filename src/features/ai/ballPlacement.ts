export const AI_BALL_SIZE = 56
export const AI_BALL_MARGIN = 8
export const AI_PANEL_WIDTH = 352
export const AI_PANEL_MAX_HEIGHT = 512

export interface Point {
  x: number
  y: number
}

export interface Viewport {
  width: number
  height: number
}

export interface PanelPlacement {
  /** Левый край панели; при нехватке места прижимается к границе окна. */
  left: number
  top: number | null
  bottom: number | null
  width: number
  maxHeight: number
  side: "left" | "right"
  vertical: "up" | "down"
}

export function clampBall(position: Point, viewport: Viewport): Point {
  const maxX = Math.max(AI_BALL_MARGIN, viewport.width - AI_BALL_SIZE - AI_BALL_MARGIN)
  const maxY = Math.max(AI_BALL_MARGIN, viewport.height - AI_BALL_SIZE - AI_BALL_MARGIN)
  return {
    x: Math.min(Math.max(position.x, AI_BALL_MARGIN), maxX),
    y: Math.min(Math.max(position.y, AI_BALL_MARGIN), maxY),
  }
}

/** Панель растёт от шарика в свободную сторону и не вылезает за окно. */
export function placePanel(position: Point, viewport: Viewport): PanelPlacement {
  const width = Math.min(AI_PANEL_WIDTH, viewport.width - AI_BALL_MARGIN * 2)
  const side = position.x + AI_BALL_SIZE / 2 > viewport.width / 2 ? "left" : "right"
  const vertical = position.y + AI_BALL_SIZE / 2 > viewport.height / 2 ? "up" : "down"
  const desired = side === "left" ? position.x + AI_BALL_SIZE - width : position.x
  const maxLeft = Math.max(AI_BALL_MARGIN, viewport.width - width - AI_BALL_MARGIN)
  const available = vertical === "up" ? position.y + AI_BALL_SIZE - AI_BALL_MARGIN : viewport.height - position.y - AI_BALL_MARGIN
  return {
    left: Math.min(Math.max(desired, AI_BALL_MARGIN), maxLeft),
    top: vertical === "down" ? position.y : null,
    bottom: vertical === "up" ? viewport.height - (position.y + AI_BALL_SIZE) : null,
    width,
    maxHeight: Math.max(120, Math.min(viewport.height * 0.6, AI_PANEL_MAX_HEIGHT, available)),
    side,
    vertical,
  }
}
