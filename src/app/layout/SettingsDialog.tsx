import { isTauri } from "@tauri-apps/api/core"
import { Minus, Plus, Settings, X } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { translate, useLanguage } from "@/app/i18n"
import { useUi, type Backdrop } from "@/app/store"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { SidebarMenuButton } from "@/components/ui/Sidebar"
import { AiSettings } from "@/features/ai/AiSettings"
import { AsciiBackdropSettings } from "@/features/ascii/AsciiBackdropSettings"
import { useBackdropPresets } from "@/features/backdrop/presetStore"
import { BACKDROP_COLORS } from "@/lib/backdropPalette"
import { errorText } from "@/lib/errors"
import { dur, easeOut } from "@/lib/motion"
import { SUBJECT_COLORS } from "@/lib/subjectPalette"
import { cn } from "@/lib/utils"

const TABS = [
  { id: "appearance", label: "Оформление" },
  { id: "assistant", label: "Помощник" },
] as const
type TabId = (typeof TABS)[number]["id"]

const BACKDROPS = [
  { id: "nebula", label: "Туманность" },
  { id: "metal", label: "Металл" },
  { id: "ascii", label: "Аски" },
] as const

function backdropLabel(id: Backdrop): string {
  return BACKDROPS.find((item) => item.id === id)?.label ?? id
}

