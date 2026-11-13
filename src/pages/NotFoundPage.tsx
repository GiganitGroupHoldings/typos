import { Link } from "react-router"
import { translate, useLanguage } from "@/app/i18n"

export function NotFoundPage() {
  useLanguage()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-[17px] font-semibold">{translate("Такой страницы нет")}</p>
      <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
        {translate("На главную")}
      </Link>
    </div>
  )
}
