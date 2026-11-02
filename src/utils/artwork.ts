import { getJson } from './net'
import { cleanTitle, primaryArtist } from './trackText'

type ItunesResult = { artistName?: string; artworkUrl100?: string }

/** Finds a public, keyless square artwork image for a track. Resolves to undefined if nothing matches. */
export async function fetchArtwork(title: string, artist: string, signal?: AbortSignal): Promise<string | undefined> {
  const params = new URLSearchParams({ term: `${cleanTitle(title)} ${primaryArtist(artist)}`, entity: 'song', limit: '5' })
  const data = await getJson<{ results?: ItunesResult[] }>(`https://itunes.apple.com/search?${params}`, { signal })
  const results = data?.results ?? []

  // Prefer a result by the right artist over whatever happens to rank first
  const wanted = primaryArtist(artist).toLowerCase()
  const match = results.find((result) => result.artistName?.toLowerCase().includes(wanted)) ?? results[0]
  return match?.artworkUrl100?.replace('100x100', '1000x1000')
}
