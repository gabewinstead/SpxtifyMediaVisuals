import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LyricLine } from '../utils/lrcParser'

/** A gap bigger than this (seconds) between the clock and a new sample is treated as a seek or a new track. */
const SEEK_THRESHOLD = 1

/** Consecutive samples that must all be far behind the clock before the clock moves backwards. */
const CONFIRM_SAMPLES = 2

/**
 * A playback clock that keeps running between position samples.
 *
 * The player only reports its position a few times per second, so reading the
 * raw value makes everything that depends on it move in steps. This hook
 * anchors on each sample and extrapolates with `performance.now()` while
 * playing, so `getPosition()` is accurate at any instant and never lags.
 *
 * When a new sample arrives:
 * - new track (resetKey changed), play/pause change, or paused: snap to the sample
 * - sample ahead of the clock: jump forward to it (the clock was late)
 * - sample slightly behind the clock: ignore it. Samples are quantised and can
 *   be stale, and moving the clock backwards would make lyrics flicker.
 * - sample far behind the clock: only believe it once CONFIRM_SAMPLES in a row
 *   agree. A real seek stays behind; a single stale reading does not.
 */
export function usePlaybackClock(position: number, playing: boolean, resetKey = ''): () => number {
  const clock = useRef({ base: position, at: performance.now(), playing, key: resetKey })
  const behindSamples = useRef(0)

  useLayoutEffect(() => {
    const now = performance.now()
    const c = clock.current
    const predicted = c.playing ? c.base + (now - c.at) / 1000 : c.base
    const error = position - predicted
    const anchor = () => {
      clock.current = { base: position, at: now, playing, key: resetKey }
      behindSamples.current = 0
    }

    if (resetKey !== c.key || playing !== c.playing || !playing || error > 0) {
      anchor()
    } else if (error < -SEEK_THRESHOLD) {
      behindSamples.current += 1
      if (behindSamples.current >= CONFIRM_SAMPLES) anchor()
    } else {
      behindSamples.current = 0
    }
  }, [position, playing, resetKey])

  return useCallback(() => {
    const c = clock.current
    return c.playing ? c.base + (performance.now() - c.at) / 1000 : c.base
  }, [])
}

/** Index of the last line whose timestamp has been reached, or -1 before the first line. Lines must be sorted by time. */
export function findActiveIndex(lines: LyricLine[], position: number): number {
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid].time <= position) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}

/**
 * The active lyric index, read from the live clock every frame.
 * State only changes when the index does, so React re-renders once per line, not once per frame.
 */
export function useActiveLyricIndex(lines: LyricLine[], getPosition: () => number): number {
  const [index, setIndex] = useState(-1)

  useEffect(() => {
    if (lines.length === 0) {
      setIndex(-1)
      return undefined
    }
    let frame = 0
    const tick = () => {
      setIndex(findActiveIndex(lines, getPosition()))
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [lines, getPosition])

  return index
}

/**
 * A visually smooth position for the progress bar.
 * Follows the clock, closing 60% of the gap every 50ms, and snaps on seeks.
 * Pair with `transition: width .05s linear` on the fill so each step blends into the next.
 */
export function useSmoothedPosition(getPosition: () => number, intervalMs = 50, easing = 0.6): number {
  const [value, setValue] = useState(getPosition)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setValue((current) => {
        const target = getPosition()
        const diff = target - current
        if (Math.abs(diff) > SEEK_THRESHOLD || Math.abs(diff) < 0.01) return target
        return current + diff * easing
      })
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [getPosition, intervalMs, easing])

  return value
}