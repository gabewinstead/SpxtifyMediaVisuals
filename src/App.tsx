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
type PositionPayload = { position?: number; duration?: number; playing?: boolean }
type LyricsPayload = string | LyricLine[]
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

function parseLyricsPayload(payload: LyricsPayload): LyricLine[] {
  if (Array.isArray(payload)) return payload
  const parsed = parseLrc(payload)
  if (parsed.length > 0) return parsed
  return payload.split(/\r?\n/).map((text, index) => ({
    time: index * 3,
    text: text.trim(),
  })).filter((line) => line.text.length > 0)
}

async function fetchLyricsDirect(artist: string, title: string): Promise<string> {
  // Try LRCLIB
  try {
    const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`
    const resp = await fetch(url)
    if (resp.ok) {
      const data = await resp.json()
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.syncedLyrics) return item.syncedLyrics
        }
        for (const item of data) {
          if (item.plainLyrics) return item.plainLyrics
        }
      }
    }
  } catch (e) {
    console.error('LRCLIB fetch failed:', e)
  }
  // Fallback: Qobuzify
  try {
    const url2 = `https://api.qobuzify.app/v2/track?name=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
    const resp2 = await fetch(url2)
    if (resp2.ok) {
      const data2 = await resp2.json()
      if (data2.syncedLyrics) return data2.syncedLyrics
      if (data2.lyrics) return data2.lyrics
    }
  } catch (e) {
    console.error('Qobuzify fetch failed:', e)
  }
  return ''
}

