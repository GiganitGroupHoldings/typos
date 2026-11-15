import { BackdropCanvas } from "@/features/ascii/BackdropCanvas"
import { backdropPosition } from "@/features/ascii/backdropLayout"
import { useBackdropMedia } from "@/features/ascii/backdropMedia"
import { useAsciiBackdrop, type AsciiBackground } from "@/features/ascii/backdropStore"
import { DEFAULT_CONTRAST } from "@/features/ascii/photo"

function BackdropItem({ item }: { item: AsciiBackground }) {
  const resource = useBackdropMedia(item.source)
  return (
    <div className="absolute overflow-hidden" style={backdropPosition(item.rect)}>
      <BackdropCanvas
        media={resource?.media ?? null}
        rect={null}
        local
        detail={item.detail}
        contrast={item.contrastEnabled ? item.contrast : DEFAULT_CONTRAST}
        removeBackground={item.removeBackground}
      />
    </div>
  )
}

export default function AsciiBackdrop() {
  const items = useAsciiBackdrop((s) => s.items)
  return (
    <div className="absolute inset-0">
      {items.map((item) => (
        <BackdropItem key={item.id} item={item} />
      ))}
    </div>
  )
}
