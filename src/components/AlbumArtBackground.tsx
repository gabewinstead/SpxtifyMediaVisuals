type Props = { image?: string; accent: string }
/** Renders the full-bleed artwork wash used by cover-based modes. */
export function AlbumArtBackground({ image, accent }: Props) {
  return <div className="art-background" style={{ backgroundImage: image ? `linear-gradient(180deg, ${accent}55 0%, #121212 92%), url("${image}")` : undefined }} />
}