export function SettingsDialog() {
  useLanguage()
  const setLanguage = useUi((s) => s.setLanguage)
  const language = useUi((s) => s.language)
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const backdrop = useUi((s) => s.backdrop)
  const setBackdrop = useUi((s) => s.setBackdrop)
  const bgColor = useUi((s) => s.bgColor)
  const setBgColor = useUi((s) => s.setBgColor)
  const presets = useBackdropPresets((s) => s.presets)
  const savePreset = useBackdropPresets((s) => s.save)
  const applyPreset = useBackdropPresets((s) => s.apply)
  const removePreset = useBackdropPresets((s) => s.remove)
  const responsive = useUi((s) => s.responsiveAccent)
  const setResponsive = useUi((s) => s.setResponsiveAccent)
  const color = useUi((s) => s.fixedAccent)
  const setColor = useUi((s) => s.setFixedAccent)
  const zoom = useUi((s) => s.desktopZoom)
  const setZoom = useUi((s) => s.setDesktopZoom)

  const [tab, setTab] = useState<TabId>("appearance")
  const [open, setOpen] = useState(false)
  const [presetName, setPresetName] = useState("")
  const tabId = useId()

  useEffect(() => {
    if (open) void useBackdropPresets.getState().load()
  }, [open])

  const save = async () => {
    if (!presetName.trim()) return
    try {
      await savePreset(presetName)
      setPresetName("")
    } catch (error) {
      toast.error(translate("Не удалось сохранить пресет"), { description: errorText(error) })
    }
  }

  const apply = async (id: string) => {
    try {
      await applyPreset(id)
    } catch (error) {
      toast.error(translate("Не удалось применить пресет"), { description: errorText(error) })
    }
  }

  const remove = async (id: string) => {
    try {
      await removePreset(id)
    } catch (error) {
      toast.error(translate("Не удалось удалить пресет"), { description: errorText(error) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <SidebarMenuButton>
          <Settings />
          <span>{translate("Настройки")}</span>
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{translate("Настройки")}</DialogTitle>
        </DialogHeader>

        <div role="tablist" aria-label={translate("Настройки")} className="relative isolate flex rounded-full bg-foreground/5 p-1">
          <motion.span
            aria-hidden
            initial={false}
            animate={{ x: `${TABS.findIndex((item) => item.id === tab) * 100}%` }}
            transition={{ duration: dur.base, ease: easeOut }}
            style={{ width: "calc((100% - 8px) / 2)" }}
            className="liquid-active pointer-events-none absolute top-1 bottom-1 left-1 rounded-full will-change-transform"
          />
          {TABS.map((item, index) => (
            <motion.button
              key={item.id}
              type="button"
              role="tab"
              id={`${tabId}-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`${tabId}-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              whileTap={{ scale: 0.96 }}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % TABS.length
                    : event.key === "ArrowLeft"
                      ? (index + TABS.length - 1) % TABS.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? TABS.length - 1
                          : undefined
                if (next === undefined) return
                event.preventDefault()
                setTab(TABS[next].id)
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
              }}
              className={cn(
                "relative z-10 flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium outline-none transition-colors",
                tab === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {translate(item.label)}
            </motion.button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`${tabId}-panel-appearance`}
          aria-labelledby={`${tabId}-appearance`}
          style={{ display: tab === "appearance" ? undefined : "none" }}
          className="grid gap-5 sm:grid-cols-2 sm:items-start"
        >
          <fieldset className="grid min-w-0 gap-2">
            <legend className="mb-2 font-medium">{translate("Язык")}</legend>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["ru", "Русский"],
                  ["en", "English"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  lang={value}
                  variant={language === value ? "default" : "outline"}
                  aria-pressed={language === value}
                  onClick={() => setLanguage(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid min-w-0 gap-2">
            <legend className="mb-2 font-medium">{translate("Тема")}</legend>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["light", translate("Светлая")],
                  ["dark", translate("Тёмная")],
                  ["system", translate("Как в системе")],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={theme === value ? "default" : "outline"}
                  aria-pressed={theme === value}
                  onClick={() => setTheme(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid min-w-0 gap-2">
            <legend className="mb-2 font-medium">{translate("Фон")}</legend>
            <div className="flex flex-wrap gap-1">
              {BACKDROPS.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant={backdrop === item.id ? "default" : "outline"}
                  aria-pressed={backdrop === item.id}
                  onClick={() => setBackdrop(item.id)}
                >
                  {translate(item.label)}
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid min-w-0 gap-3">
            <legend className="mb-2 font-medium">{translate("Цвет фона")}</legend>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={translate("Цвета фона")}>
              <button
                type="button"
                aria-label={translate("По теме")}
                title={translate("По теме")}
                aria-pressed={bgColor === null}
                className={cn(
                  "size-6 rounded-full border border-foreground/20 outline-offset-2 focus-visible:outline-2",
                  bgColor === null && "outline-2 outline-foreground",
                )}
                style={{ background: "linear-gradient(135deg, #f3f2ed 50%, #191918 50%)" }}
                onClick={() => setBgColor(null)}
              />
              {BACKDROP_COLORS.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  aria-label={translate(swatch.name)}
                  title={translate(swatch.name)}
                  aria-pressed={bgColor === swatch.value}
                  className={cn(
                    "size-6 rounded-full border border-foreground/20 outline-offset-2 focus-visible:outline-2",
                    bgColor === swatch.value && "outline-2 outline-foreground",
                  )}
                  style={{ background: swatch.value }}
                  onClick={() => setBgColor(swatch.value)}
                />
              ))}
            </div>
            <label className="flex items-center justify-between gap-3">
              {translate("Свой цвет фона")}
              <input
                type="color"
                aria-label={translate("Свой цвет фона")}
                value={bgColor ?? "#f3f2ed"}
                onInput={(event) => setBgColor(event.currentTarget.value)}
                className="h-8 w-12 cursor-pointer"
              />
            </label>
          </fieldset>
          <fieldset className="grid min-w-0 gap-3 sm:col-span-2">
            <legend className="mb-2 font-medium">{translate("Пресеты фона")}</legend>
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => {
                  const active = preset.backdrop === backdrop && preset.bgColor === bgColor
                  return (
                    <span
                      key={preset.id}
                      className={cn(
                        "inline-flex items-center overflow-hidden rounded-full border",
                        active ? "border-foreground/40 bg-foreground/5" : "border-border",
                      )}
                    >
                      <button
                        type="button"
                        aria-pressed={active}
                        className="flex items-center gap-2 py-1.5 pr-2 pl-3 text-sm"
                        onClick={() => void apply(preset.id)}
                      >
                        <span
                          aria-hidden
                          className="size-3 rounded-full border border-foreground/20"
                          style={{ background: preset.bgColor ?? "linear-gradient(135deg, #f3f2ed 50%, #191918 50%)" }}
                        />
                        <span className="text-xs text-muted-foreground">{translate(backdropLabel(preset.backdrop))}</span>
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={translate("Удалить пресет")}
                        onClick={() => void remove(preset.id)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <input
                className="min-h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
                maxLength={40}
                aria-label={translate("Название пресета")}
                placeholder={translate("Название пресета")}
                value={presetName}
                onChange={(event) => setPresetName(event.currentTarget.value)}
              />
              <Button size="sm" type="submit" disabled={!presetName.trim()}>
                {translate("Сохранить фон")}
              </Button>
            </form>
          </fieldset>
          {backdrop === "ascii" && (
            <div className="min-w-0 sm:col-span-2">
              <AsciiBackdropSettings onClose={() => setOpen(false)} />
            </div>
          )}
          <fieldset className="grid min-w-0 gap-3 sm:col-span-2">
            <legend className="mb-2 font-medium">{translate("Акцентный цвет")}</legend>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={responsive} onChange={(event) => setResponsive(event.target.checked)} />
              {translate("Цвет по предмету")}
            </label>
            <div className="flex flex-wrap gap-2" role="group" aria-label={translate("Акцентные цвета")}>
              {SUBJECT_COLORS.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  disabled={responsive}
                  aria-label={translate(swatch.name)}
                  className="size-6 rounded-full border border-foreground/20 outline-offset-2 focus-visible:outline-2 disabled:opacity-35"
                  style={{ background: `var(--subject-${swatch.id})` }}
                  onClick={() => {
                    const probe = document.createElement("canvas").getContext("2d")
                    if (!probe) return
                    probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(`--subject-${swatch.id}`).trim()
                    probe.fillRect(0, 0, 1, 1)
                    const rgb = probe.getImageData(0, 0, 1, 1).data
                    setColor("#" + Array.from(rgb.slice(0, 3), (value) => value.toString(16).padStart(2, "0")).join(""))
                  }}
                />
              ))}
            </div>
            <label className="flex items-center justify-between gap-3">
              {translate("Свой цвет")}
              <input
                type="color"
                aria-label={translate("Свой цвет")}
                value={color}
                disabled={responsive}
                onInput={(event) => setColor(event.currentTarget.value)}
                className="h-8 w-12 cursor-pointer disabled:opacity-35"
              />
            </label>
          </fieldset>
          {isTauri() && (
            <fieldset className="grid min-w-0 gap-2 sm:col-span-2">
              <legend className="mb-2 font-medium">{translate("Масштаб интерфейса")}</legend>
              <div className="flex items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={translate("Уменьшить масштаб")}
                  disabled={zoom <= 50}
                  onClick={() => setZoom(zoom - 10)}
                >
                  <Minus />
                </Button>
                <output className="min-w-12 text-center tabular-nums" aria-live="polite">
                  {zoom}%
                </output>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={translate("Увеличить масштаб")}
                  disabled={zoom >= 200}
                  onClick={() => setZoom(zoom + 10)}
                >
                  <Plus />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setZoom(100)}>
                  {translate("Сбросить")}
                </Button>
              </div>
            </fieldset>
          )}
        </div>

        <div
          role="tabpanel"
          id={`${tabId}-panel-assistant`}
          aria-labelledby={`${tabId}-assistant`}
          style={{ display: tab === "assistant" ? undefined : "none" }}
          className="grid gap-4"
        >
          <AiSettings />
        </div>
      </DialogContent>
    </Dialog>
  )
}
