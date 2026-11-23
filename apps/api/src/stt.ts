// Speech-to-text behind a swappable provider interface.
// Input: a WAV file (16 kHz, 16-bit mono PCM, as produced by the glasses app).

export interface SttProvider {
  name: string
  transcribe(wav: Uint8Array<ArrayBuffer>): Promise<string>
}

/** Deepgram pre-recorded API. https://developers.deepgram.com/reference/listen-file */
export function deepgram(apiKey: string, model = 'nova-3'): SttProvider {
  return {
    name: `deepgram:${model}`,
    async transcribe(wav) {
      const url = `https://api.deepgram.com/v1/listen?model=${model}&smart_format=true&language=en`
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/wav' },
        body: wav,
      })
      if (!res.ok) throw new Error(`deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const json = (await res.json()) as {
        results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> }
      }
      return json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? ''
    },
  }
}

/** OpenAI-compatible Whisper endpoint (e.g. a self-hosted server). Swap-in option. */
export function whisper(baseUrl: string, apiKey: string, model = 'whisper-1'): SttProvider {
  return {
    name: `whisper:${model}`,
    async transcribe(wav) {
      const form = new FormData()
      form.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav')
      form.append('model', model)
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      })
      if (!res.ok) throw new Error(`whisper ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return (((await res.json()) as { text?: string }).text ?? '').trim()
    },
  }
}

/** Picks the provider from env: STT_PROVIDER=deepgram (default) | whisper. */
export function sttFromEnv(env = process.env): SttProvider | null {
  const which = env.STT_PROVIDER ?? 'deepgram'
  if (which === 'whisper' && env.WHISPER_BASE_URL) return whisper(env.WHISPER_BASE_URL, env.WHISPER_API_KEY ?? '')
  if (which === 'deepgram' && env.DEEPGRAM_API_KEY) return deepgram(env.DEEPGRAM_API_KEY)
  return null
}
