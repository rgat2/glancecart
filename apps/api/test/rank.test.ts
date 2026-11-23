import { describe, expect, it } from 'vitest'
import type { Product, ShoppingIntent } from '@glancecart/shared'
import { rankRules, WHY_MAX } from '../src/rank.ts'

const NOW = new Date(2026, 10, 23, 10, 0) // Monday
const intent: ShoppingIntent = { kind: 'search', query: 'usb-c cable', maxUsd: null, deadline: null, preferences: [] }
const P = (id: string, usd: number, rating: number, deliveryDays: number): Product => ({
  id, title: `item ${id}`, category: 'x', tags: [], usd, rating, deliveryDays, stock: 5,
})

describe('rule-based ranking', () => {
  const products = [P('a', 10, 4.2, 3), P('b', 15, 4.9, 4), P('c', 20, 4.5, 1), P('d', 12, 4.0, 2)]

  it('returns cheapest, top rated, fastest', () => {
    const r = rankRules(intent, products, NOW)
    expect(r.map(o => o.productId)).toEqual(['a', 'b', 'c'])
    expect(r[0].why).toBe('cheapest, 4.2★')
    expect(r[2].why).toBe('fastest, arrives tomorrow')
    expect(r[0].gram).toBe(0.1)
    expect(r[0].arrives).toBe('Thu')
  })

  it('dedupes and fills by relevance', () => {
    const r = rankRules(intent, [P('a', 10, 4.9, 1), P('b', 15, 4.1, 3), P('c', 20, 4.0, 3)], NOW)
    expect(r.map(o => o.productId)).toEqual(['a', 'b', 'c'])
    expect(r.every(o => o.why.length <= WHY_MAX)).toBe(true)
  })

  it('puts fastest first when asked', () => {
    const r = rankRules({ ...intent, preferences: ['fastest'] }, products, NOW)
    expect(r[0].productId).toBe('c')
  })

  it('handles empty and single results', () => {
    expect(rankRules(intent, [], NOW)).toEqual([])
    expect(rankRules(intent, [P('a', 1, 4, 1)], NOW)).toHaveLength(1)
  })
})
