import { invoke, isTauri } from "@tauri-apps/api/core"

const STORAGE_KEY = "typos-ai-key"

/** Ключ хранится отдельно от настроек: на компьютере — в системном хранилище, в браузере — локально. */
export async function loadAiKey(): Promise<string | null> {
  if (isTauri()) return invoke<string | null>("ai_key_get")
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export async function saveAiKey(key: string): Promise<void> {
  const value = key.trim()
  if (isTauri()) {
    await invoke("ai_key_set", { key: value })
    return
  }
  localStorage.setItem(STORAGE_KEY, value)
}

export async function clearAiKey(): Promise<void> {
  if (isTauri()) {
    await invoke("ai_key_delete")
    return
  }
  localStorage.removeItem(STORAGE_KEY)
}
