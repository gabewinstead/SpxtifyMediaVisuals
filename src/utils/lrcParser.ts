export type LyricLine = { time: number; text: string }

const TIMESTAMP = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/
const OFFSET = /^\[offset:\s*([+-]?\d+)\s*\]$/i
/** Word-level tags from "enhanced" LRC, such as <00:12.40>. */
const WORD_TIMESTAMP = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g

/**
 * Parses timestamped LRC text into chronologically ordered lyric lines.
 * Handles several timestamps on one line (repeated choruses), word-level tags and the [offset:] header.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  let offset = 0

  for (const raw of lrc.split(/\r?\n/)) {
    let rest = raw.trim()

    const offsetMatch = OFFSET.exec(rest)
    if (offsetMatch) {
      offset = Number(offsetMatch[1]) / 1000 // positive offsets make lyrics appear sooner
      continue
    }

    const times: number[] = []
    for (let match = TIMESTAMP.exec(rest); match; match = TIMESTAMP.exec(rest)) {
      const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0')}`) : 0
      times.push(Number(match[1]) * 60 + Number(match[2]) + fraction)
      rest = rest.slice(match[0].length).trimStart()
    }
    if (times.length === 0) continue

    const text = rest.replace(WORD_TIMESTAMP, '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    for (const time of times) lines.push({ time, text })
  }

  return lines
    .map((line) => ({ ...line, time: Math.max(0, line.time - offset) }))
    .sort((a, b) => a.time - b.time)
}
