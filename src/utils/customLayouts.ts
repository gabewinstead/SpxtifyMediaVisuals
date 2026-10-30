import { loadJson, saveJson } from './storage'

export type WidgetType = 'lyrics' | 'cover' | 'track' | 'line' | 'clock' | 'status' | 'lyric-count' | 'date'

/** Position and size are percentages of the window, so layouts scale with it. */
export type Widget = { id: string; type: WidgetType; x: number; y: number; w: number; h: number }
export type CustomLayout = { id: string; name: string; widgets: Widget[] }

export const WIDGET_INFO: Record<WidgetType, { label: string; w: number; h: number }> = {
  lyrics: { label: 'Lyrics', w: 50, h: 66 },
  cover: { label: 'Cover art', w: 24, h: 42 },
  track: { label: 'Title and artist', w: 30, h: 12 },
  line: { label: 'Current line only', w: 60, h: 20 },
  clock: { label: 'Clock', w: 14, h: 10 },
  status: { label: 'Playback status', w: 20, h: 8 },
  'lyric-count': { label: 'Lyric count', w: 20, h: 8 },
  date: { label: 'Date', w: 24, h: 8 },
}

export const MIN_WIDGET_SIZE = 6

const LAYOUTS_KEY = 'lyrics.customLayouts'

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Places a new widget near the middle, nudged so repeated adds don't stack exactly. */
export function makeWidget(type: WidgetType, existing: Widget[]): Widget {
  const { w, h } = WIDGET_INFO[type]
  const nudge = (existing.length % 5) * 3
  return {
    id: uid('w'), type, w, h,
    x: Math.min(100 - w, Math.max(0, (100 - w) / 2 + nudge)),
    y: Math.min(100 - h, Math.max(0, (100 - h) / 2 + nudge)),
  }
}

/** The layout every new custom layout starts from: cover and details on the left, lyrics on the right. */
export function starterLayout(): CustomLayout {
  const widget = (type: WidgetType, x: number, y: number, w: number, h: number): Widget => ({ id: uid('w'), type, x, y, w, h })
  return {
    id: uid('my'),
    name: 'My layout',
    widgets: [
      widget('cover', 6, 14, 24, 42),
      widget('track', 6, 58, 30, 12),
      widget('lyrics', 40, 10, 54, 68),
      widget('status', 6, 82, 24, 8),
      widget('clock', 70, 82, 24, 8),
    ],
  }
}

function isWidget(value: unknown): value is Widget {
  const w = value as Widget
  return Boolean(w) && typeof w.id === 'string' && w.type in WIDGET_INFO
    && [w.x, w.y, w.w, w.h].every((n) => typeof n === 'number' && Number.isFinite(n))
}

export function loadCustomLayouts(): CustomLayout[] {
  const stored = loadJson<unknown>(LAYOUTS_KEY, [])
  if (!Array.isArray(stored)) return []
  return stored
    .filter((item): item is CustomLayout => {
      const l = item as CustomLayout
      return Boolean(l) && typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.widgets)
    })
    .map((layout) => ({ ...layout, widgets: layout.widgets.filter(isWidget) }))
}

export function saveCustomLayouts(layouts: CustomLayout[]): void {
  saveJson(LAYOUTS_KEY, layouts)
}
