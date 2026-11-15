export interface BackdropColor {
  id: string
  name: string
  value: string
}

/** Готовые цвета фона: по одному на светлую и тёмную гамму, чтобы не подбирать вручную. */
export const BACKDROP_COLORS: BackdropColor[] = [
  { id: "paper", name: "Бумага", value: "#f3f2ed" },
  { id: "mist", name: "Туман", value: "#e6edf2" },
  { id: "sage", name: "Шалфей", value: "#e5eee4" },
  { id: "sand", name: "Песок", value: "#f4ead6" },
  { id: "blush", name: "Румянец", value: "#f7e8e7" },
  { id: "lilac", name: "Сирень", value: "#ece8f6" },
  { id: "sky", name: "Небо", value: "#dfeef7" },
  { id: "graphite", name: "Графит", value: "#26282b" },
  { id: "night", name: "Ночь", value: "#151922" },
  { id: "forest", name: "Хвоя", value: "#141d18" },
  { id: "cocoa", name: "Какао", value: "#221a16" },
]
