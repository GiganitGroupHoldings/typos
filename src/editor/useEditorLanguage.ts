import type { Editor } from "@tiptap/core"
import { useEffect } from "react"
import { translate, useLanguage } from "@/app/i18n"

export function useEditorLanguage(editor: Editor | null, spellcheck = false) {
  const language = useLanguage()
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: { "aria-label": translate("Текст конспекта"), lang: language, ...(spellcheck && { spellcheck: "true" }) },
      },
    })
  }, [editor, language, spellcheck])
}
