import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { AlbumArtBackground } from './components/AlbumArtBackground'
import { LyricsDisplay } from './components/LyricsDisplay'
import { ProgressBar } from './components/ProgressBar'
import { activeLyricIndex, parseLrc, type LyricLine } from './utils/lrcParser'
import { extractDominantColor } from './utils/colorExtract'
import { fetchArtwork } from './utils/artwork'

type ViewMode = 'lyrics' | 'album' | 'combined'
type Track = { title: string; artist: string; album?: string; albumArtUrl?: string; duration: number; position: number; playing: boolean }
type TrackPayload = Partial<Track> & { album_art_url?: string }
type Theme = {
  accentColor: string; backgroundColor: string; secondaryBackground: string
  textColor: string; mutedTextColor: string; fontFamily: string; titleSize: string
  artistSize: string; lyricSize: string; panelOpacity: number; blurAmount: string; borderRadius: string
}

const defaultTheme: Theme = {
  accentColor: '#1DB954', backgroundColor: '#121212', secondaryBackground: '#181818',
  textColor: '#FFFFFF', mutedTextColor: '#B3B3B3', fontFamily: 'Inter, Arial, sans-serif',
  titleSize: '32px', artistSize: '18px', lyricSize: '42px', panelOpacity: 0.72,
  blurAmount: '42px', borderRadius: '12px',
}

