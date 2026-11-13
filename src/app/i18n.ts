import { useUi } from "@/app/store"
import { en } from "./en"

export type Language = "ru" | "en"

export const getLanguage = (): Language => useUi.getState().language

export const useLanguage = (): Language => useUi((state) => state.language)

export function translate(message: string, ...values: unknown[]): string {
  const text = getLanguage() === "en" && Object.hasOwn(en, message) ? en[message] : message
  return values.length
    ? text.replace(/\{(\d+)\}/g, (match, index: string) => (Number(index) < values.length ? String(values[Number(index)]) : match))
    : text
}
