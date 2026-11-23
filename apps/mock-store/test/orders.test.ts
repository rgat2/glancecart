import { describe, expect, it, vi } from 'vitest'
import type { Chain } from '../src/chain.ts'
import { OrderBook } from '../src/orders.ts'

const PAYER = '0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPpz'

function fakeChain(found: boolean | (() => boolean) = true) {
  const chain: Chain & { refunds: Array<[string, bigint, string]> } = {
    address: 'STORE',
    refunds: [],
    broadcast: vi.fn(async () => {}),
    findPayment: vi.fn(async (memo: string) => ((typeof found === 'function' ? found() : found) ? `hash-${memo}` : null)),
    refund: vi.fn(async (to: string, nano: bigint, comment: string) => { chain.refunds.push([to, nano, comment]) }),
  }
  return chain
}

const until = async (fn: () => boolean) => { for (let i = 0; i < 50 && !fn(); i++) await new Promise(r => setTimeout(r, 5)) }

describe('order book (x402 flow)', () => {
  it('quotes in nanograms with the order id as memo', () => {
    const book = new OrderBook({ chain: fakeChain() })
    const req = book.create('p01', PAYER)
    expect(req.accepts[0]).toMatchObject({ amount: '124000000', payTo: 'STORE', memo: req.orderId, network: 'tvm:-3' })
    expect(book.get(req.orderId).status).toBe('awaiting_payment')
  })

  it('pays, confirms on-chain, and refunds inside the cancel window', async () => {
    let t = 1_000
    const chain = fakeChain()
    const book = new OrderBook({ chain, now: () => t, pollMs: 1 })
    const { orderId } = book.create('p01', PAYER)
    expect((await book.pay(orderId, 'BOC')).status).toBe('confirming')
    await until(() => book.get(orderId).status === 'paid')
    const paid = book.get(orderId)
    expect(paid).toMatchObject({ status: 'paid', txHash: `hash-${orderId}`, cancelUntil: paid.paidAt! + 30_000 })
    t += 10_000
    expect((await book.cancel(orderId)).status).toBe('refunded')
    expect(chain.refunds).toEqual([[PAYER, 124_000_000n, `refund ${orderId}`]])
  })

  it('refuses cancel after 30 s', async () => {
    let t = 1_000
    const book = new OrderBook({ chain: fakeChain(), now: () => t, pollMs: 1 })
    const { orderId } = book.create('p01', PAYER)
    await book.pay(orderId, 'BOC')
    await until(() => book.get(orderId).status === 'paid')
    t += 31_000
    await expect(book.cancel(orderId)).rejects.toThrow('cancel_window_closed')
  })

  it('fails the order when the payment never shows up', async () => {
    let t = 0
    const book = new OrderBook({ chain: fakeChain(false), now: () => (t += 1_000), pollMs: 1, confirmTimeoutMs: 5_000 })
    const { orderId } = book.create('p01', PAYER)
    await book.pay(orderId, 'BOC')
    await until(() => book.get(orderId).status === 'failed')
    expect(book.get(orderId).error).toBe('payment_not_seen')
  })

  it('rejects double pay, expired quotes, out of stock, missing wallet', async () => {
    let t = 0
    const book = new OrderBook({ chain: fakeChain(), now: () => t, pollMs: 1 })
    const a = book.create('p01', PAYER)
    await book.pay(a.orderId, 'BOC')
    await expect(book.pay(a.orderId, 'BOC')).rejects.toThrow(/order_/)
    const b = book.create('p02', PAYER)
    t += 6 * 60_000
    await expect(book.pay(b.orderId, 'BOC')).rejects.toThrow('quote_expired')
    expect(() => book.create('p41', PAYER)).toThrow('out_of_stock')
    expect(() => new OrderBook({ chain: null }).create('p01', PAYER)).toThrow('store_wallet_not_configured')
  })
})
