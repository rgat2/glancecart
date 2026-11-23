// Spending caps for the agent wallet. Pure logic, used by the phone (before
// signing) and the API (before creating an order). Amounts are in GRAM.

export interface Caps {
  /** Max GRAM for a single purchase. */
  perPurchaseGram: number
  /** Max GRAM spent in any rolling 24 hours. */
  dailyGram: number
  /** Owner revoked the agent: no further purchases. */
  revoked: boolean
}

export const DEFAULT_CAPS: Caps = { perPurchaseGram: 0.5, dailyGram: 1, revoked: false }

/** Hard limits on what a cap can be set to (testnet demo). */
export const CAP_LIMITS = { perPurchaseGram: 5, dailyGram: 10 }

/** Gas + forward fees kept back when checking balance (a W5 transfer costs ~0.003–0.006). */
export const FEE_RESERVE_GRAM = 0.01

export interface SpendEntry {
  orderId: string
  gram: number
  /** Unix ms when the payment was signed. */
  at: number
  status: 'pending' | 'paid' | 'refunded' | 'failed'
}

const DAY_MS = 24 * 60 * 60 * 1000

/** GRAM counted against the daily cap: pending and paid spends in the last 24 h. */
export function spentLast24h(spends: SpendEntry[], now = Date.now()): number {
  const total = spends
    .filter(s => (s.status === 'pending' || s.status === 'paid') && now - s.at < DAY_MS)
    .reduce((n, s) => n + s.gram, 0)
  return round4(total)
}

export function capLeft(caps: Caps, spends: SpendEntry[], now = Date.now()): number {
  if (caps.revoked) return 0
  return Math.max(0, round4(caps.dailyGram - spentLast24h(spends, now)))
}

export type CapCheck =
  | { ok: true }
  | { ok: false; reason: 'revoked' | 'over_purchase_cap' | 'over_daily_cap' | 'insufficient_balance' | 'invalid_amount' }

/**
 * Can the agent pay `gram` now? `balanceGram` is optional: the API checks caps
 * only, the phone also checks the on-chain balance.
 */
export function checkPurchase(
  caps: Caps,
  spends: SpendEntry[],
  gram: number,
  balanceGram?: number,
  now = Date.now(),
): CapCheck {
  if (!(gram > 0) || !Number.isFinite(gram)) return { ok: false, reason: 'invalid_amount' }
  if (caps.revoked) return { ok: false, reason: 'revoked' }
  if (gram > caps.perPurchaseGram + 1e-9) return { ok: false, reason: 'over_purchase_cap' }
  if (gram > capLeft(caps, spends, now) + 1e-9) return { ok: false, reason: 'over_daily_cap' }
  if (balanceGram !== undefined && gram + FEE_RESERVE_GRAM > balanceGram + 1e-9) {
    return { ok: false, reason: 'insufficient_balance' }
  }
  return { ok: true }
}

/** Validates a cap change request; returns the sanitized caps or an error. */
export function validateCaps(input: Partial<Caps>, current: Caps): Caps | { error: string } {
  const next = { ...current, ...input }
  for (const k of ['perPurchaseGram', 'dailyGram'] as const) {
    const v = next[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return { error: `${k} must be a number ≥ 0` }
    if (v > CAP_LIMITS[k]) return { error: `${k} max is ${CAP_LIMITS[k]} GRAM on testnet` }
    next[k] = round4(v)
  }
  if (next.perPurchaseGram > next.dailyGram) return { error: 'per-purchase cap cannot exceed the daily cap' }
  return { ...next, revoked: Boolean(next.revoked) }
}

export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

/** What the API returns about an agent wallet (settings only; no keys, no funds). */
export interface WalletRecordView {
  address: string
  caps: Caps
  spentGram: number
  capLeftGram: number
  telegramLinked: boolean
}
