import { ChevronRight, FileText, FolderOpen, LayoutDashboard, Pin } from "lucide-react"
import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import { useState } from "react"
import { Link, useLocation, useParams, useSearchParams } from "react-router"
import { translate, useLanguage } from "@/app/i18n"
import { SidebarMenu, SidebarMenuButton } from "@/components/ui/Sidebar"
import { dur, easeOut, spring } from "@/lib/motion"
import { cn } from "@/lib/utils"
import type { Subject, SubjectTab } from "@/types"
import { useBoardsOf, useNotesOf, usePinsOf, useSubjects, useToolsOf } from "@/vault/hooks"
import { tabOfPath } from "./tabs"
import { SubjectBadge } from "./visuals"

const ROW = 44

function TraceLine({ index, last }: { index: number; last: boolean }) {
  const mid = ROW / 2
  const d = last ? `M7 0 V${mid - 5} Q7 ${mid} 12 ${mid} H17` : `M7 0 V${ROW} M7 ${mid} H17`
  return (
    <svg aria-hidden width="18" height={ROW} viewBox={`0 0 18 ${ROW}`} className="absolute top-0 left-3 text-sidebar-foreground/35">
      <motion.path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: dur.slow, ease: easeOut, delay: index * 0.05 }}
      />
    </svg>
  )
}

const sections: { tab: SubjectTab; label: string; icon: typeof FileText }[] = [
  { tab: "notes", label: "Конспекты", icon: FileText },
  { tab: "pins", label: "Закреп", icon: Pin },
  { tab: "tools", label: "Проекты", icon: FolderOpen },
  { tab: "boards", label: "Доски", icon: LayoutDashboard },
]

function SubjectNode({ subject }: { subject: Subject }) {
  useLanguage()
  const { subjectId } = useParams()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const active = subjectId === subject.id
  const [open, setOpen] = useState(active)
  const counts: Record<SubjectTab, number> = {
    notes: useNotesOf(subject.id).length,
    pins: usePinsOf(subject.id).length,
    tools: useToolsOf(subject.id).length,
    boards: useBoardsOf(subject.id).length,
  }
  const currentTab: SubjectTab = (params.get("tab") as SubjectTab) ?? tabOfPath(pathname)

  return (
    <motion.li layout="position" transition={spring} className="relative list-none">
      <div className="group/row flex items-center">
        <SidebarMenuButton asChild isActive={active && pathname === `/s/${subject.id}`} className="pr-12">
          <Link to={`/s/${subject.id}`} onClick={() => setOpen(true)}>
            <SubjectBadge subject={subject} size="sm" />
            <span className="font-medium">{subject.name}</span>
          </Link>
        </SidebarMenuButton>
        <button
          type="button"
          aria-label={open ? translate("Свернуть «{0}»", subject.name) : translate("Развернуть «{0}»", subject.name)}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
        >
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={spring} className="flex">
            <ChevronRight className="size-5" />
          </motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            key="children"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: dur.base, ease: easeOut } }}
            exit={{ opacity: 0, transition: { duration: dur.base * 0.65 } }}
            className="relative"
          >
            {sections.map((s, i) => {
              const isCurrent = active && currentTab === s.tab && !pathname.endsWith(subject.id)
              const Icon = s.icon
              return (
                <li key={s.tab} className="relative" style={{ height: ROW }}>
                  <TraceLine index={i} last={i === sections.length - 1} />
                  <Link
                    to={`/s/${subject.id}?tab=${s.tab}`}
                    data-active={isCurrent || undefined}
                    className={cn(
                      "ml-8 flex h-full items-center gap-2.5 rounded-lg px-2 text-[15px] text-sidebar-foreground outline-none",
                      "hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      "data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-foreground",
                    )}
                  >
                    <Icon className="size-[18px] shrink-0 opacity-70" />
                    <span className="flex-1 truncate">{translate(s.label)}</span>
                    <span className="shrink-0 text-[13px] text-sidebar-foreground tabular-nums">{counts[s.tab]}</span>
                  </Link>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

export function SubjectTree() {
  const subjects = useSubjects()
  return (
    <LayoutGroup>
      <SidebarMenu className="gap-0.5">
        {subjects.map((s) => (
          <SubjectNode key={s.id} subject={s} />
        ))}
      </SidebarMenu>
    </LayoutGroup>
  )
}
