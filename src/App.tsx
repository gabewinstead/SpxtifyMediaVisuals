import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { check, type DownloadEvent } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { AlbumArtBackground } from './components/AlbumArtBackground'
import { LyricsDisplay } from './components/LyricsDisplay'
import { ProgressBar } from './components/ProgressBar'
import { parseLrc, type LyricLine } from './utils/lrcParser'
import { extractDominantColor } from './utils/colorExtract'
import { fetchArtwork } from './utils/artwork'
import { useActiveLyricIndex, usePlaybackClock, useSmoothedPosition } from './hooks/usePlayback'
import { CustomCanvas } from './components/CustomCanvas'
import { LayoutEditor } from './components/LayoutEditor'
import { ThemeStudio } from './components/ThemeStudio'
import { loadCustomLayouts, makeWidget, saveCustomLayouts, starterLayout, type CustomLayout, type Widget, type WidgetType } from './utils/customLayouts'
import { buildCustomTheme, loadCustomThemes, newCustomTheme, saveCustomThemes, type CustomTheme } from './utils/themes'

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

/** Dropdown value that starts creating something new instead of selecting an existing item. */
const NEW_OPTION = '__new__'

/** How long after a local change the saved theme from disk is ignored, so a slow save can't revert it. */
const LOCAL_CHANGE_GRACE_MS = 2500

/** How long to wait for the song length (needed for an exact lyric match) before searching without it. */
const DURATION_WAIT_MS = 1000

/** Longest the lyric lookup may take before the loading state gives up. */
const LYRICS_DEADLINE_MS = 15_000

