// Client for the GlanceCart API. No secrets here: the API holds the provider keys;
// the only credential is this phone's wallet token for its own settings.
import type { AskResponse } from '@glancecart/shared'
import { ERROR_LINES } from './errors'

// Default: same host as the page, port 8787 (works in the simulator and via `evenhub qr` on the LAN).
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) || `${location.protocol}//${location.hostname}:8787`

export class ApiError extends Error {
  constructor(public code: string, public status: number) {
    super(code)
  }
}

let token = ''
export const setToken = (t: string) => { token = t }

async function request<T>(method: string, path: string, body: BodyInit | undefined, contentType: string | null, timeoutMs = 25_000): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new ApiError((err as Error)?.name === 'TimeoutError' ? 'timeout' : 'offline', 0)
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(json.error ?? `http_${res.status}`, res.status)
  return json
}

export const authed = <T>(method: string, path: string, body?: unknown) =>
  request<T>(method, path, body === undefined ? undefined : JSON.stringify(body), body === undefined ? null : 'application/json')

export const askAudio = (wav: Uint8Array<ArrayBuffer>) => request<AskResponse>('POST', '/ask', wav, 'audio/wav')
export const askText = (text: string) => request<AskResponse>('POST', '/ask', JSON.stringify({ text }), 'application/json')

export interface SnapResponse extends AskResponse {
  snap: { label: string; shelfPriceUsd: number | null }
}
export const askPhoto = (imageBase64: string, mediaType: string) =>
  request<SnapResponse>('POST', '/snap', JSON.stringify({ imageBase64, mediaType }), 'application/json', 40_000)

export { ERROR_LINES } from './errors'

export function errorCode(err: unknown): string {
  return err instanceof ApiError ? err.code : 'internal'
}

export function errorLine(err: unknown): string {
  return ERROR_LINES[errorCode(err)] ?? 'Something went wrong'
}
