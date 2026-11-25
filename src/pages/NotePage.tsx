import { motion } from "motion/react"
import { Link, Navigate, useParams, useSearchParams } from "react-router"
import { translate } from "@/app/i18n"
import { NoteEditor } from "@/editor/NoteEditor"
import { noteHref } from "@/features/notes/subnotes"
import { pageEnter } from "@/lib/motion"
import { useNote, useSubject } from "@/vault/hooks"

export function NotePage() {
  const { subjectId, noteId } = useParams()
  const [params] = useSearchParams()
  const note = useNote(noteId)
  const parent = useNote(note?.meta.parentNoteId)
  const subject = useSubject(subjectId)
  if (!subject) return <Navigate to="/" replace />
  if (!note || note.subjectId !== subject.id) return <Navigate to={`/s/${subject.id}`} replace />

  return (
    <motion.div {...pageEnter} key={note.id} className="min-h-full">
      {parent && parent.id !== note.id && parent.subjectId === subject.id && (
        <Link
          to={noteHref(parent)}
          className="ml-4 mt-4 inline-block max-w-[calc(100%-2rem)] truncate rounded px-1 text-sm text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← {parent.title || translate("Без названия")}
        </Link>
      )}
      <NoteEditor
        key={note.id}
        note={note}
        autoFocus={params.has("new")}
        sourceBlock={params.get("block")}
        sourceQuote={params.get("quote")}
      />
    </motion.div>
  )
}
