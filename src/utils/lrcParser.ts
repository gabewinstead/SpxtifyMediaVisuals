export type LyricLine = { time: number; text: string }

const timestamp = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/

/** Parses timestamped LRC text into chronologically ordered lyric lines. */
export function parseLrc(lrc: string): LyricLine[] {
  return lrc.split(/\r?\n/).flatMap((line) => {
    const match = timestamp.exec(line)
    if (!match) return []
    const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0')}`) : 0
    return [{ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text: line.slice(match[0].length).trim() }]
  }).filter((line) => line.text.length > 0).sort((a, b) => a.time - b.time)
}

/** Returns the lyric line active at the supplied playback position. */
export function activeLyricIndex(lines: LyricLine[], position: number): number {
  let index = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].time <= position) index = i
    else break
  }
  return index
}
