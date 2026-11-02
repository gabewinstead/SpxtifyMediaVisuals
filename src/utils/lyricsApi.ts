import { getJson } from './net'
import { loadJson, saveJson } from './storage'
import { cleanTitle, primaryArtist } from './trackText'

export type LyricsQuery = { artist: string; title: string; album?: string; duration?: number }

type LrclibResult = {
  duration?: number | null
  instrumental?: boolean
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

type Found = { text: string; synced: boolean }

const LRCLIB = 'https://lrclib.net/api'
const CACHE_KEY = 'lyrics.cache'
const CACHE_LIMIT = 150

const hasTimestamps = (text: string) => /\[\d{1,3}:\d{2}/.test(text)

// ---------------------------------------------------------------------------
// Cache: in memory for the session; synced lyrics are also kept across launches (oldest dropped first)
// ---------------------------------------------------------------------------

function loadCache(): Map<string, string> {
  const stored = loadJson<unknown>(CACHE_KEY, [])
  const entries = Array.isArray(stored)
    ? stored.filter((entry): entry is [string, string] => Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string')
    : []
  return new Map(entries)
}

const cache = loadCache()

function remember(key: string, lyrics: string): void {
  cache.delete(key)
  cache.set(key, lyrics)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value as string | undefined
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  // Plain lyrics stay in memory only, so a better synced version can still be found next time
  if (hasTimestamps(lyrics)) saveJson(CACHE_KEY, [...cache].filter(([, value]) => hasTimestamps(value)))
}

const cacheKey = ({ artist, title }: LyricsQuery) => `${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}`

// ---------------------------------------------------------------------------
// Picking the right version
// ---------------------------------------------------------------------------

/**
 * Chooses the best result. Synced beats plain, and among synced versions the one whose length is closest
 * to the playing track wins, because a live or extended version has the wrong timings.
 */
function pickBest(results: LrclibResult[], duration: number): Found | undefined {
  const usable = results.filter((result) => !result.instrumental)
  const synced = usable.filter((result) => result.syncedLyrics?.trim())
  const plain = usable.filter((result) => result.plainLyrics?.trim())
  const pool = synced.length > 0 ? synced : plain
  if (pool.length === 0) return undefined

  const gap = (result: LrclibResult) => Math.abs((result.duration ?? 1e6) - duration)
  const best = duration > 0 ? [...pool].sort((a, b) => gap(a) - gap(b))[0] : pool[0]
  return synced.length > 0
    ? { text: best.syncedLyrics ?? '', synced: true }
    : { text: best.plainLyrics ?? '', synced: false }
}

async function lookup(query: LyricsQuery, signal?: AbortSignal): Promise<string> {
  const { artist, title, album = '' } = query
  const duration = query.duration && query.duration > 0 ? query.duration : 0
  let plainFallback = ''

  /** Returns synced lyrics immediately; remembers plain ones in case nothing better turns up. */
  const consider = (results: LrclibResult[]): string | undefined => {
    const found = pickBest(results, duration)
    if (!found) return undefined
    if (found.synced) return found.text
    plainFallback ||= found.text
    return undefined
  }

  // 1. Exact match: the most precise when the album and length are known
  if (album && duration > 0) {
    const params = new URLSearchParams({ track_name: title, artist_name: artist, album_name: album, duration: String(Math.round(duration)) })
    const exact = await getJson<LrclibResult>(`${LRCLIB}/get?${params}`, { signal })
    const found = exact ? consider([exact]) : undefined
    if (found) return found
  }

  // 2. Searches, from strict to loose
  const cleaned = cleanTitle(title)
  const lead = primaryArtist(artist)
  const searches: Array<Record<string, string>> = [
    { track_name: title, artist_name: artist },
    { track_name: cleaned, artist_name: artist },
    { track_name: cleaned, artist_name: lead },
    { q: `${cleaned} ${lead}` },
  ]
  const seen = new Set<string>()
  for (const search of searches) {
    if (signal?.aborted) return ''
    const params = new URLSearchParams(search)
    const id = params.toString().toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    const results = await getJson<LrclibResult[]>(`${LRCLIB}/search?${params}`, { signal })
    const found = Array.isArray(results) ? consider(results) : undefined
    if (found) return found
  }

  // 3. Last resort
  const params = new URLSearchParams({ name: cleaned, artist: lead })
  const other = await getJson<{ syncedLyrics?: string; lyrics?: string }>(`https://api.qobuzify.app/v2/track?${params}`, { signal })
  const fallback = other?.syncedLyrics?.trim() || other?.lyrics?.trim() || ''
  if (fallback && hasTimestamps(fallback)) return fallback
  return plainFallback || fallback
}

/**
 * Finds lyrics for a track: LRC text when synced, plain text otherwise, or '' when nothing was found.
 * Never throws, and every network call has a timeout, so awaiting it always finishes.
 */
export async function fetchLyrics(query: LyricsQuery, signal?: AbortSignal): Promise<string> {
  const key = cacheKey(query)
  const cached = cache.get(key)
  if (cached) {
    cache.delete(key) // keep recently used entries at the back
    cache.set(key, cached)
    return cached
  }
  const lyrics = (await lookup(query, signal)).trim()
  if (lyrics && !signal?.aborted) remember(key, lyrics)
  return lyrics
}
