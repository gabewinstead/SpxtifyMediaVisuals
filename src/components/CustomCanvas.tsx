import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { LyricsDisplay } from './LyricsDisplay'
import { Controls, ProgressRow } from './PlaybackWidgets'
import type { LyricLine } from '../utils/lrcParser'
import { MIN_WIDGET_SIZE, WIDGET_INFO, type Widget, type WidgetType } from '../utils/customLayouts'

export type CanvasData = {
  hasTrack: boolean
  title: string
  artist: string
  playing: boolean
  duration: number
  cover?: string
  lines: LyricLine[]
  activeIndex: number
  lyricsLoading: boolean
  getPosition: () => number
  accent: string
}

type Props = {
  widgets: Widget[]
  data: CanvasData
  /** Shows outlines and handles and lets widgets be dragged, resized and removed. */
  editing?: boolean
  onChange?: (widgets: Widget[]) => void
}

const SAMPLE_LINES: LyricLine[] = [
  { time: 0, text: 'Your lyrics appear here' },
  { time: 1, text: 'One line at a time' },
  { time: 2, text: 'Highlighted as the song plays' },
  { time: 3, text: 'Resize this box to resize the text' },
  { time: 4, text: 'Drag it wherever you like' },
]

const snap = (value: number) => Math.round(value * 2) / 2
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Lays widgets out by percentage of the window. The same component renders the live view and the editor. */
export function CustomCanvas({ widgets, data, editing = false, onChange }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const widgetsRef = useRef(widgets)
  widgetsRef.current = widgets
  const stopDrag = useRef<(() => void) | null>(null)
  const [selected, setSelected] = useState<string>()

  // Drop any window listeners if the canvas unmounts mid-drag
  useEffect(() => () => stopDrag.current?.(), [])

  const begin = (event: ReactPointerEvent, widget: Widget, mode: 'move' | 'resize') => {
    if (!editing || !onChange || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return

    setSelected(widget.id)
    onChange([...widgetsRef.current.filter((item) => item.id !== widget.id), widget]) // bring to front
    stopDrag.current?.()

    const startX = event.clientX
    const startY = event.clientY
    const move = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - startX) / rect.width) * 100
      const dy = ((moveEvent.clientY - startY) / rect.height) * 100
      const next = mode === 'move'
        ? { x: clamp(snap(widget.x + dx), 0, 100 - widget.w), y: clamp(snap(widget.y + dy), 0, 100 - widget.h) }
        : {
            w: clamp(snap(widget.w + dx), MIN_WIDGET_SIZE, 100 - widget.x),
            h: clamp(snap(widget.h + dy), MIN_WIDGET_SIZE, 100 - widget.y),
          }
      onChange(widgetsRef.current.map((item) => (item.id === widget.id ? { ...item, ...next } : item)))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      stopDrag.current = null
    }
    stopDrag.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  const remove = (id: string) => onChange?.(widgetsRef.current.filter((item) => item.id !== id))
  const preview = editing && !data.hasTrack

  return <div ref={canvasRef} className={`custom-canvas${editing ? ' is-editing' : ''}`} onPointerDown={() => setSelected(undefined)}>
    {widgets.map((widget) => <div
      key={widget.id}
      className={`widget widget-${widget.type}${editing ? ' is-editing' : ''}${selected === widget.id ? ' is-selected' : ''}`}
      style={{ left: `${widget.x}%`, top: `${widget.y}%`, width: `${widget.w}%`, height: `${widget.h}%` }}
      onPointerDown={(event) => begin(event, widget, 'move')}
    >
      <div className="widget-body">{renderWidget(widget.type, data, preview)}</div>
      {editing && <>
        <span className="widget-tag">{WIDGET_INFO[widget.type].label}</span>
        <button
          className="widget-remove"
          aria-label={`Remove ${WIDGET_INFO[widget.type].label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => remove(widget.id)}
        >×</button>
        <span className="widget-resize" onPointerDown={(event) => begin(event, widget, 'resize')} />
      </>}
    </div>)}
  </div>
}

function renderWidget(type: WidgetType, data: CanvasData, preview: boolean) {
  switch (type) {
    case 'lyrics': return <LyricsWidget data={data} preview={preview} />
    case 'cover': return data.cover
      ? <img className="widget-cover" src={data.cover} alt="" draggable={false} />
      : <div className="widget-cover cover-placeholder" />
    case 'track': return <div className="widget-track">
      <h1>{data.hasTrack ? data.title : preview ? 'Song title' : 'Waiting for playback'}</h1>
      <p>{data.hasTrack ? data.artist : preview ? 'Artist name' : ''}</p>
    </div>
    case 'progress': return <ProgressRow getPosition={data.getPosition} duration={data.duration} accent={data.accent} />
    case 'controls': return <Controls playing={data.playing} />
    case 'line': return <p key={data.activeIndex} className="widget-line">
      {data.lines[data.activeIndex]?.text ?? (preview ? 'The current lyric line' : '')}
    </p>
    case 'clock': return <Clock />
    default: return null
  }
}

function LyricsWidget({ data, preview }: { data: CanvasData; preview: boolean }) {
  if (preview) {
    return <div className="lyrics-content is-playing"><LyricsDisplay lines={SAMPLE_LINES} activeIndex={2} /></div>
  }
  if (!data.hasTrack) return <p className="lyrics-status">Waiting for playback...</p>
  if (data.lyricsLoading) return <p className="lyrics-status">Loading lyrics...</p>
  if (data.lines.length === 0) return <p className="lyrics-status">No lyrics available</p>
  return <div className={`lyrics-content ${data.playing ? 'is-playing' : 'is-paused'}`}>
    <LyricsDisplay lines={data.lines} activeIndex={data.activeIndex} />
  </div>
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <time className="widget-clock">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
}
