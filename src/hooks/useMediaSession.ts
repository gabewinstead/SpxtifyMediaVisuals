import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

export type Track = { title: string; artist: string; albumArtUrl?: string; duration: number; position: number; playing: boolean }
const initialTrack: Track = { title: '', artist: '', duration: 0, position: 0, playing: false }

/** Subscribes to backend media events and exposes the current track state. */
export function useMediaSession() {
  const [track, setTrack] = useState(initialTrack)
  useEffect(() => {
    let unlistenTrack: (() => void) | undefined
    let unlistenPosition: (() => void) | undefined
    let disposed = false
    Promise.all([
      listen<Track>('track-changed', (event) => setTrack(event.payload)),
      listen<Partial<Track>>('position-updated', (event) => setTrack((current) => ({ ...current, ...event.payload }))),
    ]).then(([trackStop, positionStop]) => {
      if (disposed) { trackStop(); positionStop() } else { unlistenTrack = trackStop; unlistenPosition = positionStop }
    })
    return () => { disposed = true; unlistenTrack?.(); unlistenPosition?.() }
  }, [])
  return track
}
