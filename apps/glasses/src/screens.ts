// Glasses screen copy. Pure functions so every screen can be unit-tested
// against the display budget (≤ 8 lines, ≈ 46 chars per line).
// Glyphs: ASCII plus "·" and "★" only. "✓" and "…" are not in the G2 font.
import type { OptionCard } from '@glancecart/shared'

export const MAX_LINES = 8
export const MAX_CHARS = 46

/** Clip one line to the width budget. */
export function clip(s: string, max = MAX_CHARS): string {
  return s.length <= max ? s : s.slice(0, max - 3).trimEnd() + '...'
}

function lines(...ls: Array<string | false | null | undefined>): string {
  const out = ls.filter((l): l is string => typeof l === 'string').map(l => clip(l))
  while (out.length && out[out.length - 1] === '') out.pop() // a trailing "\n" adds a scrollbar
  return out.join('\n')
}

export const fmtUsd = (n: number) => `$${n.toFixed(2)}`
export const fmtGram = (n: number) => `${Number(n.toFixed(4))} GRAM`

export interface HomeWallet {
  balanceGram: number
  capLeftGram: number
  revoked: boolean
}

export function home(w?: HomeWallet | null, hint?: string, walletOffline = false): string {
  const walletLine = !w ? (walletOffline ? 'Wallet offline · retrying' : 'Wallet: connecting...')
    : w.revoked ? 'Agent wallet revoked'
    : `Wallet ${fmtGram(w.balanceGram)} · cap left ${fmtGram(w.capLeftGram)}`
  return lines(
    'GlanceCart',
    walletLine,
    '',
    'Tap, then say what you need',
    '"USB-C cable under 15 dollars"',
    '',
    hint ?? 'Tap = talk   Swipe = snap a photo',
    'Double tap = exit',
  )
}

export function snapping(): string {
  return lines('Snap a product', '', 'Take the photo with your phone camera', '', 'Double tap = cancel')
}

export function listening(seconds: number): string {
  return lines('Listening... ' + seconds + 's', '', 'Say what to buy', '', 'Tap = done   Double tap = cancel')
}

export function thinking(transcript?: string, photo = false): string {
  if (photo) return lines('Looking at your photo...', '', 'Comparing with online prices')
  return lines(transcript ? `"${transcript}"` : 'Got it', '', 'Searching the store...')
}

export function card(i: number, n: number, o: OptionCard): string {
  return lines(
    `${i + 1}/${n}  ${o.title}`,
    `${fmtUsd(o.usd)} · ${fmtGram(o.gram)} · arrives ${o.arrives}`,
    `Why: ${o.why}`,
    '',
    n > 1 ? 'Tap = select   Swipe = next' : 'Tap = select',
    'Double tap = back',
  )
}

export interface WalletView {
  balanceGram: number
  capLeftGram: number
  perPurchaseGram: number
}

export type Block = 'revoked' | 'over_purchase_cap' | 'over_daily_cap' | 'insufficient_balance' | 'invalid_amount' | null

function blockLine(b: Exclude<Block, null>, w: WalletView): string[] {
  switch (b) {
    case 'over_purchase_cap': return [`Over per-purchase cap (${fmtGram(w.perPurchaseGram)})`, 'Raise it in Telegram or on phone']
    case 'over_daily_cap': return [`Daily cap: only ${fmtGram(w.capLeftGram)} left`, 'Raise it in Telegram or on phone']
    case 'insufficient_balance': return [`Not enough GRAM (${fmtGram(w.balanceGram)})`, 'Top up from Gram Wallet on phone']
    case 'revoked': return ['Agent wallet is revoked', 'Re-enable it on phone']
    case 'invalid_amount': return ['Invalid price']
  }
}

/** Confirm screen. When `block` is set, buying is disabled and the reason shown instead. */
export function confirm(o: OptionCard, w: WalletView, block: Block = null): string {
  const after = Math.max(0, w.balanceGram - o.gram)
  const capAfter = Math.max(0, w.capLeftGram - o.gram)
  if (block) {
    return lines(`Buy ${o.title}?`, `Total ${fmtUsd(o.usd)} · ${fmtGram(o.gram)}`, '', ...blockLine(block, w), '', 'Double tap = back')
  }
  return lines(
    `Buy ${o.title}?`,
    `Total ${fmtUsd(o.usd)} · ${fmtGram(o.gram)}`,
    `Wallet after: ${fmtGram(after)}`,
    `Cap left today: ${fmtGram(capAfter)}`,
    'Testnet · agent wallet',
    '',
    'HOLD to buy   Double tap = back',
  )
}

export function paying(o: OptionCard, step: 'signing' | 'confirming'): string {
  return lines(
    `Paying ${fmtGram(o.gram)}`,
    o.title,
    '',
    step === 'signing' ? 'Signing on your phone...' : 'Confirming on TON testnet...',
  )
}

export function paid(o: OptionCard, orderId: string, secondsLeft: number, txHash?: string, telegram = false): string {
  return lines(
    `Paid ${fmtGram(o.gram)} · ${o.title}`,
    `Order ${orderId}`,
    txHash ? `Tx ${txHash.slice(0, 10)}...` : null,
    '',
    secondsLeft > 0 ? `Tap = cancel (${secondsLeft}s)` : telegram ? 'Receipt sent to Telegram' : 'Order complete',
    secondsLeft > 0 ? null : 'Tap = done',
  )
}

export function cancelled(o: OptionCard, state: 'working' | 'done'): string {
  return lines(
    state === 'working' ? 'Cancelling...' : 'Cancelled',
    o.title,
    state === 'working' ? 'Sending refund' : `Refund of ${fmtGram(o.gram)} sent`,
    '',
    state === 'done' ? 'Tap = done' : null,
  )
}

export function noResults(query: string): string {
  return lines(`Nothing found for "${query}"`, '', 'Try other words or a higher price', '', 'Tap = try again')
}

export function error(message: string): string {
  return lines(message, '', 'Tap = try again')
}
