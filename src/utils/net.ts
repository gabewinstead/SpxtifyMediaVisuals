type Options = {
  /** Cancels the request when aborted (for example because the song changed). */
  signal?: AbortSignal
  /** Hard limit for the whole request including reading the body. */
  timeoutMs?: number
}

/**
 * Fetches JSON with a timeout. Resolves to undefined on any failure (offline, non-2xx, bad JSON,
 * timeout, cancel) instead of throwing, so a caller can never be left waiting on a stalled request.
 */
export async function getJson<T>(url: string, { signal, timeoutMs = 8000 }: Options = {}): Promise<T | undefined> {
  if (signal?.aborted) return undefined
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const cancel = () => controller.abort()
  signal?.addEventListener('abort', cancel)
  try {
    const response = await fetch(url, { signal: controller.signal })
    return response.ok ? ((await response.json()) as T) : undefined
  } catch {
    return undefined
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
