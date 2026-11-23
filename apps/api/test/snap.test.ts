import { describe, expect, it } from 'vitest'
import type { OptionCard } from '@glancecart/shared'
import { compareWithShelf, identifyProduct } from '../src/snap.ts'

const card = (usd: number): OptionCard => ({ productId: 'p', title: 't', usd, gram: usd / 100, arrives: 'Thu', rating: 4.5, why: 'cheapest, 4.5★' })

describe('snap-to-buy', () => {
  it('compares online prices with the shelf price', () => {
    const [a, b] = compareWithShelf([card(22), card(34.2)], 34)
    expect(a.why).toBe('$12.00 less than here ($34.00)')
    expect(b.why).toBe('here $34.00, cheapest, 4.5★')
    expect(compareWithShelf([card(22)], null)[0].why).toBe('cheapest, 4.5★')
    expect(a.why.length).toBeLessThanOrEqual(40)
  })

  it('is disabled cleanly without an Anthropic key', async () => {
    const prev = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    await expect(identifyProduct('AAAA', 'image/jpeg')).rejects.toThrow('vision_not_configured')
    if (prev) process.env.ANTHROPIC_API_KEY = prev
  })
})
