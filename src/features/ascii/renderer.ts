import type { AsciiRect } from "./photo"

export interface AsciiRenderOptions {
  rect: AsciiRect | null
  detail: number
  contrast: number
}

export interface AsciiMountOptions {
  local: boolean
  preview: boolean
  removeBackground: boolean
}

export interface AsciiRenderer {
  update(options: AsciiRenderOptions): void
  destroy(): void
}
