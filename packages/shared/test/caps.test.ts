import { describe, expect, it } from 'vitest'
import { capLeft, checkPurchase, DEFAULT_CAPS, spentLast24h, validateCaps, type SpendEntry } from '../src/caps.ts'

const NOW = 1_800_000_000_000
const H = 3_600_000
const spend = (gram: number, hoursAgo: number, status: SpendEntry['status'] = 'paid'): SpendEntry => ({
  orderId: `o${gram}${hoursAgo}`, gram, at: NOW - hoursAgo * H, status,
})

describe('caps', () => {
  const caps = { perPurchaseGram: 0.5, dailyGram: 1, revoked: false }

  it('counts pending + paid in the last 24h only', () => {
    const s = [spend(0.3, 1), spend(0.2, 2, 'pending'), spend(0.4, 3, 'refunded'), spend(0.5, 25), spend(0.1, 1, 'failed')]
    expect(spentLast24h(s, NOW)).toBe(0.5)
    expect(capLeft(caps, s, NOW)).toBe(0.5)
  })

  it('allows a purchase within both caps and balance', () => {
    expect(checkPurchase(caps, [], 0.124, 2, NOW)).toEqual({ ok: true })
  })

  it('blocks over the per-purchase cap', () => {
    expect(checkPurchase(caps, [], 0.6, 2, NOW)).toEqual({ ok: false, reason: 'over_purchase_cap' })
  })

  it('blocks over the daily cap', () => {
    expect(checkPurchase(caps, [spend(0.5, 1), spend(0.4, 2)], 0.2, 2, NOW)).toEqual({ ok: false, reason: 'over_daily_cap' })
    // exactly at the remaining cap is fine
    expect(checkPurchase(caps, [spend(0.5, 1), spend(0.4, 2)], 0.1, 2, NOW)).toEqual({ ok: true })
  })

  it('blocks when balance cannot cover amount + fee reserve', () => {
    expect(checkPurchase(caps, [], 0.124, 0.13, NOW)).toEqual({ ok: false, reason: 'insufficient_balance' })
    expect(checkPurchase(caps, [], 0.124, undefined, NOW)).toEqual({ ok: true })
  })

  it('blocks everything once revoked', () => {
    expect(checkPurchase({ ...caps, revoked: true }, [], 0.01, 2, NOW)).toEqual({ ok: false, reason: 'revoked' })
    expect(capLeft({ ...caps, revoked: true }, [], NOW)).toBe(0)
  })

  it('rejects bad amounts', () => {
    expect(checkPurchase(caps, [], 0, 2, NOW).ok).toBe(false)
    expect(checkPurchase(caps, [], NaN, 2, NOW).ok).toBe(false)
  })

  it('validates cap changes', () => {
    expect(validateCaps({ dailyGram: 2 }, DEFAULT_CAPS)).toEqual({ perPurchaseGram: 0.5, dailyGram: 2, revoked: false })
    expect(validateCaps({ dailyGram: 50 }, DEFAULT_CAPS)).toHaveProperty('error')
    expect(validateCaps({ perPurchaseGram: 2, dailyGram: 1 }, DEFAULT_CAPS)).toHaveProperty('error')
    expect(validateCaps({ dailyGram: -1 }, DEFAULT_CAPS)).toHaveProperty('error')
  })
})
