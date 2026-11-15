import { lazy, Suspense, useEffect } from "react"
import { useUi } from "@/app/store"
import { BackdropEditor } from "@/features/ascii/BackdropEditor"
import { useAsciiBackdrop, useBackdropEditor } from "@/features/ascii/backdropStore"

const Shader = lazy(() => import("@/components/ui/InteractiveNebulaShader"))
const Ascii = lazy(() => import("@/components/ui/AsciiBackdrop"))

export function Nebula({ avoidText = false }: { avoidText?: boolean }) {
  const backdrop = useUi((s) => s.backdrop)
  const editing = useBackdropEditor((s) => s.draft !== null)
  useEffect(() => {
    void useAsciiBackdrop.getState().load()
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        {!editing && (backdrop === "ascii" ? <Ascii /> : <Shader avoidText={avoidText} variant={backdrop} />)}
      </Suspense>
      <BackdropEditor />
    </>
  )
}
