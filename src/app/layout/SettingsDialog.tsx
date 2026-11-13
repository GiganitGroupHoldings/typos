import { isTauri } from "@tauri-apps/api/core"
import { Minus, Plus, Settings } from "lucide-react"
import { translate, useLanguage } from "@/app/i18n"
import { useUi } from "@/app/store"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { SidebarMenuButton } from "@/components/ui/Sidebar"
import { SUBJECT_COLORS } from "@/lib/subjectPalette"

export function SettingsDialog() {
  const language = useLanguage()
  const setLanguage = useUi((s) => s.setLanguage)
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const backdrop = useUi((s) => s.backdrop)
  const setBackdrop = useUi((s) => s.setBackdrop)
  const responsive = useUi((s) => s.responsiveAccent)
  const setResponsive = useUi((s) => s.setResponsiveAccent)
  const color = useUi((s) => s.fixedAccent)
  const setColor = useUi((s) => s.setFixedAccent)
  const zoom = useUi((s) => s.desktopZoom)
  const setZoom = useUi((s) => s.setDesktopZoom)
  return (
    <Dialog>
      <DialogTrigger asChild>
        <SidebarMenuButton>
          <Settings />
          <span>{translate("Настройки")}</span>
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{translate("Настройки")}</DialogTitle>
        </DialogHeader>
        <label className="flex flex-wrap items-center justify-between gap-2 font-medium">
          {translate("Язык")}
          <select
            className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm"
            value={language}
            onChange={(event) => setLanguage(event.currentTarget.value === "en" ? "en" : "ru")}
          >
            <option value="ru" lang="ru">
              Русский
            </option>
            <option value="en" lang="en">
              English
            </option>
          </select>
        </label>
        <fieldset className="grid gap-2">
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
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-medium">{translate("Фон")}</legend>
          <div className="flex gap-1">
            {(
              [
                ["nebula", translate("Туманность")],
                ["metal", translate("Металл")],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={backdrop === value ? "default" : "outline"}
                aria-pressed={backdrop === value}
                onClick={() => setBackdrop(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-3">
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
          <fieldset className="grid gap-2">
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
      </DialogContent>
    </Dialog>
  )
}
