import type { CSSProperties } from 'react'
import { hsl, type CustomTheme, type Hsl } from '../utils/themes'

type Props = {
  draft: CustomTheme
  isNew: boolean
  onChange: (draft: CustomTheme) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}

const HUE_TRACK = 'linear-gradient(90deg, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))'

type SliderProps = {
  label: string
  value: number
  min?: number
  max: number
  unit?: string
  track?: string
  onChange: (value: number) => void
}

function Slider({ label, value, min = 0, max, unit = '', track, onChange }: SliderProps) {
  return <label className="studio-slider">
    <span className="studio-slider-label">{label}<output>{value}{unit}</output></span>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      style={track ? ({ '--track': track } as CSSProperties) : undefined}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
}

function ColorControl({ label, value, onChange }: { label: string; value: Hsl; onChange: (value: Hsl) => void }) {
  const set = (patch: Partial<Hsl>) => onChange({ ...value, ...patch })
  return <fieldset className="studio-color">
    <legend><span className="studio-swatch" style={{ background: hsl(value) }} />{label}</legend>
    <Slider label="Hue" max={360} value={value.h} track={HUE_TRACK} onChange={(h) => set({ h })} />
    <Slider
      label="Saturation" max={100} unit="%" value={value.s}
      track={`linear-gradient(90deg, hsl(${value.h} 0% ${value.l}%), hsl(${value.h} 100% ${value.l}%))`}
      onChange={(s) => set({ s })}
    />
    <Slider
      label="Lightness" max={100} unit="%" value={value.l}
      track={`linear-gradient(90deg, #000, hsl(${value.h} ${value.s}% 50%), #fff)`}
      onChange={(l) => set({ l })}
    />
  </fieldset>
}

/** Side panel for building a theme. The app behind it updates live as the sliders move. */
export function ThemeStudio({ draft, isNew, onChange, onSave, onCancel, onDelete }: Props) {
  const set = (patch: Partial<CustomTheme>) => onChange({ ...draft, ...patch })
  return <aside className="studio-panel" aria-label="Theme editor">
    <header className="studio-header">
      <h2>{isNew ? 'New theme' : 'Edit theme'}</h2>
      <input
        className="studio-name"
        value={draft.name}
        maxLength={32}
        placeholder="Theme name"
        aria-label="Theme name"
        onChange={(event) => set({ name: event.target.value })}
      />
    </header>

    <ColorControl label="Accent" value={draft.accent} onChange={(accent) => set({ accent })} />
    <ColorControl label="Background" value={draft.background} onChange={(background) => set({ background })} />
    <ColorControl label="Text" value={draft.text} onChange={(text) => set({ text })} />

    <fieldset className="studio-color">
      <legend>Style</legend>
      <Slider label="Background blur" max={80} unit="px" value={draft.blur} onChange={(blur) => set({ blur })} />
      <Slider label="Lyrics size" min={20} max={64} unit="px" value={draft.lyricSize} onChange={(lyricSize) => set({ lyricSize })} />
      <Slider label="Glow" max={100} value={draft.glow} onChange={(glow) => set({ glow })} />
      <label className="studio-check">
        <input type="checkbox" checked={draft.albumAccent} onChange={(event) => set({ albumAccent: event.target.checked })} />
        Use album art colours for the accent
      </label>
    </fieldset>

    <footer className="studio-actions">
      {!isNew && <button className="studio-button danger" onClick={onDelete}>Delete</button>}
      <span className="studio-spacer" />
      <button className="studio-button" onClick={onCancel}>Cancel</button>
      <button className="studio-button primary" onClick={onSave} disabled={!draft.name.trim()}>Save theme</button>
    </footer>
  </aside>
}
