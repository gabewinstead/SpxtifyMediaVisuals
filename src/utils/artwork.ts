/** Finds a public, keyless square artwork image for a track. */
export async function fetchArtwork(title: string, artist: string): Promise<string | undefined> {
  const params = new URLSearchParams({ term: `${title} ${artist}`, entity: 'song', limit: '1' })
  try {
    const response = await fetch(`https://itunes.apple.com/search?${params}`)
    if (!response.ok) return undefined
    const data = await response.json() as { results?: Array<{ artworkUrl100?: string }> }
    return data.results?.[0]?.artworkUrl100?.replace('100x100', '1000x1000')
  } catch {
    return undefined
  }
}
