import { loadJson, saveJson } from './storage'

export type Theme = {
  id: string; name: string; layout: string
  accentColor: string; backgroundColor: string; secondaryBackground: string
  textColor: string; mutedTextColor: string; fontFamily: string; titleSize: string
  artistSize: string; lyricSize: string; panelOpacity: number; blurAmount: string; borderRadius: string
  glow: string; progressGlow: string
}

export type Hsl = { h: number; s: number; l: number }

/** A user-made theme. Colours are stored as HSL numbers so the sliders can edit them losslessly. */
export type CustomTheme = {
  id: string; name: string
  accent: Hsl; background: Hsl; text: Hsl
  blur: number; lyricSize: number; glow: number
  /** Tint the UI with colours sampled from the album art instead of the accent colour. */
  albumAccent: boolean
}

export const FALLBACK_ACCENT = '#1DB954'

export const defaultTheme: Theme = {
  id: 'spotify-dark', name: 'Spotify Dark', layout: 'center',
  accentColor: FALLBACK_ACCENT, backgroundColor: '#121212', secondaryBackground: '#181818',
  textColor: '#FFFFFF', mutedTextColor: '#C4C4C4', fontFamily: 'Inter, Arial, sans-serif',
  titleSize: '32px', artistSize: '18px', lyricSize: '42px', panelOpacity: 0.72,
  blurAmount: '42px', borderRadius: '12px',
  glow: '0 0 24px rgba(29, 185, 84, 0.35)', progressGlow: 'none',
}

function preset(id: string, name: string, overrides: Partial<Theme>): Theme {
  return { ...defaultTheme, id, name, ...overrides }
}

/** Built-in themes. Muted colours are kept bright enough to read comfortably on their backgrounds. */
export const THEME_PRESETS: Theme[] = [
  defaultTheme,
  preset('midnight', 'Midnight', {
    backgroundColor: 'linear-gradient(180deg, #0a0a1f, #1b1240)', secondaryBackground: '#16163a',
    textColor: '#F5F3FF', mutedTextColor: '#C7C4E6', accentColor: '#818CF8',
    glow: '0 0 28px rgba(129, 140, 248, 0.45)',
  }),
  preset('sunset', 'Sunset', {
    backgroundColor: 'linear-gradient(180deg, #1f0d0d, #47190f)', secondaryBackground: '#2e1512',
    textColor: '#FFF7ED', mutedTextColor: '#FDC9A0', accentColor: '#FB923C',
    glow: '0 0 28px rgba(251, 146, 60, 0.4)',
  }),
  preset('ocean', 'Ocean', {
    backgroundColor: 'linear-gradient(180deg, #06161f, #0a2c3d)', secondaryBackground: '#0c2733',
    textColor: '#ECFEFF', mutedTextColor: '#A5E8F3', accentColor: '#22D3EE',
    glow: '0 0 28px rgba(34, 211, 238, 0.38)',
  }),
  preset('ember', 'Ember', {
    backgroundColor: 'linear-gradient(180deg, #1a0808, #2d0f0a)', secondaryBackground: '#2a1212',
    textColor: '#FFF5F0', mutedTextColor: '#E0B8A4', accentColor: '#F97316',
    glow: '0 0 28px rgba(249, 115, 22, 0.4)',
  }),
  preset('aurora', 'Aurora', {
    backgroundColor: 'linear-gradient(180deg, #06140d, #0c2a1d)', secondaryBackground: '#0f2518',
    textColor: '#F0FFF4', mutedTextColor: '#9FE0B1', accentColor: '#34D399',
    glow: '0 0 28px rgba(52, 211, 153, 0.38)',
  }),
  preset('rose', 'Rose', {
    backgroundColor: 'linear-gradient(180deg, #1a0a12, #33121f)', secondaryBackground: '#2a1220',
    textColor: '#FFF0F5', mutedTextColor: '#F0B3CC', accentColor: '#FB7185',
    glow: '0 0 28px rgba(251, 113, 133, 0.4)',
  }),
  preset('ghost', 'Ghost', {
    backgroundColor: '#000000', secondaryBackground: '#0a0a0a',
    textColor: '#FFFFFF', mutedTextColor: '#A8A8A8', accentColor: '#FFFFFF',
    glow: '0 0 20px rgba(255, 255, 255, 0.12)',
  }),
  preset('neon', 'Neon', {
    backgroundColor: '#0a0a0a', secondaryBackground: '#171717',
    textColor: '#FFFFFF', mutedTextColor: '#B49AC9', accentColor: '#FF2BD6',
    glow: '0 0 12px #ff2bd6, 0 0 34px rgba(255, 43, 214, 0.35)', progressGlow: '0 0 10px #ff2bd6',
  }),
  preset('light', 'Light Mode', {
    backgroundColor: '#F4F4F6', secondaryBackground: '#FFFFFF',
    textColor: '#16161A', mutedTextColor: '#55555F', accentColor: '#16A34A',
    glow: '0 0 18px rgba(22, 163, 74, 0.18)',
  }),
]

