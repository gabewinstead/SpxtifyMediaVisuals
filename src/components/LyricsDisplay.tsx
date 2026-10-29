import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { LyricLine } from '../utils/lrcParser'

type Props = { lines: LyricLine[]; activeIndex: number }

/** Lines further than this from the active one all share the same faded look. */
const MAX_DISTANCE = 5

/**
 * Synchronized lyrics with the active line kept at the vertical centre.
 *
 * Scrolling is a single transform on `.lyrics-inner`, written straight to the
 * DOM, so a line change costs no extra React render. The list is re-measured
 * whenever it or its content changes size (window resize, font load, text wrap).
 */
export function LyricsDisplay({ lines, activeIndex }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<Array<HTMLParagraphElement | null>>([])
  const activeRef = useRef(activeIndex)
  const previousLines = useRef<LyricLine[] | null>(null)
  const lastOffset = useRef<number | null>(null)
  const hasLines = lines.length > 0
  activeRef.current = activeIndex

  const place = useCallback((animate: boolean) => {
    const list = listRef.current
    const inner = innerRef.current
    // Before the first timestamp (-1) rest on the first line
    const line = lineRefs.current[Math.max(activeRef.current, 0)]
    if (!list || !inner || !line) return

    // The list and inner block are both position: relative, so inner.offsetTop is measured
    // from the list and line.offsetTop from the inner block. Transforms don't affect offsetTop.
    const lineCenter = inner.offsetTop + line.offsetTop + line.offsetHeight / 2
    const y = Math.round(list.clientHeight / 2 - lineCenter)
    if (y === lastOffset.current) return // nothing moved; don't cancel a glide in progress
    lastOffset.current = y

    if (!animate) inner.style.transition = 'none'
    inner.style.transform = `translate3d(0, ${y}px, 0)`
    if (!animate) {
      void inner.offsetHeight // commit the jump before transitions come back
      inner.style.transition = ''
    }
  }, [])

  // New lines (new track) place instantly. A new active index glides.
  useLayoutEffect(() => {
    const linesChanged = previousLines.current !== lines
    previousLines.current = lines
    place(!linesChanged)
  }, [lines, activeIndex, place])

  // Re-centre without animation when layout changes underneath us
  useEffect(() => {
    const list = listRef.current
    const inner = innerRef.current
    if (!list || !inner || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => place(false))
    observer.observe(list)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [hasLines, place])

  if (!hasLines) return <div className="lyrics-empty">Lyrics not available</div>

  return <div ref={listRef} className="lyrics-list" role="region" aria-label="Lyrics">
    <div ref={innerRef} className="lyrics-inner">
      {lines.map((line, index) => {
        const state = index === activeIndex ? 'active' : index < activeIndex ? 'past' : ''
        const distance = Math.min(Math.abs(index - activeIndex), MAX_DISTANCE)
        return <p
          key={`${line.time}-${index}`}
          ref={(element) => { lineRefs.current[index] = element }}
          className={`lyric-line ${state}`.trim()}
          style={{ '--d': distance } as CSSProperties}
          aria-current={state === 'active' ? 'true' : undefined}
        >{line.text.trim() || '♪'}</p>
      })}
    </div>
  </div>
}
