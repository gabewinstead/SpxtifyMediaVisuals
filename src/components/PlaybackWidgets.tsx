import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useSmoothedPosition } from '../hooks/usePlayback'
import { ProgressBar } from './ProgressBar'

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

/** Owns the 50ms smoothing state so only the progress bar re-renders, not the whole app. */
export function PlaybackProgress({ getPosition, duration, accent }: { getPosition: () => number; duration: number; accent: string }) {
  const position = useSmoothedPosition(getPosition)
  return <ProgressBar position={duration > 0 ? Math.min(position, duration) : position} duration={duration} accent={accent} />
}

/** Elapsed time from the live clock, updating its own state so the rest of the app stays still. */
export function ElapsedTime({ getPosition, duration }: { getPosition: () => number; duration: number }) {
  const [seconds, setSeconds] = useState(() => Math.floor(getPosition()))
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.floor(getPosition())), 200)
    return () => window.clearInterval(timer)
  }, [getPosition])
  return <span>{formatTime(duration > 0 ? Math.min(seconds, duration) : seconds)}</span>
}

const send = (command: string) => { void invoke(command).catch(() => undefined) }

/** Previous, play/pause and next. */
export function Controls({ playing }: { playing: boolean }) {
  return <div className="playback-controls">
    <button aria-label="Previous track" onClick={() => send('media_previous')}>◀◀</button>
    <button className={`play-button ${playing ? 'is-playing' : ''}`} aria-label="Play or pause" onClick={() => send('media_play_pause')}>{playing ? 'Ⅱ' : '▶'}</button>
    <button aria-label="Next track" onClick={() => send('media_next')}>▶▶</button>
  </div>
}

/** Progress bar with elapsed and total time underneath, used by the custom-layout widget. */
export function ProgressRow({ getPosition, duration, accent }: { getPosition: () => number; duration: number; accent: string }) {
  return <div className="progress-row">
    <PlaybackProgress getPosition={getPosition} duration={duration} accent={accent} />
    <div className="progress-times">
      <ElapsedTime getPosition={getPosition} duration={duration} />
      <span>{formatTime(duration)}</span>
    </div>
  </div>
}
