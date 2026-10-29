/** Reads JSON from localStorage, returning the fallback if it is missing, corrupt or storage is unavailable. */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Writes JSON to localStorage. Failures (quota, private mode) are ignored; the app keeps working in memory. */
export function saveJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing useful to do; the in-memory copy is still correct.
  }
}
