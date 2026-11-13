import { useEffect, useState } from "react"
import { errorText } from "@/lib/errors"
import { readProjectBlob } from "./projectFiles"

export type ProjectFile = { blob: Blob; url: string } | { error: string } | null

export function useProjectFile(path: string, ext: string): ProjectFile {
  const [file, setFile] = useState<ProjectFile>(null)
  useEffect(() => {
    let alive = true
    let url = ""
    readProjectBlob(path, ext).then(
      (blob) => {
        if (!alive) return
        url = URL.createObjectURL(blob)
        setFile({ blob, url })
      },
      (err) => alive && setFile({ error: errorText(err) }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [path, ext])
  return file
}
