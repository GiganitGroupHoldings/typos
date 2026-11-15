import { useEffect, useMemo, useState } from "react"
import { translate } from "@/app/i18n"
import type { AsciiSource } from "./backdropStore"
import { parseAsciiArt, type AsciiArt } from "./format"
import type { GifPlayback } from "./gif"
import { loadBitmap } from "./photo"

export type BackdropMedia =
  | { kind: "photo"; image: ImageBitmap | HTMLImageElement; aspect: number }
  | { kind: "video"; video: HTMLVideoElement; aspect: number }
  | { kind: "gif"; gif: GifPlayback; aspect: number; onError: () => void }
  | { kind: "text"; art: AsciiArt; aspect: number }

interface Resource {
  source: AsciiSource
  media: BackdropMedia | null
  error?: string
}

export function useBackdropMedia(source: AsciiSource | null) {
  const [resource, setResource] = useState<Resource | null>(null)
  const textResource = useMemo<Resource | null>(() => {
    if (source?.kind !== "text") return null
    const parsed = parseAsciiArt(source.text)
    if (!parsed.ok) return { source, media: null, error: parsed.error }
    const art = parsed.art
    return { source, media: { kind: "text", art, aspect: (art.cols * 0.6) / (art.rows * 1.16) } }
  }, [source])

  useEffect(() => {
    if (!source || source.kind === "text") return
    let disposed = false
    const fail = (error: string) => {
      if (!disposed) setResource({ source, media: null, error })
    }
    if (source.kind === "gif") {
      const onError = () => fail(translate("Не удалось открыть GIF. Выбери другой файл."))
      void import("./gif")
        .then(({ loadGif }) => loadGif(source.blob))
        .then((gif) => {
          if (!disposed) setResource({ source, media: { kind: "gif", gif, aspect: gif.image.width / gif.image.height, onError } })
        })
        .catch(onError)
      return () => {
        disposed = true
      }
    }
    if (source.kind === "photo") {
      let bitmap: ImageBitmap | undefined
      void loadBitmap(source.blob)
        .then((image) => {
          if ("close" in image) bitmap = image
          if (disposed) bitmap?.close()
          else setResource({ source, media: { kind: "photo", image, aspect: image.width / image.height } })
        })
        .catch(() => fail(translate("Не удалось открыть фото. Выбери другой файл.")))
      return () => {
        disposed = true
        bitmap?.close()
      }
    }

    const video = document.createElement("video")
    const url = URL.createObjectURL(source.blob)
    video.muted = true
    video.defaultMuted = true
    video.loop = true
    video.playsInline = true
    video.preload = "auto"
    const error = () => fail(translate("Не удалось открыть видео. Попробуй MP4 или WebM."))
    const ready = () => {
      if (!video.videoWidth || !video.videoHeight) {
        error()
        return
      }
      setResource({ source, media: { kind: "video", video, aspect: video.videoWidth / video.videoHeight } })
    }
    video.addEventListener("loadeddata", ready, { once: true })
    video.addEventListener("error", error)
    video.src = url
    return () => {
      disposed = true
      video.removeEventListener("loadeddata", ready)
      video.removeEventListener("error", error)
      video.pause()
      video.removeAttribute("src")
      video.load()
      URL.revokeObjectURL(url)
    }
  }, [source])

  return textResource ?? (resource?.source === source ? resource : null)
}