/** Renders the now-playing overlay and its runtime-selectable presentation modes. */
export default function App() {
  const appWindow = getCurrentWindow()
  const [track, setTrack] = useState<Track>({ title: '', artist: '', duration: 0, position: 0, playing: false })
  const [lines, setLines] = useState<LyricLine[]>([])
  const [artwork, setArtwork] = useState<string>()
  const [accent, setAccent] = useState(defaultTheme.accentColor)
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  const [mode, setMode] = useState<ViewMode>('lyrics')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [karaoke, setKaraoke] = useState(true)
  const [windowOpacity, setWindowOpacity] = useState(1)
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const activeIndex = useMemo(() => activeLyricIndex(lines, track.position), [lines, track.position])
  const hasTrack = Boolean(track.title && track.artist)

  useEffect(() => {
    let unlistenTrack: (() => void) | undefined
    let unlistenPosition: (() => void) | undefined
    let unlistenLyrics: (() => void) | undefined
    let disposed = false

    Promise.all([
      listen<TrackPayload>('track-changed', (event) => {
        const payload = event.payload
        setTrack((current) => ({
          ...current,
          ...payload,
          albumArtUrl: payload.albumArtUrl ?? payload.album_art_url ?? current.albumArtUrl,
        }))
      }),
      listen<Partial<Track>>('position-updated', (event) => setTrack((current) => ({ ...current, ...event.payload }))),
      listen<string | LyricLine[]>('lyrics-received', (event) => {
        setLines(Array.isArray(event.payload) ? event.payload : parseLrc(event.payload))
      }),
    ]).then(([stopTrack, stopPosition, stopLyrics]) => {
      if (disposed) {
        stopTrack()
        stopPosition()
        stopLyrics()
      } else {
        unlistenTrack = stopTrack
        unlistenPosition = stopPosition
        unlistenLyrics = stopLyrics
        void invoke('frontend_ready')
        invoke<TrackPayload>('get_current_track').then((payload) => setTrack((current) => ({
          ...current,
          ...payload,
          albumArtUrl: payload.albumArtUrl ?? payload.album_art_url ?? current.albumArtUrl,
        }))).catch(() => undefined)
      }
    })

    return () => {
      disposed = true
      unlistenTrack?.()
      unlistenPosition?.()
      unlistenLyrics?.()
    }
  }, [])

  useEffect(() => {
    let active = true
    const refreshTrack = () => {
      invoke<Track>('get_current_track')
        .then((current) => {
          if (active && (current.title || current.artist)) {
            setTrack((previous) => ({
              ...previous,
              ...current,
              albumArtUrl: current.albumArtUrl ?? previous.albumArtUrl,
              position: current.position,
              duration: current.duration,
            }))
          }
        })
        .catch(() => undefined)
    }
    refreshTrack()
    const timer = window.setInterval(refreshTrack, 1000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    invoke<Theme>('get_theme').then((value) => setTheme(value)).catch(() => undefined)
    invoke<string>('get_view_mode').then((value) => setMode(value === 'album' || value === 'combined' ? value : 'lyrics')).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!track.title || !track.artist) { setLines([]); setArtwork(undefined); return undefined }
    let active = true
    Promise.all([
      invoke('fetch_lyrics', { artist: track.artist, track: track.title, album: track.album ?? '', duration: track.duration }),
      Promise.resolve(track.albumArtUrl || fetchArtwork(track.title, track.artist)),
    ]).then(([, image]) => {
      if (active && typeof image === 'string') setArtwork(image)
    }).catch(() => { if (active) setLines([]) })
    return () => { active = false }
  }, [track.title, track.artist, track.album, track.duration])
  useEffect(() => {
    extractDominantColor(artwork).then((color) => setAccent(color === defaultTheme.accentColor ? theme.accentColor : color))
  }, [artwork, theme.accentColor])
  useEffect(() => {
    const timer = window.setInterval(() => {
      invoke<Theme>('get_theme').then((value) => setTheme((current) => JSON.stringify(current) === JSON.stringify(value) ? current : value)).catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [])
  const changeMode = (nextMode: ViewMode) => {
    setMode(nextMode)
    invoke('save_view_mode', { mode: nextMode }).catch(() => undefined)
  }
  return <main className={`app-shell mode-${mode}`} style={{
    '--accent': accent, '--background': theme.backgroundColor, '--secondary': theme.secondaryBackground,
    '--text': theme.textColor, '--muted': theme.mutedTextColor, '--font': theme.fontFamily,
    '--title-size': theme.titleSize, '--artist-size': theme.artistSize, '--lyric-size': theme.lyricSize,
    '--panel-opacity': theme.panelOpacity, '--blur': theme.blurAmount, '--radius': theme.borderRadius,
    opacity: windowOpacity,
  } as React.CSSProperties}>
    {(mode === 'lyrics' || mode === 'combined') && <AlbumArtBackground image={track.albumArtUrl || artwork} accent={accent} />}
    <section className="overlay" data-tauri-drag-region>
      <header className="top-bar" data-tauri-drag-region>
        {hasTrack && <div className="track-header"><strong>{track.title}</strong><span>{track.artist}</span></div>}
        <div className="window-actions" data-tauri-drag-region="false">
          <button onClick={() => appWindow.toggleMaximize()} aria-label="Maximize">□</button>
          <button onClick={() => appWindow.close()} aria-label="Close">×</button>
        </div>
      </header>
      {mode === 'lyrics' || mode === 'combined'
        ? hasTrack
          ? <><div className="lyrics-track-info"><h1>{track.title}</h1><p>{track.artist}</p></div><LyricsDisplay lines={lines} activeIndex={activeIndex} accent={accent} karaoke={karaoke} /></>
          : <IdleState accent={accent} />
        : <div className="now-playing">
            {track.albumArtUrl || artwork ? <img className="cover-art" src={track.albumArtUrl || artwork} alt="" /> : <div className="cover-placeholder" />}
            <div className="track-info"><h1>{hasTrack ? track.title : 'Waiting for playback'}</h1><p>{hasTrack ? track.artist : ''}</p></div>
          </div>}
      <footer className="bottom-bar" data-tauri-drag-region="false">
        <ProgressBar position={track.position} duration={track.duration} accent={accent} />
        <div className="playback-row">
          <span>{formatTime(track.position)}</span>
          <div className="playback-controls">
            <button aria-label="Previous track" onClick={() => invoke('media_previous')}>◀◀</button>
            <button className="play-button" aria-label="Play or pause" onClick={() => invoke('media_play_pause')}>{track.playing ? 'Ⅱ' : '▶'}</button>
            <button aria-label="Next track" onClick={() => invoke('media_next')}>▶▶</button>
          </div>
          <span>{formatTime(track.duration)}</span>
        </div>
        <div className="settings-wrap">
          <button className="settings-button" onClick={() => setSettingsOpen((open) => !open)} aria-label="Settings">⚙</button>
          {settingsOpen && <div className="settings-panel">
            <span>View</span>
            {(['lyrics', 'album', 'combined'] as ViewMode[]).map((item) =>
              <button className={mode === item ? 'selected' : ''} key={item} onClick={() => changeMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
            <label><input type="checkbox" checked={karaoke} onChange={(event) => setKaraoke(event.target.checked)} /> Karaoke</label>
            <label>Opacity <input type="range" min="0.5" max="1" step="0.05" value={windowOpacity} onChange={(event) => setWindowOpacity(Number(event.target.value))} /></label>
            <label><input type="checkbox" checked={alwaysOnTop} onChange={(event) => { setAlwaysOnTop(event.target.checked); void appWindow.setAlwaysOnTop(event.target.checked) }} /> Always on top</label>
            <button onClick={() => setSettingsOpen(false)}>Close</button>
          </div>}
        </div>
      </footer>
    </section>
  </main>
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
}

function IdleState({ accent }: { accent: string }) {
  return <div className="idle-state">
    <span className="idle-pulse" style={{ backgroundColor: accent, boxShadow: `0 0 24px ${accent}` }} />
    <span>Waiting for playback...</span>
  </div>
}