export default function App() {
  const appWindow = getCurrentWindow()
  const [track, setTrack] = useState<Track>({ title: '', artist: '', duration: 0, position: 0, playing: false })
  const [lines, setLines] = useState<LyricLine[]>([])
  const [artwork, setArtwork] = useState<string>()
  const [accent, setAccent] = useState(defaultTheme.accentColor)
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  const [mode, setMode] = useState<ViewMode>('lyrics')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const karaoke = true
  const windowOpacity = 1
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const activeIndex = useMemo(() => activeLyricIndex(lines, track.position), [lines, track.position])
  const hasTrack = Boolean(track.title.trim())

  // Event listeners
  useEffect(() => {
    let unlistenTrack: (() => void) | undefined
    let unlistenPosition: (() => void) | undefined
    let unlistenLyrics: (() => void) | undefined
    let disposed = false

    Promise.all([
      listen<TrackPayload>('track-changed', (event) => {
        const payload = event.payload
        if (!payload.title?.trim()) return
        setTrack((current) => ({
          ...current,
          ...payload,
          albumArtUrl: payload.albumArtUrl ?? payload.album_art_url ?? current.albumArtUrl,
        }))
        setLyricsLoading(true)
      }),
      listen<PositionPayload>('position-updated', (event) => {
        const payload = event.payload
        setTrack((current) => ({
          ...current,
          position: payload.position ?? current.position,
          duration: payload.duration ?? current.duration,
          playing: payload.playing ?? current.playing,
        }))
      }),
      listen<LyricsPayload>('lyrics-received', (event) => {
        setLines(parseLyricsPayload(event.payload))
        setLyricsLoading(false)
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
        invoke<TrackPayload>('get_current_track').then((payload) => {
          if (!payload.title?.trim()) return
          setTrack((current) => ({
            ...current,
            ...payload,
            albumArtUrl: payload.albumArtUrl ?? payload.album_art_url ?? current.albumArtUrl,
          }))
          setLyricsLoading(true)
        }).catch(() => undefined)
      }
    })

    return () => {
      disposed = true
      unlistenTrack?.()
      unlistenPosition?.()
      unlistenLyrics?.()
    }
  }, [])

  // Poll for track refresh (position, playing state)
  useEffect(() => {
    let active = true
    const refreshTrack = () => {
      invoke<Track>('get_current_track')
        .then((current) => {
          if (active && current.title?.trim()) {
            setTrack((previous) => ({
              ...previous,
              position: current.position,
              duration: current.duration,
              playing: current.playing,
              albumArtUrl: current.albumArtUrl ?? previous.albumArtUrl,
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

  // Load theme and view mode on mount
  useEffect(() => {
    invoke<Theme>('get_theme').then((value) => setTheme(value)).catch(() => undefined)
    invoke<string>('get_view_mode').then((value) => setMode(value === 'album' || value === 'combined' ? value : 'lyrics')).catch(() => undefined)
  }, [])

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!track.title.trim()) return undefined
    let active = true
    setLyricsLoading(true)
    setLines([])

    const doFetch = async () => {
      let lyrics = ''
      // Try Rust command first
      try {
        lyrics = await invoke<string>('fetch_lyrics', {
          artist: track.artist,
          track: track.title,
          album: track.album ?? '',
          duration: track.duration,
        })
      } catch (e) {
        console.error('Rust fetch_lyrics failed:', e)
      }
      // If Rust returned nothing, fetch directly from webview
      if (!lyrics || lyrics.trim().length === 0) {
        lyrics = await fetchLyricsDirect(track.artist, track.title)
      }
      if (!active) return
      setLines(parseLyricsPayload(lyrics))
      setLyricsLoading(false)
    }

    doFetch().catch(() => {
      if (!active) return
      setLines([])
      setLyricsLoading(false)
    })

    return () => { active = false }
  }, [track.title, track.artist])

  // Fetch artwork separately
  useEffect(() => {
    if (!track.title.trim()) return
    if (track.albumArtUrl) {
      setArtwork(track.albumArtUrl)
      return
    }
    let active = true
    fetchArtwork(track.title, track.artist).then((url) => {
      if (active && typeof url === 'string') setArtwork(url)
    }).catch(() => undefined)
    return () => { active = false }
  }, [track.title, track.artist, track.albumArtUrl])

  // Extract accent color from artwork
  useEffect(() => {
    extractDominantColor(artwork).then((color) => setAccent(color === defaultTheme.accentColor ? theme.accentColor : color))
  }, [artwork, theme.accentColor])

  // Poll for theme changes
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
  const stopDrag = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }
  const toggleMaximize = async () => {
    if (await appWindow.isMaximized()) await appWindow.unmaximize()
    else await appWindow.maximize()
  }

  return <main className={`app-shell mode-${mode}`} style={{
    '--accent': accent, '--background': theme.backgroundColor, '--secondary': theme.secondaryBackground,
    '--text': theme.textColor, '--muted': theme.mutedTextColor, '--font': theme.fontFamily,
    '--title-size': theme.titleSize, '--artist-size': theme.artistSize, '--lyric-size': theme.lyricSize,
    '--panel-opacity': theme.panelOpacity, '--blur': theme.blurAmount, '--radius': theme.borderRadius,
    opacity: windowOpacity,
  } as React.CSSProperties}>
    {(mode === 'lyrics' || mode === 'combined') && <AlbumArtBackground image={track.albumArtUrl || artwork} accent={accent} />}
    <header className="top-bar" data-tauri-drag-region>
      <div className="window-actions" data-tauri-drag-region="false">
        <button className="pointer-events-auto" data-tauri-drag-region="false" onMouseDown={stopDrag} onClick={() => void appWindow.minimize()} aria-label="Minimize" title="Minimize">−</button>
        <button className="pointer-events-auto" data-tauri-drag-region="false" onMouseDown={stopDrag} onClick={() => void toggleMaximize()} aria-label="Maximize" title="Maximize">□</button>
        <button className="pointer-events-auto" data-tauri-drag-region="false" onMouseDown={stopDrag} onClick={() => void appWindow.close()} aria-label="Close" title="Close">×</button>
      </div>
    </header>
    <section className="overlay">
      <div className="view-content">
        {hasTrack && mode === 'lyrics' && <div className="track-header"><strong>{track.title}</strong><span>{track.artist}</span></div>}
        {mode === 'lyrics' || mode === 'combined'
          ? hasTrack
            ? <div className={`lyrics-content ${mode === 'combined' ? 'combined-content' : ''} ${track.playing ? 'is-playing' : 'is-paused'}`}>
                {mode === 'combined' && <div className="combined-track-card">
                  {(track.albumArtUrl || artwork) && <img src={track.albumArtUrl || artwork} alt="" />}
                  <div><h1>{track.title}</h1><p>{track.artist}</p></div>
                </div>}
                {mode === 'lyrics' && <div className="lyrics-track-info"><h1>{track.title}</h1><p>{track.artist}</p></div>}
                {lyricsLoading
                  ? <p className="lyrics-status">Loading lyrics...</p>
                  : lines.length > 0
                    ? <LyricsDisplay lines={lines} activeIndex={activeIndex} accent={accent} karaoke={karaoke} />
                    : <p className="lyrics-status">No lyrics available</p>}
                {mode === 'combined' && <div className="combined-vignette" />}
              </div>
            : <IdleState accent={accent} />
          : <div className="now-playing">
              {track.albumArtUrl || artwork ? <img className="cover-art" src={track.albumArtUrl || artwork} alt="" /> : <div className="cover-placeholder" />}
              <div className="track-info"><h1>{hasTrack ? track.title : 'Waiting for playback'}</h1><p>{hasTrack ? track.artist : ''}</p></div>
            </div>}
      </div>
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
            <span>View mode</span>
            {(['lyrics', 'album', 'combined'] as ViewMode[]).map((item) =>
              <label className="view-mode-option" key={item}>
                <input type="radio" name="view-mode" checked={mode === item} onChange={() => changeMode(item)} />
                {item[0].toUpperCase() + item.slice(1)}
              </label>)}
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