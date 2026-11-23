// GlanceCart mock store: catalog search plus an x402-style pay flow on TON testnet.
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { usdToGram } from '@glancecart/shared'
import { byId, search, CATALOG } from './catalog.ts'
import { tonChain } from './chain.ts'
import { OrderBook, OrderError } from './orders.ts'

const chain = await tonChain()
const book = new OrderBook({ chain, onChange: o => console.log(`order ${o.orderId} → ${o.status}`) })

const app = new Hono()
app.use('*', logger(), cors({ origin: '*', exposeHeaders: ['X-Payment-Required'] }))

app.onError((err, c) => {
  if (err instanceof OrderError) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'internal', detail: err.message }, 500)
})

app.get('/health', c => c.json({ ok: true, products: CATALOG.length, wallet: chain?.address ?? null, network: 'testnet' }))

app.get('/products/search', c => {
  const q = c.req.query('q') ?? ''
  const maxUsd = c.req.query('maxUsd')
  const maxDays = c.req.query('maxDays')
  const results = search({
    q,
    maxUsd: maxUsd ? Number(maxUsd) : null,
    maxDays: maxDays ? Number(maxDays) : null,
    limit: Number(c.req.query('limit') ?? 10),
  })
  return c.json({ results: results.map(p => ({ ...p, gram: usdToGram(p.usd) })) })
})

app.get('/products/:id', c => {
  const p = byId(c.req.param('id'))
  return p ? c.json({ ...p, gram: usdToGram(p.usd) }) : c.json({ error: 'not_found' }, 404)
})

/**
 * x402-style purchase. Without an `X-Payment` header: creates the order and
 * answers 402 with payment requirements. With `X-Payment: base64(JSON {orderId, boc})`:
 * broadcasts the signed transfer and answers 202 (poll GET /orders/:id).
 */
app.post('/orders', async c => {
  const xPayment = c.req.header('X-Payment')
  if (!xPayment) {
    const { productId, payer } = await c.req.json<{ productId: string; payer: string }>()
    const req = book.create(productId, payer)
    c.header('X-Payment-Required', Buffer.from(JSON.stringify(req)).toString('base64'))
    return c.json(req, 402)
  }
  let parsed: { orderId?: string; boc?: string }
  try {
    parsed = JSON.parse(Buffer.from(xPayment, 'base64').toString('utf8'))
  } catch {
    return c.json({ error: 'bad_x_payment' }, 400)
  }
  if (!parsed.orderId || !parsed.boc) return c.json({ error: 'bad_x_payment' }, 400)
  return c.json(await book.pay(parsed.orderId, parsed.boc), 202)
})

app.get('/orders/:id', c => c.json(book.get(c.req.param('id'))))

app.post('/orders/:id/cancel', async c => c.json(await book.cancel(c.req.param('id'))))

const port = Number(process.env.STORE_PORT ?? 8788)
serve({ fetch: app.fetch, port })
console.log(`mock-store on http://localhost:${port} · wallet=${chain?.address ?? 'NOT CONFIGURED (run gen-wallet)'}`)