/** Maps anything stored on disk (including the removed "split" and "full-bleed") onto a layout that exists. */
function normalizeLayout(value?: string, custom: CustomLayout[] = []): LayoutId | string {
  if (value && (LAYOUTS.some((l) => l.id === value) || custom.some((l) => l.id === value))) return value
  return 'center'
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

function parseLyricsPayload(payload: LyricsPayload, duration = 0): LyricLine[] {
  if (Array.isArray(payload)) return payload
  const parsed = parseLrc(payload)
  if (parsed.length > 0) return parsed
  const plain = payload.split(/\r?\n/).map((text) => text.trim()).filter((line) => line.length > 0)
  const spacing = duration > 0 ? duration / Math.max(plain.length, 1) : 3
  return plain.map((text, index) => ({ time: index * spacing, text }))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function fetchLyricsDirect(artist: string, title: string, signal: AbortSignal): Promise<string> {
  try {
    const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`
    const resp = await fetch(url, { signal })
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
  } catch (error) {
    if (signal.aborted) return ''
    console.warn('LRCLIB fetch failed:', error)
  }
  try {
    const url2 = `https://api.qobuzify.app/v2/track?name=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`
    const resp2 = await fetch(url2, { signal })
    if (resp2.ok) {
      const data2 = await resp2.json()
      if (data2.syncedLyrics) return data2.syncedLyrics
      if (data2.lyrics) return data2.lyrics
    }
  } catch (error) {
    if (!signal.aborted) console.warn('Qobuzify fetch failed:', error)
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

/**
 * Folds a backend track payload into state. The backend repeats "track-changed" for the same song when its
 * album or cover arrives late. Those repeats only refresh the cover and never reset position or lyrics.
 */
function mergeTrack(previous: Track, payload: TrackPayload): Track {
  const albumArtUrl = payload.albumArtUrl ?? payload.album_art_url ?? undefined
  if (previous.title === payload.title && previous.artist === payload.artist) {
    return patchTrack(previous, { album: payload.album || undefined, albumArtUrl })
  }
  // A new song starts without the old cover; artwork is looked up if the backend has none yet
  return { ...previous, ...payload, albumArtUrl }
}

export default function App() {
  const appWindow = getCurrentWindow()
  const settingsRef = useRef<HTMLDivElement>(null)
  const [track, setTrack] = useState<Track>({ title: '', artist: '', duration: 0, position: 0, playing: false })
  const [lines, setLines] = useState<LyricLine[]>([])
  const [artwork, setArtwork] = useState<string>()
  const [albumColor, setAlbumColor] = useState<string>()
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  const [layoutStyle, setLayoutStyle] = useState<string>('center')
  const [mode, setMode] = useState<ViewMode>('lyrics')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const windowOpacity = 1
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('')
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(() => loadCustomThemes())
  const [themeDraft, setThemeDraft] = useState<CustomTheme | null>(null)
  const [editingTheme, setEditingTheme] = useState(false)
  const [customLayouts, setCustomLayouts] = useState<CustomLayout[]>(() => loadCustomLayouts())
  const [layoutDraft, setLayoutDraft] = useState<CustomLayout | null>(null)
  const [editingLayout, setEditingLayout] = useState(false)

  // Read by long-lived effects that must see the latest list without re-subscribing
  const customLayoutsRef = useRef(customLayouts)
  customLayoutsRef.current = customLayouts
  const lastLocalChange = useRef(0)
  const durationRef = useRef(0)
  const albumRef = useRef<string | undefined>(undefined)

  // One live clock drives everything time-based:
  // lyrics read it directly (instant, never behind), the progress bar eases toward it.
  const getPosition = usePlaybackClock(track.position, track.playing, `${track.artist}::${track.title}`)
  const activeIndex = useActiveLyricIndex(lines, getPosition)
  const hasTrack = Boolean(track.title.trim())
  durationRef.current = track.duration
  albumRef.current = track.album

  // ---- Derived appearance -------------------------------------------------
  const savedCustom = customThemes.find((item) => item.id === theme.id)
  const activeCustom = themeDraft ?? savedCustom
  const shownTheme = themeDraft ? buildCustomTheme(themeDraft, layoutStyle) : theme
  // Presets follow the album art. A custom theme uses its own accent unless it opts in to album colours.
  const accent = (!activeCustom || activeCustom.albumAccent) && albumColor
    ? albumColor
    : shownTheme.accentColor
  const activeCustomLayout = customLayouts.find((layout) => layout.id === layoutStyle)
  const canvasWidgets = layoutDraft ? layoutDraft.widgets : activeCustomLayout?.widgets
  const cover = track.albumArtUrl || artwork
  const studioOpen = Boolean(themeDraft) || Boolean(layoutDraft) || editingTheme || editingLayout

  useEffect(() => {
    void appWindow.setAlwaysOnTop(false).catch((error) => {
      console.warn('Unable to disable always-on-top:', error)
    })
  }, [appWindow])

  const installUpdate = async (notifyWhenCurrent: boolean) => {
    if (!isTauri()) return

    try {
      const update = await check({ timeout: 30000 })
      if (!update) {
        if (notifyWhenCurrent) setUpdateStatus('You are on the latest version.')
        return
      }
      setUpdateStatus(`Downloading version ${update.version}...`)
      let downloadedBytes = 0
      let totalBytes: number | undefined
      const handleDownloadEvent = (event: DownloadEvent) => {
        if (event.event === 'Started') {
          downloadedBytes = 0
          totalBytes = event.data.contentLength
          setUpdateStatus(totalBytes ? `Downloading version ${update.version} (0 MB / ${formatBytes(totalBytes)})...` : `Downloading version ${update.version}...`)
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength
          setUpdateStatus(totalBytes
            ? `Downloading version ${update.version} (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)})...`
            : `Downloading version ${update.version} (${formatBytes(downloadedBytes)})...`)
        } else {
          setUpdateStatus('Installing update...')
        }
      }
      await update.downloadAndInstall(handleDownloadEvent, { timeout: 10 * 60 * 1000 })
      await relaunch()
    } catch (error) {
      console.error('Update check or installation failed:', error)
      if (notifyWhenCurrent) setUpdateStatus('Update check failed. Try again later.')
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void installUpdate(false)
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [])

  // Event listeners
  useEffect(() => {
    let unlistenTrack: (() => void) | undefined
    let unlistenPosition: (() => void) | undefined
    let unlistenLyrics: (() => void) | undefined
    let disposed = false

    const applyTrack = (payload: TrackPayload) => {
      if (!payload.title?.trim()) return
      setTrack((current) => mergeTrack(current, payload))
      setLyricsLoading(true)
    }

    Promise.all([
      listen<TrackPayload>('track-changed', (event) => applyTrack(event.payload)),
      listen<PositionPayload>('position-updated', (event) => {
        const { position, duration, playing } = event.payload
        setTrack((current) => patchTrack(current, { position, duration, playing }))
      }),
      listen<LyricsPayload>('lyrics-received', (event) => {
        setLines(parseLyricsPayload(event.payload, durationRef.current))
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
        invoke<TrackPayload>('get_current_track').then(applyTrack).catch(() => undefined)
      }
    })

    return () => {
      disposed = true
      unlistenTrack?.()
      unlistenPosition?.()
      unlistenLyrics?.()
    }
  }, [])

  // The backend emits smooth position events. This slower poll is only a
  // recovery path for missed media events after sleep or Spotify reconnects.
  useEffect(() => {
    let active = true
    const refreshTrack = () => {
      invoke<Track>('get_current_track')
        .then((current) => {
          if (!active || !current.title?.trim()) return
          setTrack((previous) => patchTrack(mergeTrack(previous, current), {
            title: current.title,
            artist: current.artist,
            album: current.album,
            position: current.position,
            duration: current.duration,
            playing: current.playing,
            albumArtUrl: current.albumArtUrl,
          }))
        })
        .catch((error) => {
          if (active) console.warn('Unable to refresh Spotify playback state:', error)
        })
    }
    refreshTrack()
    const timer = window.setInterval(refreshTrack, 2000)
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') refreshTrack() }
    window.addEventListener('focus', refreshTrack)
    window.addEventListener('pageshow', refreshTrack)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshTrack)
      window.removeEventListener('pageshow', refreshTrack)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  // Load theme and view mode on mount
  useEffect(() => {
    invoke<Theme>('get_theme').then((value) => {
      const layout = normalizeLayout(value.layout, customLayoutsRef.current)
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

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), LYRICS_DEADLINE_MS)

    const doFetch = async () => {
      // Length and album arrive just after the title; wait a short time for a better match
      for (let waited = 0; durationRef.current <= 0 && waited < DURATION_WAIT_MS && active; waited += 100) {
        await new Promise((resolve) => window.setTimeout(resolve, 100))
      }
      if (!active) return
      const lyrics = await fetchLyricsDirect(track.artist, track.title, controller.signal)
      if (!active) return
      setLines(parseLyricsPayload(lyrics, durationRef.current))
      setLyricsLoading(false)
    }

    doFetch().catch(() => {
      if (!active) return
      setLines([])
      setLyricsLoading(false)
    })

    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [track.title, track.artist])

  // Fetch artwork separately
  useEffect(() => {
    if (!track.title.trim()) return
    if (track.albumArtUrl) {
      setArtwork(track.albumArtUrl)
      return
    }
    let active = true
    setArtwork(undefined)
    fetchArtwork(track.title, track.artist).then((url) => {
      if (active && typeof url === 'string') setArtwork(url)
    }).catch(() => undefined)
    return () => { active = false }
  }, [track.title, track.artist, track.albumArtUrl])

  // Extract accent color from artwork
  useEffect(() => {
    let active = true
    extractDominantColor(artwork).then((color) => {
      if (active) setAlbumColor(color === defaultTheme.accentColor ? undefined : color)
    })
    return () => { active = false }
  }, [artwork])

  // Poll for theme changes. Custom layout ids are local-only and must not be
  // normalized back to a built-in layout by the Rust theme command.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Date.now() - lastLocalChange.current < LOCAL_CHANGE_GRACE_MS) return
      if (theme.id.startsWith('custom-')) return
      invoke<Theme>('get_theme').then((value) => {
        const activeCustomLayout = customLayoutsRef.current.some((item) => item.id === layoutStyle)
        const layout = activeCustomLayout
          ? layoutStyle
          : customLayoutsRef.current.some((item) => item.id === value.layout)
            ? value.layout
            : normalizeLayout(value.layout, customLayoutsRef.current)
        const next = { ...value, layout }
        setTheme((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
        setLayoutStyle(next.layout)
      }).catch(() => undefined)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [layoutStyle, theme.id])

  // Escape closes whichever editor is open without saving
  useEffect(() => {
    if (!studioOpen) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setThemeDraft(null)
      setLayoutDraft(null)
      setEditingTheme(false)
      setEditingLayout(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [studioOpen])

  useEffect(() => {
    if (!settingsOpen) return undefined
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && !settingsRef.current?.contains(target)) setSettingsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [settingsOpen])

  const changeMode = (nextMode: ViewMode) => {
    setMode(nextMode)
    invoke('save_view_mode', { mode: nextMode }).catch(() => undefined)
  }

  const applyTheme = (value: Theme) => {
    lastLocalChange.current = Date.now()
    setTheme(value)
    invoke('save_theme', { theme: value }).catch(() => undefined)
  }

  const selectTheme = (id: string) => {
    if (id === NEW_OPTION) {
      setLayoutDraft(null)
      setThemeDraft(newCustomTheme(shownTheme))
      setEditingTheme(true)
      setSettingsOpen(false)
      return
    }
    const custom = customThemes.find((item) => item.id === id)
    if (custom) {
      setThemeDraft(custom)
      const built = buildCustomTheme(custom, layoutStyle)
      setTheme(built)
      return
    }
    const extraPreset = extraThemePresets[id]
    if (extraPreset) {
      const value = { ...theme, ...extraPreset, id, layout: layoutStyle }
      applyTheme(value)
      return
    }
    invoke<Theme>('save_theme_preset', { id }).then((value) => {
      const layout = normalizeLayout(value.layout, customLayoutsRef.current)
      setTheme({ ...value, layout })
      setLayoutStyle(layout)
    }).catch(() => undefined)
  }

  const openNewTheme = () => {
    setThemeDraft(newCustomTheme(theme))
    setEditingTheme(true)
  }

  const selectLayout = (style: string) => {
    lastLocalChange.current = Date.now()
    setLayoutStyle(style) // apply immediately; the saved value catches up
    const custom = customLayouts.find((layout) => layout.id === style)
    if (custom) {
      const value = { ...theme, layout: style }
      setTheme(value)
      invoke('save_theme', { theme: value }).catch(() => undefined)
      return
    }
    if (!RUST_LAYOUTS.has(style as LayoutId)) {
      const value = { ...theme, layout: style }
      setTheme(value)
      invoke('save_theme', { theme: value }).catch(() => undefined)
      return
    }
    invoke<Theme>('save_layout', { style }).then((value) => {
      setTheme({ ...value, layout: normalizeLayout(value.layout, customLayoutsRef.current) })
    }).catch(() => undefined)
  }

  const selectLayoutOption = (value: string) => {
    if (value === NEW_OPTION) {
      setThemeDraft(null)
      setLayoutDraft(starterLayout())
      setEditingLayout(true)
      setSettingsOpen(false)
      return
    }
    selectLayout(value)
  }

  const openLayoutEditor = (layout?: CustomLayout) => {
    setLayoutDraft(layout ? { ...layout, widgets: layout.widgets.map((widget) => ({ ...widget })) } : starterLayout())
    setEditingLayout(true)
  }

  const saveLayoutDraft = () => {
    if (!layoutDraft?.name.trim()) return
    const saved = { ...layoutDraft, name: layoutDraft.name.trim() }
    const next = customLayouts.some((item) => item.id === saved.id)
      ? customLayouts.map((item) => (item.id === saved.id ? saved : item))
      : [...customLayouts, saved]
    customLayoutsRef.current = next
    setCustomLayouts(next)
    saveCustomLayouts(next)
    setLayoutStyle(saved.id)
    setLayoutDraft(null)
    setEditingLayout(false)
  }

  const deleteLayout = () => {
    if (!activeCustomLayout) return
    const next = customLayouts.filter((item) => item.id !== activeCustomLayout.id)
    customLayoutsRef.current = next
    setCustomLayouts(next)
    saveCustomLayouts(next)
    selectLayout('center')
  }

  const deleteTheme = () => {
    if (!themeDraft) return
    const next = customThemes.filter((item) => item.id !== themeDraft.id)
    setCustomThemes(next)
    saveCustomThemes(next)
    setEditingTheme(false)
    setThemeDraft(null)
    selectTheme('spotify-dark')
  }

  const changeWidgets = (widgets: Widget[]) => setLayoutDraft((draft) => (draft ? { ...draft, widgets } : draft))
  const addWidget = (type: WidgetType) => setLayoutDraft((draft) => (draft ? { ...draft, widgets: [...draft.widgets, makeWidget(type, draft.widgets)] } : draft))
  const resetLayoutDraft = () => setLayoutDraft((draft) => (draft ? { ...draft, widgets: starterLayout().widgets } : draft))

  const toggleMaximize = async () => {
    if (await appWindow.isMaximized()) await appWindow.unmaximize()
    else await appWindow.maximize()
  }

  const canvasData = {
    hasTrack, title: track.title, artist: track.artist, album: track.album, playing: track.playing, duration: track.duration,
    cover, lines, activeIndex, lyricsLoading, getPosition, accent,
  }

  return <main
    className={`app-shell theme-${shownTheme.id} mode-${mode} layout-${canvasWidgets ? 'custom' : layoutStyle}${studioOpen ? ' is-editing' : ''}`}
    onContextMenu={(event) => event.preventDefault()}
    style={{
    '--accent': accent, '--background': shownTheme.backgroundColor, '--secondary': shownTheme.secondaryBackground,
    '--text': shownTheme.textColor, '--muted': shownTheme.mutedTextColor, '--font': shownTheme.fontFamily,
    '--title-size': shownTheme.titleSize, '--artist-size': shownTheme.artistSize, '--lyric-size': shownTheme.lyricSize,
    '--panel-opacity': shownTheme.panelOpacity, '--blur': shownTheme.blurAmount, '--radius': shownTheme.borderRadius,
    '--glow': shownTheme.glow, '--progress-glow': shownTheme.progressGlow,
    opacity: windowOpacity,
  } as CSSProperties}>
    {(mode === 'lyrics' || mode === 'combined' || canvasWidgets) && <AlbumArtBackground image={cover} accent={accent} />}

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
    {editingLayout && layoutDraft
      ? <CustomCanvas widgets={layoutDraft.widgets} editing onChange={changeWidgets} data={canvasData} />
      : canvasWidgets
      ? <CustomCanvas widgets={canvasWidgets} data={canvasData} />
      : mode === 'lyrics' || mode === 'combined'
      ? hasTrack
        ? <div className={`lyrics-content ${mode === 'combined' ? 'combined-content' : ''} ${track.playing ? 'is-playing' : 'is-paused'}`}>
            {mode === 'combined' && <div className="combined-track-card">
              {cover && <img src={cover} alt="" />}
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
          {cover ? <img className="cover-art" src={cover} alt="" /> : <div className="cover-placeholder" />}
          <div className="track-info"><h1>{hasTrack ? track.title : 'Waiting for playback'}</h1><p>{hasTrack ? track.artist : ''}</p></div>
        </div>}

    {editingTheme && themeDraft && (
      <ThemeStudio
        draft={themeDraft}
        isNew={!customThemes.some((item) => item.id === themeDraft.id)}
        onChange={(draft) => {
          setThemeDraft(draft)
          setTheme(buildCustomTheme(draft, layoutStyle))
        }}
        onSave={() => {
          const next = [...customThemes.filter((item) => item.id !== themeDraft.id), themeDraft]
          setCustomThemes(next)
          saveCustomThemes(next)
          setThemeDraft(themeDraft)
          const built = buildCustomTheme(themeDraft, layoutStyle)
          setTheme(built)
          setEditingTheme(false)
        }}
        onCancel={() => {
          setEditingTheme(false)
          setThemeDraft(null)
        }}
        onDelete={deleteTheme}
      />
    )}

    {editingLayout && layoutDraft && (
      <LayoutEditor
        name={layoutDraft.name}
        onName={(name) => setLayoutDraft({ ...layoutDraft, name })}
        onAdd={addWidget}
        onReset={resetLayoutDraft}
        onCancel={() => {
          setEditingLayout(false)
          setLayoutDraft(null)
        }}
        onSave={saveLayoutDraft}
      />
    )}
  </div>

  {/* Bottom bar is ALWAYS present — never hidden for custom layouts */}
  <footer className="bottom-bar">
    <PlaybackProgress getPosition={getPosition} duration={track.duration} accent={accent} />
    <div className="playback-row">
      <ElapsedTime getPosition={getPosition} duration={track.duration} />
      <div className="playback-controls">
        <button aria-label="Previous track" onClick={() => invoke('media_previous')}>◀◀</button>
        <button
          className={`play-button ${track.playing ? 'is-playing' : ''}`}
          aria-label="Play or pause"
          onClick={() => invoke('media_play_pause')}
        >
          {track.playing ? 'Ⅱ' : '▶'}
        </button>
        <button aria-label="Next track" onClick={() => invoke('media_next')}>▶▶</button>
      </div>
      <span>{formatTime(track.duration)}</span>
    </div>

    <div className="settings-wrap" ref={settingsRef}>
      <button
        className="settings-button"
        onClick={() => setSettingsOpen((open) => !open)}
        aria-label="Settings"
      >
        ⚙
      </button>

      {settingsOpen && (
        <div className="settings-panel">
          <span>View mode</span>
          {(['lyrics', 'album', 'combined'] as ViewMode[]).map((item) => (
            <label className="view-mode-option" key={item}>
              <input
                type="radio"
                name="view-mode"
                checked={mode === item}
                onChange={() => changeMode(item)}
              />
              {item[0].toUpperCase() + item.slice(1)}
            </label>
          ))}

          <label className="settings-field">
            Theme
            <select value={theme.id} onChange={(e) => selectTheme(e.target.value)}>
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
              {customThemes.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
              <option value={NEW_OPTION}>＋ Create custom theme…</option>
            </select>
          </label>

          <button onClick={openNewTheme}>＋ New theme</button>
          {themeDraft && customThemes.some((item) => item.id === themeDraft.id) && (
            <button onClick={() => setEditingTheme(true)}>Edit theme</button>
          )}

          <label className="settings-field">
            Layout
            <select value={layoutStyle} onChange={(e) => selectLayoutOption(e.target.value)}>
              {LAYOUTS.map((layout) => (
                <option key={layout.id} value={layout.id}>{layout.label}</option>
              ))}
              {customLayouts.map((layout) => (
                <option key={layout.id} value={layout.id}>{layout.name}</option>
              ))}
              <option value={NEW_OPTION}>＋ Create custom layout…</option>
            </select>
          </label>

          <button onClick={() => openLayoutEditor()}>＋ New layout</button>
          {activeCustomLayout && (
            <>
              <button onClick={() => openLayoutEditor(activeCustomLayout)}>Edit layout</button>
              <button onClick={deleteLayout}>Delete layout</button>
            </>
          )}

          <label>
            <input
              type="checkbox"
              checked={alwaysOnTop}
              onChange={(e) => {
                setAlwaysOnTop(e.target.checked)
                void appWindow.setAlwaysOnTop(e.target.checked)
              }}
            />{' '}
            Always on top
          </label>

          <button onClick={() => void installUpdate(true)}>Check for updates</button>
          {updateStatus && <span className="update-status" role="status">{updateStatus}</span>}
          <button onClick={() => setSettingsOpen(false)}>Close</button>
        </div>
      )}
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