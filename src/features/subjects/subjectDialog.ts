import { create } from "zustand"

export const useSubjectDialog = create<{
  open: boolean
  editId?: string
  parentId?: string
  set: (open: boolean, editId?: string, parentId?: string) => void
}>((set) => ({
  open: false,
  set: (open, editId, parentId) => set({ open, editId, parentId }),
}))

export const openNewSubject = () => useSubjectDialog.getState().set(true)
export const openEditSubject = (id: string) => useSubjectDialog.getState().set(true, id)
export const openNewSubfolder = (id: string) => useSubjectDialog.getState().set(true, undefined, id)
