// Wraps raw PCM chunks from the G2 mic (s16le, 16 kHz, mono) in a WAV container.

export const SAMPLE_RATE = 16_000

export function pcmToWav(chunks: Uint8Array[], sampleRate = SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const dataLen = chunks.reduce((n, c) => n + c.byteLength, 0)
  const out = new Uint8Array(44 + dataLen)
  const v = new DataView(out.buffer)
  const ascii = (off: number, s: string) => [...s].forEach((ch, i) => v.setUint8(off + i, ch.charCodeAt(0)))
  ascii(0, 'RIFF')
  v.setUint32(4, 36 + dataLen, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  v.setUint32(16, 16, true) // fmt chunk size
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true) // byte rate
  v.setUint16(32, 2, true) // block align
  v.setUint16(34, 16, true) // bits per sample
  ascii(36, 'data')
  v.setUint32(40, dataLen, true)
  let off = 44
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

/** Seconds of audio in the given PCM byte count. */
export const pcmSeconds = (bytes: number, sampleRate = SAMPLE_RATE) => bytes / (sampleRate * 2)
