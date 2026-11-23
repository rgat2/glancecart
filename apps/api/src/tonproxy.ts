// Read-mostly relay from the phone to toncenter testnet, so the toncenter key
// stays on the server. Only the JSON-RPC methods the wallet needs are allowed.
import { Hono } from 'hono'

const ALLOWED = new Set([
  'getAddressInformation', 'getAddressBalance', 'getAddressState', 'getWalletInformation',
  'runGetMethod', 'getTransactions', 'sendBoc', 'sendBocReturnHash', 'estimateFee', 'getMasterchainInfo',
])

const MAX_RETRIES = 3
const RETRY_MS = 1200

export function tonProxy(env = process.env) {
  const endpoint = env.TONCENTER_ENDPOINT ?? 'https://testnet.toncenter.com/api/v2/jsonRPC'
  if (!endpoint.includes('testnet')) throw new Error('TONCENTER_ENDPOINT must be a testnet endpoint')
  const key = env.TONCENTER_API_KEY
  // Without a key toncenter allows ~1 request/s: space calls out.
  const gapMs = key ? 0 : 1100
  let last = 0
  let queue: Promise<unknown> = Promise.resolve()

  const app = new Hono()
  app.post('/ton/jsonRPC', async c => {
    const body = await c.req.json<{ method?: string }>()
    if (!body.method || !ALLOWED.has(body.method)) return c.json({ ok: false, error: 'method_not_allowed' }, 403)
    const run = queue.then(async () => {
      // Other local callers (the store's payment watcher) share toncenter's per-IP
      // limit, so a 429 can still happen: retry it a few times with backoff.
      for (let attempt = 0; ; attempt++) {
        const wait = last + gapMs - Date.now()
        if (wait > 0) await new Promise(r => setTimeout(r, wait))
        last = Date.now()
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) },
          body: JSON.stringify(body),
        })
        if (res.status !== 429 || attempt >= MAX_RETRIES) return res
        await res.body?.cancel()
        await new Promise(r => setTimeout(r, RETRY_MS * (attempt + 1)))
      }
    })
    queue = run.catch(() => undefined)
    const res = await run
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } })
  })
  return app
}
