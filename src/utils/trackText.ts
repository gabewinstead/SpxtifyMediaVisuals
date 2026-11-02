/**
 * Strips the suffixes streaming services add to titles ("- Remastered 2011", "(feat. X)", "- Live at ...")
 * which stop lyric and artwork databases from matching. Falls back to the original if nothing is left.
 */
export function cleanTitle(title: string): string {
  const cleaned = title
    .replace(/\s*[(\[][^)\]]*\b(feat|ft|with|remaster(?:ed)?|live|version|mono|stereo|edit|deluxe|bonus)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s+[-–—]\s+.*\b(remaster(?:ed)?|live|version|mono|stereo|edit|deluxe|bonus|single)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || title.trim()
}

/** First credited artist of "A, B", "A & B", "A feat. B" and similar. */
export function primaryArtist(artist: string): string {
  const first = artist.split(/\s*(?:,|;|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)[0]?.trim()
  return first || artist.trim()
}
