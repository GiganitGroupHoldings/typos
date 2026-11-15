import { EditorContent, useEditor } from "@tiptap/react"
import { useMemo, type CSSProperties } from "react"
import { useUi } from "@/app/store"
import { buildExtensions } from "@/editor/extensions"
import { normalizeMarkdownMath } from "@/editor/texImport"
import { useEditorLanguage } from "@/editor/useEditorLanguage"
import { noteScale } from "@/lib/noteSize"
import { dirname, joinPath } from "@/storage/VaultAdapter"
import type { Note } from "@/types"
import { vaultFileUrl } from "@/vault/store"

/** Конспект в режиме чтения — без тулбара, ручек и редактирования. */
export function NoteReader({ note }: { note: Note }) {
  const font = useUi((s) => s.noteFont)
  const size = useUi((s) => s.noteSize)
  const extensions = useMemo(
    () =>
      buildExtensions({
        resolveImage: (src) => vaultFileUrl(joinPath(dirname(note.path), src)),
        diagrams: true,
        ascii: true,
      }),
    [note.path],
  )

  const editor = useEditor(
    {
      extensions,
      editable: false,
      content: normalizeMarkdownMath(note.body),
      contentType: "markdown",
    },
    [note.id],
  )
  useEditorLanguage(editor)

  return (
    <div className="note-prose note-reading" data-font={font} style={{ "--note-scale": noteScale(size) } as CSSProperties}>
      <EditorContent editor={editor} />
    </div>
  )
}
