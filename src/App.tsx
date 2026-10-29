import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { AlbumArtBackground } from './components/AlbumArtBackground'
import { LyricsDisplay } from './components/LyricsDisplay'
import { ProgressBar } from './components/ProgressBar'
import { parseLrc, type LyricLine } from './utils/lrcParser'
import { extractDominantColor } from './utils/colorExtract'
import { fetchArtwork } from './utils/artwork'
import { useActiveLyricIndex, usePlaybackClock, useSmoothedPosition } from './hooks/usePlayback'

type ViewMode = 'lyrics' | 'album' | 'combined'
type Track = { title: string; artist: string; album?: string; albumArtUrl?: string; duration: number; position: number; playing: boolean }
type TrackPayload = Partial<Track> & { album_art_url?: string }
type PositionPayload = { position?: number; duration?: number; playing?: boolean }
type LyricsPayload = string | LyricLine[]
type Theme = {
  id: string; name: string; layout: string
  accentColor: string; backgroundColor: string; secondaryBackground: string
  textColor: string; mutedTextColor: string; fontFamily: string; titleSize: string
  artistSize: string; lyricSize: string; panelOpacity: number; blurAmount: string; borderRadius: string
  glow: string; progressGlow: string
}

const LAYOUTS = [
  { id: 'center', label: 'Centered' },
  { id: 'left-aligned', label: 'Left Aligned' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'cinematic', label: 'Cinematic' },
] as const
type LayoutId = typeof LAYOUTS[number]['id']

/** Layouts the Rust `save_layout` command already accepts. The rest are saved through `save_theme`. */
const RUST_LAYOUTS = new Set<LayoutId>(['center', 'cinematic'])

/** Maps anything stored on disk (including the removed "split" and "full-bleed") onto a layout that exists. */
function normalizeLayout(value?: string): LayoutId {
  return LAYOUTS.find((layout) => layout.id === value)?.id ?? 'center'
}

const extraThemePresets: Record<string, Partial<Theme>> = {
  ember: { name: 'Ember', backgroundColor: '#1a0a0a', secondaryBackground: '#2a1212', textColor: '#FFF5F0', mutedTextColor: '#AA8878', accentColor: '#F97316', glow: '0 0 40px rgba(249, 115, 22, 0.3)' },
  aurora: { name: 'Aurora', backgroundColor: '#0a1a0f', secondaryBackground: '#0f2518', textColor: '#F0FFF4', mutedTextColor: '#7BC98B', accentColor: '#34D399', glow: '0 0 40px rgba(52, 211, 153, 0.3)' },
  rose: { name: 'Rose', backgroundColor: '#1a0a12', secondaryBackground: '#2a1220', textColor: '#FFF0F5', mutedTextColor: '#C97BA0', accentColor: '#FB7185', glow: '0 0 40px rgba(251, 113, 133, 0.3)' },
  ghost: { name: 'Ghost', backgroundColor: '#000000', secondaryBackground: '#0a0a0a', textColor: '#FFFFFF', mutedTextColor: '#555555', accentColor: '#FFFFFF', glow: '0 0 20px rgba(255, 255, 255, 0.1)' },
}

