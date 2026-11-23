// Downscales a phone photo before upload (faster on mobile data, cheaper to analyze).

export const MAX_SIDE = 1024

/** Returns JPEG base64 (no data: prefix), longest side ≤ MAX_SIDE. */
export async function downscale(base64: string, mimeType: string): Promise<{ base64: string; mediaType: string }> {
  const src = base64.startsWith('data:') ? base64 : `data:${mimeType || 'image/jpeg'};base64,${base64}`
  const img = new Image()
  img.src = src
  await img.decode()
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  const out = canvas.toDataURL('image/jpeg', 0.82)
  return { base64: out.slice(out.indexOf(',') + 1), mediaType: 'image/jpeg' }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
