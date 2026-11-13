export interface SlideSize {
  width: number
  height: number
}

export interface SlideBox {
  left: number
  top: number
  scale: number
}

export interface PresentationLayout {
  main: SlideBox
  next: SlideBox
  nextVisible: boolean
  thumbWidth: number
  thumbHeight: number
}

const PADDING = 20
const GAP = 16
const MIN_THUMB = 24
const MAX_THUMB = 240

const size = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0)

/**
 * Раскладка одного слайда и его превью: основной слайд вписан в сцену,
 * превью прижато к правому нижнему углу, место под него не зависит от наличия
 * следующего слайда, чтобы картинка не прыгала на последнем слайде.
 */
export function presentationLayout(stage: SlideSize, slide: SlideSize, hasNext: boolean): PresentationLayout {
  const stageWidth = Math.max(1, size(stage.width))
  const stageHeight = Math.max(1, size(stage.height))
  const slideWidth = Math.max(1, size(slide.width))
  const slideHeight = Math.max(1, size(slide.height))
  const ratio = slideHeight / slideWidth

  const byWidth = stageWidth * 0.18
  const byHeight = (stageHeight * 0.3) / ratio
  const thumbWidth = Math.round(Math.max(MIN_THUMB, Math.min(MAX_THUMB, byWidth, byHeight)))
  const thumbHeight = Math.round(thumbWidth * ratio)
  const reserve = stageWidth >= 760 ? thumbWidth + GAP : 0

  const availableWidth = Math.max(1, stageWidth - PADDING * 2 - reserve)
  const availableHeight = Math.max(1, stageHeight - PADDING * 2)
  const scale = Math.min(availableWidth / slideWidth, availableHeight / slideHeight)
  const scaledWidth = slideWidth * scale
  const scaledHeight = slideHeight * scale

  return {
    main: {
      left: PADDING + (availableWidth - scaledWidth) / 2,
      top: PADDING + (availableHeight - scaledHeight) / 2,
      scale,
    },
    next: {
      left: Math.max(0, stageWidth - PADDING - thumbWidth),
      top: Math.max(0, stageHeight - PADDING - thumbHeight),
      scale: thumbWidth / slideWidth,
    },
    nextVisible: hasNext,
    thumbWidth,
    thumbHeight,
  }
}
