import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Store } from '../src/state.ts'
import { purchaseRoutes } from '../src/purchase.ts'

const ADDR = '0Q' + 'A'.repeat(46)
const PRODUCTS: Record<string, { gram: number; stock: number }> = { p01: { gram: 0.124, stock: 5 }, p08: { gram: 0.59, stock: 5 } }
let orders: Record<string, { orderId: string; payer: string; gram: number; status: string }>
let storeCalls: string[]

beforeEach(() => {
  orders = {}
  storeCalls = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const u = new URL(url)
    storeCalls.push(`${init?.method ?? 'GET'} ${u.pathname}`)
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    const m = u.pathname.match(/^\/products\/(\w+)$/)
    if (m) return PRODUCTS[m[1]] ? json(PRODUCTS[m[1]]) : json({ error: 'not_found' }, 404)
    if (u.pathname === '/orders' && !(init?.headers as Record<string, string>)?.['X-Payment']) {
      const { productId, payer } = JSON.parse(String(init!.body))
      const orderId = `gc-${Object.keys(orders).length}`
      orders[orderId] = { orderId, payer, gram: PRODUCTS[productId].gram, status: 'awaiting_payment' }
      return json({ x402Version: 1, orderId, accepts: [{ amount: '124000000', memo: orderId }] }, 402)
    }
    if (u.pathname === '/orders') {
      const { orderId } = JSON.parse(Buffer.from((init!.headers as Record<string, string>)['X-Payment'], 'base64').toString())
      orders[orderId].status = 'confirming'
      return json(orders[orderId], 202)
    }
    const o = u.pathname.match(/^\/orders\/([\w-]+)$/)
    if (o) return orders[o[1]] ? json(orders[o[1]]) : json({ error: 'order_not_found' }, 404)
    return json({ error: 'x' }, 500)
  })
})
afterEach(() => vi.unstubAllGlobals())

function setup() {
  const store = new Store(null)
  const updates: string[] = []
  const app = purchaseRoutes({ store, storeUrl: 'http://store', onOrderUpdate: (_w, o) => updates.push(o.status) })
  const req = (method: string, path: string, body?: unknown, token?: string) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  return { store, req, updates }
}

describe('purchase routes', () => {
  it('registers once and requires the token', async () => {
    const { req } = setup()
    const r1 = await req('POST', '/wallets', { address: ADDR })
    const { token } = await r1.json()
    expect(token).toBeTruthy()
    expect((await req('POST', '/wallets', { address: ADDR })).status).toBe(409)
    expect((await req('GET', '/wallets/me')).status).toBe(401)
    expect((await (await req('GET', '/wallets/me', undefined, token)).json()).capLeftGram).toBe(1)
  })

  it('blocks a purchase over the per-purchase cap before creating a store order', async () => {
    const { req } = setup()
    const { token } = await (await req('POST', '/wallets', { address: ADDR })).json()
    const r = await req('POST', '/purchase/quote', { productId: 'p08' }, token)
    expect(r.status).toBe(403)
    expect((await r.json()).error).toBe('over_purchase_cap')
    expect(storeCalls).toEqual(['GET /products/p08'])
  })

  it('quotes, pays (pending spend), and syncs paid status', async () => {
    const { req, store, updates } = setup()
    const { token } = await (await req('POST', '/wallets', { address: ADDR })).json()
    const q = await (await req('POST', '/purchase/quote', { productId: 'p01' }, token)).json()
    const orderId = q.payment.orderId
    expect((await req('POST', '/purchase/pay', { orderId, boc: 'BOC', gram: 0.124 }, token)).status).toBe(202)
    expect(store.byAddress(ADDR)!.spends[0]).toMatchObject({ orderId, status: 'pending', gram: 0.124 })

    orders[orderId].status = 'paid'
    await req('GET', `/purchase/${orderId}`, undefined, token)
    expect(store.byAddress(ADDR)!.spends[0].status).toBe('paid')
    expect(updates).toEqual(['paid'])
    const me = await (await req('GET', '/wallets/me', undefined, token)).json()
    expect(me.capLeftGram).toBe(0.876)
  })

  it('rejects amount mismatch and foreign orders', async () => {
    const { req } = setup()
    const { token } = await (await req('POST', '/wallets', { address: ADDR })).json()
    const q = await (await req('POST', '/purchase/quote', { productId: 'p01' }, token)).json()
    expect((await req('POST', '/purchase/pay', { orderId: q.payment.orderId, boc: 'B', gram: 0.001 }, token)).status).toBe(400)
    const other = '0Q' + 'B'.repeat(46)
    const { token: t2 } = await (await req('POST', '/wallets', { address: other })).json()
    expect((await req('GET', `/purchase/${q.payment.orderId}`, undefined, t2)).status).toBe(404)
  })

  it('maps an unreachable store to store_unavailable', async () => {
    const { req } = setup()
    const { token } = await (await req('POST', '/wallets', { address: ADDR })).json()
    vi.stubGlobal('fetch', async () => { throw new TypeError('fetch failed') })
    const r = await req('POST', '/purchase/quote', { productId: 'p01' }, token)
    expect(r.status).toBe(502)
    expect((await r.json()).error).toBe('store_unavailable')
  })

  it('validates cap changes and honors revoke', async () => {
    const { req } = setup()
    const { token } = await (await req('POST', '/wallets', { address: ADDR })).json()
    expect((await req('PUT', '/wallets/me/caps', { dailyGram: 99 }, token)).status).toBe(400)
    expect((await req('PUT', '/wallets/me/caps', { revoked: true }, token)).status).toBe(200)
    expect((await (await req('POST', '/purchase/quote', { productId: 'p01' }, token)).json()).error).toBe('revoked')
  })
})
