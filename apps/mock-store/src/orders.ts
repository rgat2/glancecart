// Order lifecycle for the mock store (x402-style):
//   create → 402 PaymentRequired → pay(boc) → confirming → paid → (cancel within 30 s → refunded)
import { randomBytes } from 'node:crypto'
import { CANCEL_WINDOW_MS, TON_TESTNET, usdToGram, type Order, type PaymentRequired } from '@glancecart/shared'
import { gramToNano } from '@glancecart/shared/ton'
import type { Chain } from './chain.ts'
import { byId } from './catalog.ts'

const QUOTE_TTL_MS = 5 * 60_000
const CONFIRM_TIMEOUT_MS = 120_000
const POLL_MS = 3_000

export class OrderError extends Error {
  constructor(public status: 400 | 404 | 409 | 410 | 502 | 503, message: string) {
    super(message)
  }
}

export interface OrderBookOpts {
  chain: Chain | null
  now?: () => number
  pollMs?: number
  confirmTimeoutMs?: number
  onChange?: (o: Order) => void
}

export class OrderBook {
  private orders = new Map<string, Order>()
  private quotes = new Map<string, PaymentRequired>()
  private now: () => number
  constructor(private opts: OrderBookOpts) {
    this.now = opts.now ?? Date.now
  }

  private chain(): Chain {
    if (!this.opts.chain) throw new OrderError(503, 'store_wallet_not_configured')
    return this.opts.chain
  }

  private set(o: Order) {
    this.orders.set(o.orderId, o)
    this.opts.onChange?.(o)
  }

  get(orderId: string): Order {
    const o = this.orders.get(orderId)
    if (!o) throw new OrderError(404, 'order_not_found')
    return o
  }

  /** New order for `productId`; returns the 402 payment requirements. */
  create(productId: string, payer: string): PaymentRequired {
    const chain = this.chain()
    const p = byId(productId)
    if (!p) throw new OrderError(404, 'product_not_found')
    if (p.stock <= 0) throw new OrderError(409, 'out_of_stock')
    if (!payer) throw new OrderError(400, 'payer_required')
    const orderId = `gc-${randomBytes(5).toString('hex')}`
    const gram = usdToGram(p.usd)
    const now = this.now()
    this.set({ orderId, productId, title: p.title, usd: p.usd, gram, payer, status: 'awaiting_payment', createdAt: now })
    const req: PaymentRequired = {
      x402Version: 1,
      error: 'payment_required',
      orderId,
      accepts: [{
        scheme: 'exact', network: TON_TESTNET, asset: 'GRAM',
        amount: gramToNano(gram).toString(), payTo: chain.address, memo: orderId, expiresAt: now + QUOTE_TTL_MS,
      }],
    }
    this.quotes.set(orderId, req)
    return req
  }

  /** Accepts the buyer's signed transfer, broadcasts it and starts watching for it on-chain. */
  async pay(orderId: string, boc: string): Promise<Order> {
    const o = this.get(orderId)
    if (o.status !== 'awaiting_payment') throw new OrderError(409, `order_${o.status}`)
    const req = this.quotes.get(orderId)!.accepts[0]
    if (this.now() > req.expiresAt) {
      this.set({ ...o, status: 'expired' })
      throw new OrderError(410, 'quote_expired')
    }
    await this.chain().broadcast(boc)
    const next: Order = { ...o, status: 'confirming' }
    this.set(next)
    void this.watch(orderId, BigInt(req.amount))
    return next
  }

  private async watch(orderId: string, minNano: bigint) {
    const deadline = this.now() + (this.opts.confirmTimeoutMs ?? CONFIRM_TIMEOUT_MS)
    const o = this.get(orderId)
    while (this.now() < deadline) {
      try {
        const hash = await this.chain().findPayment(orderId, o.payer, minNano)
        if (hash) {
          const paidAt = this.now()
          this.set({ ...this.get(orderId), status: 'paid', txHash: hash, paidAt, cancelUntil: paidAt + CANCEL_WINDOW_MS })
          return
        }
      } catch (err) {
        console.warn(`watch ${orderId}:`, (err as Error).message)
      }
      await new Promise(r => setTimeout(r, this.opts.pollMs ?? POLL_MS))
    }
    this.set({ ...this.get(orderId), status: 'failed', error: 'payment_not_seen' })
  }

  /** Refunds a paid order if still inside the cancel window. */
  async cancel(orderId: string): Promise<Order> {
    const o = this.get(orderId)
    if (o.status !== 'paid') throw new OrderError(409, `order_${o.status}`)
    if (this.now() > (o.cancelUntil ?? 0)) throw new OrderError(410, 'cancel_window_closed')
    this.set({ ...o, status: 'refunding' })
    try {
      await this.chain().refund(o.payer, gramToNano(o.gram), `refund ${orderId}`)
      const done: Order = { ...this.get(orderId), status: 'refunded' }
      this.set(done)
      return done
    } catch (err) {
      // Refund broadcast failed: keep the order paid so it can be retried.
      console.warn(`refund ${orderId} failed:`, (err as Error).message)
      this.set({ ...this.get(orderId), status: 'paid', error: 'refund_failed' })
      throw new OrderError(502, 'refund_failed')
    }
  }
}
