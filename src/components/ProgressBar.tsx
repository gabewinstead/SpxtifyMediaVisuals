type Props = { position: number; duration: number; accent: string }
/** Renders the thin playback progress indicator. */
export function ProgressBar({ position, duration, accent }: Props) {
  const percent = duration > 0 ? Math.min(100, Math.max(0, position / duration * 100)) : 0
  return <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%`, backgroundColor: accent }} /><span className="progress-dot" style={{ left: `${percent}%`, backgroundColor: accent }} /></div>
}
