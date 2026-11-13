import { getLanguage, translate } from "@/app/i18n"

export type TemplateId = "blank" | "lecture" | "seminar"

const today = () => new Intl.DateTimeFormat(getLanguage(), { day: "numeric", month: "long" }).format(new Date())

export const templates: { id: TemplateId; label: string; hint: string; body: () => string }[] = [
  { id: "blank", label: "Пустой", hint: "Чистый лист", body: () => "" },
  {
    id: "lecture",
    label: "Лекция",
    hint: "Тема, конспект, вопросы",
    body: () => translate("# Лекция {0}\n\n**Тема:** \n\n## Конспект\n\n\n\n## Непонятно / спросить\n\n- [ ] \n", today()),
  },
  {
    id: "seminar",
    label: "Семинар",
    hint: "Задачи и разбор",
    body: () => translate("# Семинар {0}\n\n## Задача 1\n\n**Условие:** \n\n**Решение:** \n\n## Домашка\n\n- [ ] \n", today()),
  },
]
