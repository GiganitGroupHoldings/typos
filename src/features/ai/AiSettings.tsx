import { isTauri } from "@tauri-apps/api/core"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { translate } from "@/app/i18n"
import { useUi } from "@/app/store"
import { Button } from "@/components/ui/Button"
import { errorText } from "@/lib/errors"
import { checkAiConnection } from "./client"
import { clearAiKey, loadAiKey, saveAiKey } from "./keyStore"
import { AI_PROVIDERS, isAiProvider, providerPreset } from "./providers"

const INPUT = "min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"

/** Настройки помощника: провайдер и адрес хранятся в настройках, ключ — отдельно и только на устройстве. */
export function AiSettings() {
  const provider = useUi((s) => s.aiProvider)
  const setProvider = useUi((s) => s.setAiProvider)
  const baseUrl = useUi((s) => s.aiBaseUrl)
  const setBaseUrl = useUi((s) => s.setAiBaseUrl)
  const model = useUi((s) => s.aiModel)
  const setModel = useUi((s) => s.setAiModel)

  const [draft, setDraft] = useState("")
  const [stored, setStored] = useState(false)
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null)
  const preset = providerPreset(provider)

  useEffect(() => {
    let alive = true
    loadAiKey()
      .then((key) => {
        if (alive) setStored(!!key)
      })
      .catch(() => {
        if (alive) setStored(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const choose = (value: string) => {
    if (!isAiProvider(value)) return
    const next = providerPreset(value)
    setProvider(value)
    if (next.baseUrl) setBaseUrl(next.baseUrl)
    if (next.model) setModel(next.model)
  }

  const save = async () => {
    const key = draft.trim()
    if (!key) return
    setBusy("save")
    try {
      await saveAiKey(key)
      setStored(true)
      setDraft("")
      toast.success(translate("Ключ сохранён"))
    } catch (e) {
      toast.error(translate("Не удалось сохранить ключ"), { description: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  const test = async () => {
    setBusy("test")
    try {
      const key = draft.trim() || (await loadAiKey().catch(() => null)) || ""
      await checkAiConnection({ baseUrl, model }, key)
      toast.success(translate("Подключение работает"))
    } catch (e) {
      toast.error(translate("Не удалось подключиться"), { description: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy("remove")
    try {
      await clearAiKey()
      setStored(false)
      setDraft("")
      toast.success(translate("Ключ удалён"))
    } catch (e) {
      toast.error(translate("Не удалось удалить ключ"), { description: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 font-medium">{translate("Подключение")}</legend>
      <p className="text-sm text-muted-foreground">
        {translate("Проверяет и редактирует текст, объясняет конспекты и собирает по ним доски.")}
      </p>
      <label className="grid gap-1 text-sm font-medium">
        {translate("Провайдер")}
        <select className={INPUT} value={provider} onChange={(event) => choose(event.currentTarget.value)}>
          {AI_PROVIDERS.map((item) => (
            <option key={item.id} value={item.id}>
              {translate(item.label)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">
        {translate("Базовый адрес")}
        <input
          className={INPUT}
          dir="ltr"
          inputMode="url"
          placeholder="https://api.openai.com/v1"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.currentTarget.value)}
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        {translate("Модель")}
        <input className={INPUT} dir="ltr" value={model} onChange={(event) => setModel(event.currentTarget.value)} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        {translate("Ключ API")}
        <input
          className={INPUT}
          dir="ltr"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={stored ? "••••••••" : ""}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {isTauri()
          ? translate("Ключ хранится в защищённом хранилище системы и не попадает в конспекты и синхронизацию.")
          : translate("Ключ сохранится в этом браузере. На общем компьютере лучше не сохранять.")}
      </p>
      {!preset.keyRequired && <p className="text-xs text-muted-foreground">{translate("Локальному серверу ключ обычно не нужен.")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!draft.trim() || busy !== null} onClick={save}>
          {translate("Сохранить ключ")}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={test}>
          {translate("Проверить подключение")}
        </Button>
        {stored && (
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={remove}>
            {translate("Удалить ключ")}
          </Button>
        )}
      </div>
    </fieldset>
  )
}