export function findPreset(id: string): Theme | undefined {
  return THEME_PRESETS.find((theme) => theme.id === id)
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function hsl(color: Hsl, alpha?: number): string {
  const base = `${Math.round(color.h)} ${Math.round(color.s)}% ${Math.round(color.l)}%`
  return alpha === undefined ? `hsl(${base})` : `hsl(${base} / ${alpha})`
}

function rgbToHsl(red: number, green: number, blue: number): Hsl {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const lightness = (max + min) / 2
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  let hue = 0
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  return { h: Math.round(hue), s: Math.round(saturation * 100), l: Math.round(lightness * 100) }
}

/**
 * Best-effort conversion of a CSS colour (#rgb, #rrggbb, rgb(), hsl() or a gradient containing one of
 * those) to HSL, so a new custom theme can start from the colours already on screen.
 */
export function parseColor(value: string, fallback: Hsl): Hsl {
  const hex = /#([0-9a-f]{3}|[0-9a-f]{6})\b/i.exec(value)
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    return rgbToHsl(parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16))
  }
  const rgb = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value)
  if (rgb) return rgbToHsl(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]))
  const hslMatch = /hsla?\(\s*(\d+)[\s,]+(\d+)%[\s,]+(\d+)%/i.exec(value)
  if (hslMatch) return { h: Number(hslMatch[1]), s: Number(hslMatch[2]), l: Number(hslMatch[3]) }
  return fallback
}

// ---------------------------------------------------------------------------
// Custom themes
// ---------------------------------------------------------------------------

export function buildCustomTheme(custom: CustomTheme, layout: string): Theme {
  const glowBlur = Math.round(12 + custom.glow * 0.5)
  const glowAlpha = (0.15 + custom.glow * 0.004).toFixed(2)
  return {
    ...defaultTheme,
    id: custom.id,
    name: custom.name,
    layout,
    accentColor: hsl(custom.accent),
    backgroundColor: hsl(custom.background),
    secondaryBackground: hsl({ ...custom.background, l: clamp(custom.background.l + 4, 0, 100) }),
    textColor: hsl(custom.text),
    mutedTextColor: hsl(custom.text, 0.8),
    blurAmount: `${custom.blur}px`,
    lyricSize: `${custom.lyricSize}px`,
    glow: custom.glow > 0 ? `0 0 ${glowBlur}px ${hsl(custom.accent, Number(glowAlpha))}` : 'none',
    progressGlow: 'none',
  }
}

/** Starts a new custom theme from whatever theme is currently showing. */
export function newCustomTheme(from: Theme): CustomTheme {
  return {
    id: `custom-${Date.now().toString(36)}`,
    name: 'My theme',
    accent: parseColor(from.accentColor, { h: 141, s: 73, l: 42 }),
    background: parseColor(from.backgroundColor, { h: 240, s: 20, l: 8 }),
    text: parseColor(from.textColor, { h: 0, s: 0, l: 100 }),
    blur: parseInt(from.blurAmount, 10) || 42,
    lyricSize: parseInt(from.lyricSize, 10) || 42,
    glow: 40,
    albumAccent: false,
  }
}

/** Whether the theme's background is light, which flips the glass surfaces and text shadows. */
export function themeTone(theme: Theme, custom?: CustomTheme): 'light' | 'dark' {
  if (custom) return custom.background.l > 55 ? 'light' : 'dark'
  return theme.id === 'light' ? 'light' : 'dark'
}

const THEMES_KEY = 'lyrics.customThemes'

function isHsl(value: unknown): value is Hsl {
  const v = value as Hsl
  return Boolean(v) && [v.h, v.s, v.l].every((n) => typeof n === 'number' && Number.isFinite(n))
}

export function loadCustomThemes(): CustomTheme[] {
  const stored = loadJson<unknown>(THEMES_KEY, [])
  if (!Array.isArray(stored)) return []
  return stored.filter((item): item is CustomTheme => {
    const t = item as CustomTheme
    return Boolean(t) && typeof t.id === 'string' && typeof t.name === 'string'
      && isHsl(t.accent) && isHsl(t.background) && isHsl(t.text)
  }).map((t) => ({
    ...t,
    blur: Number.isFinite(t.blur) ? t.blur : 42,
    lyricSize: Number.isFinite(t.lyricSize) ? t.lyricSize : 42,
    glow: Number.isFinite(t.glow) ? t.glow : 40,
    albumAccent: Boolean(t.albumAccent),
  }))
}

export function saveCustomThemes(themes: CustomTheme[]): void {
  saveJson(THEMES_KEY, themes)
}