const defaultTheme: Theme = {
  accentColor: '#1DB954', backgroundColor: '#121212', secondaryBackground: '#181818',
  textColor: '#FFFFFF', mutedTextColor: '#B3B3B3', fontFamily: 'Inter, Arial, sans-serif',
  titleSize: '32px', artistSize: '18px', lyricSize: '42px', panelOpacity: 0.72,
  blurAmount: '42px', borderRadius: '12px',
  glow: '0 0 20px rgba(29, 185, 84, 0.3)', progressGlow: 'none',
  id: 'spotify-dark', name: 'Spotify Dark', layout: 'center',
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

/** Applies a patch to the track, returning the same object when nothing changed so polling doesn't cause re-renders. */
function patchTrack(previous: Track, patch: Partial<Track>): Track {
  const next: Track = { ...previous }
  let changed = false
  for (const key of Object.keys(patch) as Array<keyof Track>) {
    const value = patch[key]
    if (value !== undefined && value !== previous[key]) {
      Object.assign(next, { [key]: value })
      changed = true
    }
  }
  return changed ? next : previous
}

export default function App() {
  const appWindow = getCurrentWindow()
  const [track, setTrack] = useState<Track>({ title: '', artist: '', duration: 0, position: 0, playing: false })
  const [lines, setLines] = useState<LyricLine[]>([])
  const [artwork, setArtwork] = useState<string>()
  const [accent, setAccent] = useState(defaultTheme.accentColor)
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  const [layoutStyle, setLayoutStyle] = useState<LayoutId>('center')
  const [mode, setMode] = useState<ViewMode>('lyrics')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const windowOpacity = 1
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('')

  // One live clock drives everything time-based:
  // lyrics read it directly (instant, never behind), the progress bar eases toward it.
  const getPosition = usePlaybackClock(track.position, track.playing)
  const activeIndex = useActiveLyricIndex(lines, getPosition)
  const hasTrack = Boolean(track.title.trim())

  const installUpdate = async (notifyWhenCurrent: boolean) => {
    try {
      const update = await check()
      if (!update) {
        if (notifyWhenCurrent) setUpdateStatus('You are on the latest version.')
        return
      }
      setUpdateStatus(`Downloading version ${update.version}...`)
      await update.downloadAndInstall()
      await relaunch()
    } catch {
      if (notifyWhenCurrent) setUpdateStatus('Update check failed. Try again later.')
    }
  }

  useEffect(() => {
    void installUpdate(false)
  }, [])

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
        const { position, duration, playing } = event.payload
        setTrack((current) => patchTrack(current, { position, duration, playing }))
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

  // Poll for position every 250ms
  useEffect(() => {
    let active = true
    const refreshTrack = () => {
      invoke<Track>('get_current_track')
        .then((current) => {
          if (!active || !current.title?.trim()) return
          setTrack((previous) => patchTrack(previous, {
            position: current.position,
            duration: current.duration,
            playing: current.playing,
            albumArtUrl: current.albumArtUrl,
          }))
        })
        .catch(() => undefined)
    }
    refreshTrack()
    const timer = window.setInterval(refreshTrack, 250)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  // Load theme and view mode on mount
  useEffect(() => {
    invoke<Theme>('get_theme').then((value) => {
      const layout = normalizeLayout(value.layout)
      setTheme({ ...value, layout })
      setLayoutStyle(layout)
    }).catch(() => undefined)
    invoke<string>('get_view_mode').then((value) => setMode(value === 'album' || value === 'combined' ? value : 'lyrics')).catch(() => undefined)
  }, [])

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!track.title.trim()) return undefined
    let active = true
    setLyricsLoading(true)
    setLines([])

    const doFetch = async () => {
      const lyrics = await fetchLyricsDirect(track.artist, track.title)
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
      invoke<Theme>('get_theme').then((value) => {
        const next = { ...value, layout: normalizeLayout(value.layout) }
        setTheme((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
        setLayoutStyle(next.layout as LayoutId)
      }).catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [])

  const changeMode = (nextMode: ViewMode) => {
    setMode(nextMode)
    invoke('save_view_mode', { mode: nextMode }).catch(() => undefined)
  }
  const selectTheme = (id: string) => {
    if (id === 'custom') {
      setTheme((current) => ({ ...current, id: 'custom', name: 'Custom' }))
      return
    }
    const extraPreset = extraThemePresets[id]
    if (extraPreset) {
      const value = { ...theme, ...extraPreset, id, layout: layoutStyle }
      setTheme(value)
      setAccent(value.accentColor)
      invoke('save_theme', { theme: value }).catch(() => undefined)
      return
    }
    invoke<Theme>('save_theme_preset', { id }).then((value) => {
      const layout = normalizeLayout(value.layout)
      setTheme({ ...value, layout })
      setAccent(value.accentColor)
      setLayoutStyle(layout)
    }).catch(() => undefined)
  }
  const updateCustomTheme = (field: keyof Theme, value: string) => {
    setTheme((current) => ({ ...current, id: 'custom', name: 'Custom', [field]: value }))
    if (field === 'accentColor') setAccent(value)
  }
  const saveCustomTheme = () => {
    invoke('save_theme', { theme }).catch(() => undefined)
  }
  const selectLayout = (style: LayoutId) => {
    setLayoutStyle(style) // apply immediately; the saved value catches up
    if (!RUST_LAYOUTS.has(style)) {
      const value = { ...theme, layout: style }
      setTheme(value)
      invoke('save_theme', { theme: value }).catch(() => undefined)
      return
    }
    invoke<Theme>('save_layout', { style }).then((value) => {
      setTheme({ ...value, layout: normalizeLayout(value.layout) })
    }).catch(() => undefined)
  }
  const toggleMaximize = async () => {
    if (await appWindow.isMaximized()) await appWindow.unmaximize()
    else await appWindow.maximize()
  }

  return <main className={`app-shell theme-${theme.id} mode-${mode} layout-${layoutStyle}`} style={{
    '--accent': accent, '--background': theme.backgroundColor, '--secondary': theme.secondaryBackground,
    '--text': theme.textColor, '--muted': theme.mutedTextColor, '--font': theme.fontFamily,
    '--title-size': theme.titleSize, '--artist-size': theme.artistSize, '--lyric-size': theme.lyricSize,
    '--panel-opacity': theme.panelOpacity, '--blur': theme.blurAmount, '--radius': theme.borderRadius,
    '--glow': theme.glow, '--progress-glow': theme.progressGlow,
    opacity: windowOpacity,
  } as React.CSSProperties}>
    {(mode === 'lyrics' || mode === 'combined') && <AlbumArtBackground image={track.albumArtUrl || artwork} accent={accent} />}

    <div className="top-bar" onMouseDown={(event) => {
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest('.window-actions')) return
      void appWindow.startDragging()
    }}>
      <div className="window-actions">
        <button onClick={() => void appWindow.minimize()} aria-label="Minimize" title="Minimize">−</button>
        <button onClick={() => void toggleMaximize()} aria-label="Maximize" title="Maximize">□</button>
        <button onClick={() => void appWindow.close()} aria-label="Close" title="Close">×</button>
      </div>
    </div>

    <section className="overlay">
      <div className="view-content">
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
                    ? <LyricsDisplay lines={lines} activeIndex={activeIndex} />
                    : <p className="lyrics-status">No lyrics available</p>}
                {mode === 'combined' && <div className="combined-vignette" />}
              </div>
            : <IdleState accent={accent} />
          : <div className="now-playing">
              {track.albumArtUrl || artwork ? <img className="cover-art" src={track.albumArtUrl || artwork} alt="" /> : <div className="cover-placeholder" />}
              <div className="track-info"><h1>{hasTrack ? track.title : 'Waiting for playback'}</h1><p>{hasTrack ? track.artist : ''}</p></div>
            </div>}
      </div>

      {/* Bottom bar — simple, full-width, no glass pill */}
      <footer className="bottom-bar">
        <PlaybackProgress getPosition={getPosition} duration={track.duration} accent={accent} />
        <div className="playback-row">
          <ElapsedTime getPosition={getPosition} duration={track.duration} />
          <div className="playback-controls">
            <button aria-label="Previous track" onClick={() => invoke('media_previous')}>◀◀</button>
            <button className={`play-button ${track.playing ? 'is-playing' : ''}`} aria-label="Play or pause" onClick={() => invoke('media_play_pause')}>{track.playing ? 'Ⅱ' : '▶'}</button>
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
            <label className="settings-field">Theme
              <select value={theme.id} onChange={(event) => selectTheme(event.target.value)}>
                <option value="spotify-dark">Spotify Dark</option>
                <option value="midnight">Midnight</option>
                <option value="sunset">Sunset</option>
                <option value="ocean">Ocean</option>
                <option value="light">Light Mode</option>
                <option value="neon">Neon</option>
                <option value="ember">Ember</option>
                <option value="aurora">Aurora</option>
                <option value="rose">Rose</option>
                <option value="ghost">Ghost</option>
                <option value="custom">Custom...</option>
              </select>
            </label>
            {theme.id === 'custom' && <div className="custom-theme-editor">
              <label>Accent <input type="color" value={theme.accentColor} onChange={(event) => updateCustomTheme('accentColor', event.target.value)} /></label>
              <label>Background <input type="color" value={theme.backgroundColor} onChange={(event) => updateCustomTheme('backgroundColor', event.target.value)} /></label>
              <label>Text <input type="color" value={theme.textColor} onChange={(event) => updateCustomTheme('textColor', event.target.value)} /></label>
              <label>Blur <input type="range" min="0" max="80" value={parseInt(theme.blurAmount, 10)} onChange={(event) => updateCustomTheme('blurAmount', `${event.target.value}px`)} /></label>
              <label>Lyrics size <input type="range" min="20" max="64" value={parseInt(theme.lyricSize, 10)} onChange={(event) => updateCustomTheme('lyricSize', `${event.target.value}px`)} /></label>
              <button onClick={saveCustomTheme}>Save custom theme</button>
            </div>}
            <label className="settings-field">Layout
              <select value={layoutStyle} onChange={(event) => selectLayout(event.target.value as LayoutId)}>
                {LAYOUTS.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
              </select>
            </label>
            <label><input type="checkbox" checked={alwaysOnTop} onChange={(event) => { setAlwaysOnTop(event.target.checked); void appWindow.setAlwaysOnTop(event.target.checked) }} /> Always on top</label>
            <button onClick={() => void installUpdate(true)}>Check for updates</button>
            {updateStatus && <span className="update-status" role="status">{updateStatus}</span>}
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

/** Owns the 50ms smoothing state so only the progress bar re-renders, not the whole app. */
function PlaybackProgress({ getPosition, duration, accent }: { getPosition: () => number; duration: number; accent: string }) {
  const position = useSmoothedPosition(getPosition)
  return <ProgressBar position={duration > 0 ? Math.min(position, duration) : position} duration={duration} accent={accent} />
}

/** Elapsed time from the live clock, updating its own state so the rest of the app stays still. */
function ElapsedTime({ getPosition, duration }: { getPosition: () => number; duration: number }) {
  const [seconds, setSeconds] = useState(() => Math.floor(getPosition()))
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(Math.floor(getPosition())), 200)
    return () => window.clearInterval(timer)
  }, [getPosition])
  return <span>{formatTime(duration > 0 ? Math.min(seconds, duration) : seconds)}</span>
}

function IdleState({ accent }: { accent: string }) {
  return <div className="idle-state">
    <span className="idle-pulse" style={{ backgroundColor: accent, boxShadow: `0 0 24px ${accent}` }} />
    <span>Waiting for playback...</span>
  </div>
}
