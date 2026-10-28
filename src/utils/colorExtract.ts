/** Samples artwork pixels and returns a CSS color for the visual accent. */
export async function extractDominantColor(url?: string): Promise<string> {
  if (!url) return '#1DB954'
  try {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 24
    const context = canvas.getContext('2d')
    if (!context) return '#1DB954'
    context.drawImage(image, 0, 0, 24, 24)
    const pixels = context.getImageData(0, 0, 24, 24).data
    let r = 0; let g = 0; let b = 0; let count = 0
    for (let i = 0; i < pixels.length; i += 16) {
      r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; count += 1
    }
    return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`
  } catch {
    return '#1DB954'
  }
}
