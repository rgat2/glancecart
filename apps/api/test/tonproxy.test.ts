import { afterEach, describe, expect, it, vi } from 'vitest'
import { tonProxy } from '../src/tonproxy.ts'

const env = { TONCENTER_ENDPOINT: 'https://testnet.toncenter.com/api/v2/jsonRPC', TONCENTER_API_KEY: 'test-key' }
const rpc = (method: string) =>
  new Request('http://x/ton/jsonRPC', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method }) })

afterEach(() => vi.unstubAllGlobals())

describe('tonProxy', () => {
  it('rejects methods outside the allow-list', async () => {
    const res = await tonProxy(env).fetch(rpc('sendMessageToEveryone'))
    expect(res.status).toBe(403)
  })

  it('refuses a mainnet endpoint', () => {
    expect(() => tonProxy({ TONCENTER_ENDPOINT: 'https://toncenter.com/api/v2/jsonRPC' })).toThrow(/testnet/)
  })

  it('retries a 429 from toncenter and returns the later success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"ok":false}', { status: 429 }))
      .mockResolvedValueOnce(new Response('{"ok":true,"result":"5"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await tonProxy(env).fetch(rpc('getAddressBalance'))
    vi.useRealTimers()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, result: '5' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
