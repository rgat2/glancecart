// Keeps purchase history and sends Telegram receipts once the 30 s cancel window
// has closed (so a cancelled order never gets a "paid" receipt).
import type { Order } from '@glancecart/shared'
import type { Store, WalletRecord } from './state.ts'
import * as M from './messages.ts'

export interface Notifier {
  send(chatId: number, html: string): Promise<void>
}

export class Receipts {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  constructor(
    private store: Store,
    private storeUrl: string,
    private notifier: Notifier | null,
    private delayFor = (o: Order) => Math.max(0, (o.cancelUntil ?? Date.now()) - Date.now()) + 1500,
  ) {}

  /** Called by the purchase routes whenever an order reaches paid / refunded / failed. */
  onOrderUpdate = (w: WalletRecord, o: Order) => {
    if (o.status === 'paid') {
      this.store.update(w.address, r => {
        if (!r.history.some(h => h.orderId === o.orderId)) {
          r.history.push({
            orderId: o.orderId, productId: o.productId, title: o.title, usd: o.usd, gram: o.gram,
            paidAt: o.paidAt ?? Date.now(), txHash: o.txHash, status: 'paid',
          })
          r.history = r.history.slice(-100)
        }
      })
      this.schedule(w.address, o)
    } else if (o.status === 'refunded') {
      clearTimeout(this.timers.get(o.orderId))
      const r = this.store.update(w.address, rec => {
        const h = rec.history.find(x => x.orderId === o.orderId)
        if (h) { h.status = 'refunded'; h.receiptSent = true }
      })
      const h = r.history.find(x => x.orderId === o.orderId)
      if (h && r.telegramChatId != null) void this.notify(r.telegramChatId, M.refunded(h))
    }
  }

  private schedule(address: string, o: Order) {
    if (this.timers.has(o.orderId)) return
    this.timers.set(o.orderId, setTimeout(() => void this.finalize(address, o.orderId), this.delayFor(o)))
  }

  /** After the cancel window: re-read the order and send the receipt if it's still paid. */
  async finalize(address: string, orderId: string) {
    this.timers.delete(orderId)
    const res = await fetch(`${this.storeUrl}/orders/${encodeURIComponent(orderId)}`).catch(() => null)
    const order = res?.ok ? ((await res.json()) as Order) : null
    if (order?.status === 'refunded' || order?.status === 'refunding') return
    const w = this.store.byAddress(address)
    const h = w?.history.find(x => x.orderId === orderId)
    if (!w || !h || h.receiptSent || h.status !== 'paid') return
    this.store.update(address, r => {
      const e = r.history.find(x => x.orderId === orderId)
      if (e) e.receiptSent = true
    })
    if (w.telegramChatId != null) await this.notify(w.telegramChatId, M.receipt(w, h))
  }

  private async notify(chatId: number, html: string) {
    try {
      await this.notifier?.send(chatId, html)
    } catch (err) {
      console.warn('telegram send failed:', (err as Error).message)
    }
  }
}

/** Sends the daily summary once a day at `hourUtc` to every linked wallet. */
export function startDailySummary(store: Store, notifier: Notifier, hourUtc = Number(process.env.SUMMARY_HOUR_UTC ?? 18)) {
  let lastDay = ''
  return setInterval(() => {
    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    if (now.getUTCHours() !== hourUtc || day === lastDay) return
    lastDay = day
    for (const w of store.linked()) void notifier.send(w.telegramChatId!, M.summary(w)).catch(() => undefined)
  }, 60_000)
}
