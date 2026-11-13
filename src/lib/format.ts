import { getLanguage, translate } from "@/app/i18n"

const relativeFormats = {
  ru: new Intl.RelativeTimeFormat("ru", { numeric: "auto" }),
  en: new Intl.RelativeTimeFormat("en", { numeric: "auto" }),
}
const dateFormats = {
  ru: new Intl.DateTimeFormat("ru", { day: "numeric", month: "long" }),
  en: new Intl.DateTimeFormat("en", { day: "numeric", month: "long" }),
}

export function relativeTime(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return translate("только что")
  const language = getLanguage()
  const rtf = relativeFormats[language]
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute")
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour")
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), "day")
  return dateFormats[language].format(new Date(iso))
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return translate("{0} Б", bytes)
  const [v, unit] =
    bytes < 1024 ** 2
      ? [bytes / 1024, translate("КБ")]
      : bytes < 1024 ** 3
        ? [bytes / 1024 ** 2, translate("МБ")]
        : [bytes / 1024 ** 3, translate("ГБ")]
  return `${v.toLocaleString(getLanguage(), { maximumFractionDigits: v < 10 ? 1 : 0 })} ${unit}`
}

export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const language = getLanguage()
  if (language === "en") return `${n.toLocaleString(language)} ${translate(n === 1 ? one : many)}`
  const m10 = n % 10,
    m100 = n % 100
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`
  return `${n} ${many}`
}

export const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return translate("Доброй ночи")
  if (h < 12) return translate("Доброе утро")
  if (h < 18) return translate("Добрый день")
  return translate("Добрый вечер")
}
