// Typed HTTP errors. Every code maps to one readable line on the glasses (apps/glasses/src/api.ts).
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 502 | 503

export class HttpError extends Error {
  constructor(public status: ErrorStatus, message: string) {
    super(message)
  }
}

/** fetch() to the store; a network failure becomes `store_unavailable` instead of a 500. */
export async function storeFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) })
  } catch {
    throw new HttpError(502, 'store_unavailable')
  }
}
