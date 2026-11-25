import { ChevronRight } from "lucide-react"
import { motion } from "motion/react"
import { useState, type ReactNode } from "react"
import { translate } from "@/app/i18n"
import { listItem } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { Note } from "@/types"
import { NoteRowMenu } from "./NoteRowMenu"
import { noteBranches } from "./subnotes"

interface RowProps {
  parents: Map<string, Note[]>
  activeId?: string
  renderRow: (note: Note) => ReactNode
}

function Branch({ note, parents, activeId, renderRow }: RowProps & { note: Note }) {
  const children = parents.get(note.id)
  const [closedAt, setClosedAt] = useState<{ activeId?: string }>()
  const open = !closedAt || closedAt.activeId !== activeId
  return (
    <motion.li variants={listItem}>
      <NoteRowMenu note={note} active={activeId === note.id}>
        {children && (
          <button
            type="button"
            aria-expanded={open}
            aria-label={translate(open ? "Свернуть «{0}»" : "Развернуть «{0}»", note.title || translate("Без названия"))}
            onClick={() => setClosedAt(open ? { activeId } : undefined)}
            className="ml-1 grid h-9 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className={cn("size-4 transition-transform duration-250 motion-reduce:transition-none", open && "rotate-90")} />
          </button>
        )}
        {renderRow(note)}
      </NoteRowMenu>
      {children && (
        <div inert={!open} data-open={open} className="note-branch">
          <div className="min-h-0 overflow-hidden">
            <ul className="ml-4 space-y-0.5 border-l border-border/70 px-2">
              {children.map((child) => (
                <Branch key={child.id} note={child} parents={parents} activeId={activeId} renderRow={renderRow} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </motion.li>
  )
}

export function NoteTree({ notes, activeId, renderRow }: Omit<RowProps, "parents"> & { notes: Note[] }) {
  const { roots, parents } = noteBranches(notes)
  return roots.map((note) => <Branch key={note.id} note={note} parents={parents} activeId={activeId} renderRow={renderRow} />)
}
