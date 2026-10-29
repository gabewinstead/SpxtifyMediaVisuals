import { WIDGET_INFO, type WidgetType } from '../utils/customLayouts'

type Props = {
  name: string
  onName: (name: string) => void
  onAdd: (type: WidgetType) => void
  onReset: () => void
  onCancel: () => void
  onSave: () => void
}

/** Toolbar shown above the canvas while a custom layout is being edited. */
export function LayoutEditor({ name, onName, onAdd, onReset, onCancel, onSave }: Props) {
  return <div className="studio-bar" role="toolbar" aria-label="Layout editor">
    <input
      className="studio-name"
      value={name}
      maxLength={32}
      placeholder="Layout name"
      aria-label="Layout name"
      onChange={(event) => onName(event.target.value)}
    />
    <select
      className="studio-add"
      value=""
      aria-label="Add widget"
      onChange={(event) => { if (event.target.value) onAdd(event.target.value as WidgetType) }}
    >
      <option value="">＋ Add widget…</option>
      {(Object.keys(WIDGET_INFO) as WidgetType[]).map((type) => <option key={type} value={type}>{WIDGET_INFO[type].label}</option>)}
    </select>
    <button className="studio-button" onClick={onReset}>Reset</button>
    <button className="studio-button" onClick={onCancel}>Cancel</button>
    <button className="studio-button primary" onClick={onSave} disabled={!name.trim()}>Save layout</button>
    <p className="studio-hint">Drag a box to move it. Drag its corner to resize. Text scales with the box.</p>
  </div>
}
