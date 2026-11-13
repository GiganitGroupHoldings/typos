import { translate } from "@/app/i18n"

export const errorText = (error: unknown): string => translate(error instanceof Error ? error.message : String(error))
