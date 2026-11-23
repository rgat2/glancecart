import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Order } from '@glancecart/shared'
import { Store } from '../src/state.ts'
import { callbackToCommand, handleCommand } from '../src/telegram.ts'
import { Receipts } from '../src/receipts.ts'
import { findReorder, reorderCard } from '../src/reorder.ts'
import * as M from '../src/messages.ts'

const ADDR = '0Q' + 'A'.repeat(46)
const CHAT = 4242

function linkedStore() {
  const store = new Store(null)
  store.register(ADDR)
  const code = store.createLinkCode(ADDR)
  return { store, code }
}
const deps = (store: Store) => ({ store, balanceOf: async () => 1.5, fundUrl: 'https://gc.example/fund/' })

describe('telegram bot commands', () => {
  it('links a chat with a one-time code', async () => {
    const { store, code } = linkedStore()
    const r = await handleCommand(deps(store), CHAT, `/start ${code}`)
    expect(r.html).toContain('Linked')
    expect(r.html).toContain('1.5 GRAM')
    expect(store.byAddress(ADDR)!.telegramChatId).toBe(CHAT)
    // code is single-use
    expect((await handleCommand(deps(store), 999, `/start ${code}`)).html).toContain('expired')
  })

  it('refuses commands from unlinked chats', async () => {
    const { store } = linkedStore()
    expect((await handleCommand(deps(store), CHAT, '/status')).html).toContain('No GlanceCart wallet linked')
  })

  it('changes caps with validation and via buttons', async () => {
    const { store, code } = linkedStore()
    await handleCommand(deps(store), CHAT, `/start ${code}`)
    expect((await handleCommand(deps(store), CHAT, '/setcap daily 2')).html).toContain('Caps updated')
    expect(store.byAddress(ADDR)!.caps.dailyGram).toBe(2)
    expect((await handleCommand(deps(store), CHAT, '/setcap daily 500')).html).toContain('❌')
    expect((await handleCommand(deps(store), CHAT, '/setcap purchase 3')).html).toContain('❌') // above the daily cap
    expect(callbackToCommand('cap:purchase:+0.1', store.byAddress(ADDR)!)).toBe('/setcap purchase 0.6')
    expect(callbackToCommand('cap:daily:-5', store.byAddress(ADDR)!)).toBe('/setcap daily 0')
  })

  it('revokes and re-enables', async () => {
    const { store, code } = linkedStore()
    await handleCommand(deps(store), CHAT, `/start ${code}`)
    expect((await handleCommand(deps(store), CHAT, '/revoke')).html).toContain('Revoked')
    expect(store.byAddress(ADDR)!.caps.revoked).toBe(true)
    await handleCommand(deps(store), CHAT, '/enable')
    expect(store.byAddress(ADDR)!.caps.revoked).toBe(false)
  })

  it('top-up message has the fund link and the address', async () => {
    const { store, code } = linkedStore()
    await handleCommand(deps(store), CHAT, `/start ${code}`)
    const r = await handleCommand(deps(store), CHAT, '/topup')
    expect(r.html).toContain(`https://gc.example/fund/?to=${ADDR}&amp;amount=1`)
    expect(r.html).toContain(`<code>${ADDR}</code>`)
  })
})

describe('receipts', () => {
  afterEach(() => vi.unstubAllGlobals())
  const order = (status: Order['status']): Order => ({
    orderId: 'gc-1', productId: 'p01', title: 'USB-C cable 2m braided', usd: 12.4, gram: 0.124, payer: ADDR,
    status, createdAt: 0, paidAt: 1000, cancelUntil: 31_000, txHash: 'ab'.repeat(32),
  })

  it('sends the receipt only after the cancel window, if still paid', async () => {
    const { store, code } = linkedStore()
    store.redeemLinkCode(code, CHAT)
    const sent: string[] = []
    const r = new Receipts(store, 'http://store', { send: async (_c, h) => { sent.push(h) } }, () => 60_000)
    r.onOrderUpdate(store.byAddress(ADDR)!, order('paid'))
    expect(sent).toEqual([]) // nothing during the window
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(order('paid'))))
    await r.finalize(ADDR, 'gc-1')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('GlanceCart receipt')
    expect(sent[0]).toContain('testnet.tonviewer.com/transaction/')
    await r.finalize(ADDR, 'gc-1') // no duplicate
    expect(sent).toHaveLength(1)
  })

  it('sends a refund note instead when cancelled', async () => {
    const { store, code } = linkedStore()
    store.redeemLinkCode(code, CHAT)
    const sent: string[] = []
    const r = new Receipts(store, 'http://store', { send: async (_c, h) => { sent.push(h) } }, () => 60_000)
    r.onOrderUpdate(store.byAddress(ADDR)!, order('paid'))
    r.onOrderUpdate(store.byAddress(ADDR)!, order('refunded'))
    await new Promise(res => setTimeout(res, 0))
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(order('refunded'))))
    await r.finalize(ADDR, 'gc-1')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('Order cancelled')
    expect(store.byAddress(ADDR)!.history[0].status).toBe('refunded')
  })

  it('daily summary lists paid items and refunds', () => {
    const { store } = linkedStore()
    const w = store.update(ADDR, r => {
      r.history.push({ orderId: 'a', productId: 'p11', title: 'Coffee beans house blend 1kg', usd: 22, gram: 0.22, paidAt: 10, status: 'paid' })
      r.history.push({ orderId: 'b', productId: 'p01', title: 'USB-C cable', usd: 12.4, gram: 0.124, paidAt: 20, status: 'refunded' })
      r.spends.push({ orderId: 'a', gram: 0.22, at: 10, status: 'paid' })
    })
    const t = M.summary(w, 1000)
    expect(t).toContain('1 purchase · 0.22 GRAM')
    expect(t).toContain('Coffee beans')
    expect(t).toContain('1 cancelled and refunded')
  })
})

describe('reorder', () => {
  const h = (title: string, paidAt: number, status: 'paid' | 'refunded' = 'paid') =>
    ({ orderId: title, productId: 'p11', title, usd: 22, gram: 0.22, paidAt, status })
  const history = [h('Coffee beans house blend 1kg', 1), h('AA batteries 12-pack', 2), h('Coffee beans dark roast 1kg', 3, 'refunded')]

  it('finds the latest paid matching purchase', () => {
    expect(findReorder(history, 'coffee beans')!.title).toBe('Coffee beans house blend 1kg')
    expect(findReorder(history, 'battery')!.title).toBe('AA batteries 12-pack')
    expect(findReorder(history, '')!.title).toBe('AA batteries 12-pack')
    expect(findReorder(history, 'same as last time')!.title).toBe('AA batteries 12-pack')
    expect(findReorder(history, 'tea')).toBeNull()
  })

  it('builds a "same as last time" card with the current price', () => {
    const p = { id: 'p11', title: 'Coffee beans house blend 1kg', category: 'grocery', tags: [], usd: 22, rating: 4.6, deliveryDays: 2, stock: 5 }
    const card = reorderCard(h('Coffee beans house blend 1kg', Date.UTC(2026, 10, 20, 12)), p, new Date(2026, 10, 23))
    expect(card.why).toBe('same as last time (Nov 20)')
    expect(card.gram).toBe(0.22)
    expect(reorderCard(h('x', 0), { ...p, usd: 23.5 }).why).toContain('$1.50 more')
  })
})
