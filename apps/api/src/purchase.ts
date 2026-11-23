// Purchase routes: the API checks caps server-side, relays the x402 flow to the
// store, and keeps the spend ledger. It never sees a private key: the phone sends
// an already-signed transfer (BoC).
import { Hono, type Context } from 'hono'
import {
  capLeft, checkPurchase, spentLast24h, validateCaps, explorerTx,
  type Order, type PaymentRequired, type WalletRecordView,
} from '@glancecart/shared'
import type { Store, WalletRecord } from './state.ts'
import { HttpError, storeFetch } from './errors.ts'

export interface PurchaseDeps {
  store: Store
  storeUrl: string
  /** Called when an order reaches a final state (receipts, Telegram). */
  onOrderUpdate?: (w: WalletRecord, o: Order) => void
}

export function walletView(w: WalletRecord): WalletRecordView {
  return {
    address: w.address,
    caps: w.caps,
    spentGram: spentLast24h(w.spends),
    capLeftGram: capLeft(w.caps, w.spends),
    telegramLinked: w.telegramChatId != null,
  }
}

type Env = { Variables: { wallet: WalletRecord } }

export function purchaseRoutes(deps: PurchaseDeps) {
  const { store, storeUrl } = deps
  const app = new Hono<Env>()
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'internal' }, 500)
  })

  const auth = async (c: Context<Env>, next: () => Promise<void>) => {
    const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')
    const w = token ? store.byToken(token) : null
    if (!w) return c.json({ error: 'unauthorized' }, 401)
    c.set('wallet', w)
    await next()
  }

  /** Register an agent wallet address. Returns a bearer token the first time only. */
  app.post('/wallets', async c => {
    const { address } = await c.req.json<{ address: string }>()
    if (!/^[A-Za-z0-9_-]{48}$/.test(address ?? '')) return c.json({ error: 'bad_address' }, 400)
    const token = store.register(address)
    if (!token) return c.json({ error: 'already_registered' }, 409)
    return c.json({ token, wallet: walletView(store.byAddress(address)!) })
  })

  app.get('/wallets/me', auth, c => c.json(walletView(c.get('wallet'))))

  app.put('/wallets/me/caps', auth, async c => {
    const w = c.get('wallet')
    const next = validateCaps(await c.req.json(), w.caps)
    if ('error' in next) return c.json(next, 400)
    return c.json(walletView(store.update(w.address, r => { r.caps = next })))
  })

  /** Step 1: quote. Server-side cap check, then the store answers 402 with requirements. */
  app.post('/purchase/quote', auth, async c => {
    const w = c.get('wallet')
    const { productId } = await c.req.json<{ productId: string }>()
    const pRes = await storeFetch(`${storeUrl}/products/${encodeURIComponent(productId)}`)
    if (!pRes.ok) return c.json({ error: 'product_not_found' }, 404)
    const product = (await pRes.json()) as { gram: number; stock: number }
    if (product.stock <= 0) return c.json({ error: 'out_of_stock' }, 409)
    const check = checkPurchase(w.caps, w.spends, product.gram)
    if (!check.ok) return c.json({ error: check.reason, wallet: walletView(w) }, 403)

    const res = await storeFetch(`${storeUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, payer: w.address }),
    })
    const body = await res.json()
    if (res.status !== 402) return c.json(body, res.status as 400)
    return c.json({ payment: body as PaymentRequired, wallet: walletView(w) })
  })

  /** Step 2: pay. Re-checks caps, records a pending spend, relays the signed transfer as X-Payment. */
  app.post('/purchase/pay', auth, async c => {
    const w = c.get('wallet')
    const { orderId, boc, gram } = await c.req.json<{ orderId: string; boc: string; gram: number }>()
    const order = await getOrder(orderId)
    if (!order || order.payer !== w.address) return c.json({ error: 'order_not_found' }, 404)
    if (Math.abs(order.gram - gram) > 1e-9) return c.json({ error: 'amount_mismatch' }, 400)
    const check = checkPurchase(w.caps, w.spends, order.gram)
    if (!check.ok) return c.json({ error: check.reason }, 403)

    store.update(w.address, r => { r.spends.push({ orderId, gram: order.gram, at: Date.now(), status: 'pending' }) })
    const res = await storeFetch(`${storeUrl}/orders`, {
      method: 'POST',
      headers: { 'X-Payment': Buffer.from(JSON.stringify({ orderId, boc })).toString('base64') },
    })
    const body = (await res.json()) as Order & { error?: string }
    if (!res.ok) {
      markSpend(w, orderId, 'failed')
      return c.json(body, res.status as 400)
    }
    return c.json(body, 202)
  })

  /** Poll an order; syncs the spend ledger with the store's status. */
  app.get('/purchase/:orderId', auth, async c => {
    const w = c.get('wallet')
    const order = await getOrder(c.req.param('orderId')!)
    if (!order || order.payer !== w.address) return c.json({ error: 'order_not_found' }, 404)
    syncSpend(w, order)
    return c.json({ ...order, explorer: order.txHash ? explorerTx(order.txHash) : null })
  })

  app.post('/purchase/:orderId/cancel', auth, async c => {
    const w = c.get('wallet')
    const orderId = c.req.param('orderId')!
    const order = await getOrder(orderId)
    if (!order || order.payer !== w.address) return c.json({ error: 'order_not_found' }, 404)
    const res = await storeFetch(`${storeUrl}/orders/${orderId}/cancel`, { method: 'POST' })
    const body = (await res.json()) as Order
    if (res.ok) syncSpend(w, body)
    return c.json(body, res.status as 200)
  })

  async function getOrder(orderId: string): Promise<Order | null> {
    const res = await storeFetch(`${storeUrl}/orders/${encodeURIComponent(orderId)}`)
    return res.ok ? ((await res.json()) as Order) : null
  }

  function markSpend(w: WalletRecord, orderId: string, status: 'pending' | 'paid' | 'refunded' | 'failed') {
    store.update(w.address, r => {
      const s = r.spends.find(x => x.orderId === orderId)
      if (s) s.status = status
    })
  }

  function syncSpend(w: WalletRecord, o: Order) {
    const status = o.status === 'paid' ? 'paid'
      : o.status === 'refunded' ? 'refunded'
      : o.status === 'failed' || o.status === 'expired' ? 'failed'
      : null
    const prev = w.spends.find(x => x.orderId === o.orderId)?.status
    if (!status || prev === status) return
    markSpend(w, o.orderId, status)
    deps.onOrderUpdate?.(store.byAddress(w.address)!, o)
  }

  return app
}
