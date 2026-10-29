import type { CSSProperties } from 'react'

type Props = { image?: string; accent: string }

/**
 * Renders the full-bleed artwork wash used by cover-based modes.
 * The accent is passed as a CSS variable and blended in the stylesheet with color-mix, so it works with
 * any colour format (hex, rgb(), hsl()), unlike appending an alpha suffix to the string.
 */
export function AlbumArtBackground({ image, accent }: Props) {
  const style = { backgroundImage: image ? `url("${image}")` : undefined, '--tint': accent } as CSSProperties
  return <div className="art-background" style={style} />
}
