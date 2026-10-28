import { useEffect, useRef } from 'react'
import type { LyricLine } from '../utils/lrcParser'

type Props = { lines: LyricLine[]; activeIndex: number; accent: string; karaoke: boolean }
/** Displays synchronized lyrics with the active line centered. */
export function LyricsDisplay({ lines, activeIndex, accent, karaoke }: Props) {
  const activeRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => { activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [activeIndex])
  if (!lines.length) return <div className="lyrics-empty">Lyrics not available</div>
  return <div className="lyrics-list">{lines.map((line, index) => <p ref={index === activeIndex ? activeRef : undefined} className={`lyric-line ${index === activeIndex ? 'active' : ''} ${index < activeIndex ? 'past' : ''}`} style={index === activeIndex ? { '--accent': accent } as React.CSSProperties : undefined} key={`${line.time}-${index}`}>{karaoke ? line.text : line.text}</p>)}</div>
}
