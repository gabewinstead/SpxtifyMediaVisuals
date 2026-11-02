import { FALLBACK_ACCENT, hsl, parseColor } from './themes'

/**
 * Samples artwork pixels and returns a CSS colour for the accent.
 *
 * Pixels are weighted by how vivid they are, so a grey or black border doesn't drag the result to mud, and
 * the lightness is kept in a range that stays visible on both dark and light backgrounds.
 */
export async function extractDominantColor(url?: string): Promise<string> {
  if (!url) return FALLBACK_ACCENT
  try {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    await image.decode()

    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) return FALLBACK_ACCENT
    context.drawImage(image, 0, 0, size, size)
    const pixels = context.getImageData(0, 0, size, size).data

    let r = 0
    let g = 0
    let b = 0
    let total = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue
      const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2])
      const min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2])
      const spread = 255 - Math.abs(max + min - 255)
      const saturation = spread === 0 ? 0 : (max - min) / spread
      const midtone = 1 - Math.abs(max + min - 255) / 255
      const weight = 0.02 + saturation * saturation * midtone
      r += pixels[i] * weight
      g += pixels[i + 1] * weight
      b += pixels[i + 2] * weight
      total += weight
    }
    if (total === 0) return FALLBACK_ACCENT

    const average = parseColor(`rgb(${Math.round(r / total)}, ${Math.round(g / total)}, ${Math.round(b / total)})`, { h: 141, s: 73, l: 42 })
    return hsl({ ...average, l: Math.min(68, Math.max(42, average.l)) })
  } catch {
    return FALLBACK_ACCENT
  }
}
