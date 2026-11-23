import { describe, expect, it } from 'vitest'
import { search } from '../src/catalog.ts'

describe('catalog search', () => {
  it('finds usb-c cables under a price limit', () => {
    const r = search({ q: 'usb-c cable', maxUsd: 15 })
    expect(r.length).toBeGreaterThan(0)
    expect(r.every(p => p.usd <= 15)).toBe(true)
    expect(r.every(p => p.title.toLowerCase().includes('cable'))).toBe(true)
  })

  it('folds plurals', () => {
    expect(search({ q: 'AA batteries' })[0].id).toBe('p09')
    expect(search({ q: 'coffee beans' }).length).toBeGreaterThanOrEqual(3)
  })

  it('filters by delivery days', () => {
    const r = search({ q: 'coffee beans', maxDays: 1 })
    expect(r.map(p => p.id)).toEqual(['p13'])
  })

  it('skips out-of-stock items', () => {
    expect(search({ q: 'coffee filters' }).some(p => p.id === 'p41')).toBe(false)
  })

  it('returns nothing for unknown items', () => {
    expect(search({ q: 'jet ski' })).toEqual([])
    expect(search({ q: '' })).toEqual([])
  })
})
