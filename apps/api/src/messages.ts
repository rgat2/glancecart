// Telegram message text (HTML parse mode). Pure functions for testing.
import { capLeft, explorerTx, spentLast24h, explorerAddress, type Caps } from '@glancecart/shared'
import type { HistoryEntry, WalletRecord } from './state.ts'

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const g = (n: number) => `${Number(n.toFixed(4))} GRAM`
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

function time(ms: number, tz = 'Asia/Dubai'): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz })
}

export function receipt(w: WalletRecord, h: HistoryEntry): string {
  return [
    '🧾 <b>GlanceCart receipt</b>',
    esc(h.title),
    `$${h.usd.toFixed(2)} · ${g(h.gram)} (testnet)`,
    `Order <code>${esc(h.orderId)}</code> · paid ${time(h.paidAt)}`,
    h.txHash ? `<a href="${explorerTx(h.txHash)}">View payment on TON testnet</a>` : null,
    '',
    `Cap left today: ${g(capLeft(w.caps, w.spends))}`,
  ].filter(l => l !== null).join('\n')
}

export function refunded(h: HistoryEntry): string {
  return [
    '↩️ <b>Order cancelled</b>',
    esc(h.title),
    `Refund of ${g(h.gram)} sent back to your agent wallet.`,
    `Order <code>${esc(h.orderId)}</code>`,
  ].join('\n')
}

export function capsText(c: Caps): string {
  return c.revoked
    ? '⛔ Agent wallet is <b>revoked</b>. Purchases are blocked.'
    : `Per purchase: <b>${g(c.perPurchaseGram)}</b>\nPer 24 h: <b>${g(c.dailyGram)}</b>`
}

export function status(w: WalletRecord, balanceGram: number | null): string {
  return [
    '👓 <b>GlanceCart agent wallet</b> (testnet)',
    `<a href="${explorerAddress(w.address)}">${short(w.address)}</a>`,
    `Balance: <b>${balanceGram == null ? 'unavailable' : g(balanceGram)}</b>`,
    `Spent in last 24 h: ${g(spentLast24h(w.spends))} · left: ${g(capLeft(w.caps, w.spends))}`,
    '',
    capsText(w.caps),
  ].join('\n')
}

export function summary(w: WalletRecord, now = Date.now()): string {
  const day = w.history.filter(h => now - h.paidAt < 24 * 3600_000)
  const paid = day.filter(h => h.status === 'paid')
  const lines = paid.slice(-5).map(h => `• ${esc(h.title)} · ${g(h.gram)}`)
  return [
    '📊 <b>GlanceCart daily summary</b>',
    paid.length ? `${paid.length} purchase${paid.length === 1 ? '' : 's'} · ${g(spentLast24h(w.spends, now))}` : 'No purchases in the last 24 h.',
    ...lines,
    day.length > paid.length ? `${day.length - paid.length} cancelled and refunded` : null,
    '',
    `Cap left: ${g(capLeft(w.caps, w.spends, now))} of ${g(w.caps.dailyGram)}`,
  ].filter(l => l !== null).join('\n')
}

export function topUp(address: string, fundUrl: string | null): string {
  return [
    '💎 <b>Top up your agent wallet</b> (testnet GRAM)',
    fundUrl ? `<a href="${esc(`${fundUrl}?to=${address}&amount=1`)}">Fund from Gram Wallet</a> (TON Connect)` : null,
    `Or send test GRAM to:\n<code>${address}</code>`,
    'Only deposit what you want the agent to be able to spend: the balance is the hard limit.',
  ].filter(l => l !== null).join('\n')
}

export const HELP = [
  '<b>GlanceCart</b>: voice shopping on Even G2, paid from a capped testnet agent wallet.',
  '',
  '/status: balance, spend and caps',
  '/caps: view and adjust caps',
  '/setcap daily 2 · /setcap purchase 0.5',
  '/topup: fund the agent wallet',
  '/summary: last 24 h',
  '/revoke: block all purchases now',
  '/enable: allow purchases again',
].join('\n')
