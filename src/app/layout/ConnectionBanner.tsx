import { KeyRound, WifiOff } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { translate, useLanguage } from "@/app/i18n"
import { Button } from "@/components/ui/Button"
import { plural } from "@/lib/format"
import { useConnection } from "@/storage/connection"
import { useSync } from "@/storage/sync"
import { useVault } from "@/vault/store"

function useSecondsUntil(at?: number) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (!at) return
    const update = () => setLeft(Math.max(0, Math.ceil((at - Date.now()) / 1000)))
    const first = setTimeout(update, 0)
    const t = setInterval(update, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [at])
  return at ? left : 0
}

export function ConnectionBanner() {
  useLanguage()
  const status = useConnection((s) => s.status)
  const retryAt = useConnection((s) => s.retryAt)
  const retry = useConnection((s) => s.retry)
  const label = useVault((s) => s.adapter?.label)
  const pending = useSync((s) => s.pending)
  const seconds = useSecondsUntil(status === "offline" ? retryAt : undefined)
  if (status !== "offline" && status !== "revoked") return null

  return (
    <div
      role="status"
      className="glass absolute top-14 left-1/2 z-30 flex w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-destructive/30 px-4 py-2.5 shadow-float"
    >
      {status === "offline" ? (
        <WifiOff className="size-4 shrink-0 text-destructive" />
      ) : (
        <KeyRound className="size-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="font-semibold">
          {status === "offline" ? translate("Нет связи с сервером «{0}»", label) : translate("Сервер «{0}»: ключ недействителен", label)}
        </p>
        <p className="text-muted-foreground">
          {status === "offline"
            ? translate(
                "Изменения сохранены на устройстве.{0}{1}",
                pending ? translate(" Ожидают отправки: {0}.", plural(pending, ["файл", "файла", "файлов"])) : "",
                seconds ? translate(" Повтор через {0} с.", seconds) : translate(" Подключение…"),
              )
            : translate("Изменения сохранены на устройстве. Подключись по новой ссылке.")}
        </p>
      </div>
      {status === "offline" ? (
        <Button size="sm" variant="outline" onClick={retry}>
          {translate("Повторить")}
        </Button>
      ) : (
        <Button size="sm" variant="outline" asChild>
          <Link to="/welcome">{translate("Подключить")}</Link>
        </Button>
      )}
    </div>
  )
}
