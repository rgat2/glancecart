import { describe, expect, it } from 'vitest'
import { parseIntentRules } from '../src/intent.ts'

// Monday 2026-11-23
const NOW = new Date(2026, 10, 23, 10, 0)

describe('rule-based intent parser', () => {
  it('parses item, price ceiling and weekday deadline', () => {
    expect(parseIntentRules('Find a USB-C cable under 15 dollars by Friday', NOW)).toEqual({
      kind: 'search', query: 'usb-c cable', maxUsd: 15, deadline: '2026-11-27', preferences: [],
    })
  })

  it('handles $ prefix and spelled-out numbers', () => {
    expect(parseIntentRules('get me batteries under $10', NOW).maxUsd).toBe(10)
    expect(parseIntentRules('coffee beans under twenty bucks', NOW).maxUsd).toBe(20)
  })

  it('detects reorder', () => {
    const i = parseIntentRules('Reorder the coffee beans', NOW)
    expect(i.kind).toBe('reorder')
    expect(i.query).toBe('coffee beans')
  })

  it('maps today / tomorrow and same-day weekday', () => {
    expect(parseIntentRules('paper towels by tomorrow', NOW).deadline).toBe('2026-11-24')
    expect(parseIntentRules('paper towels by today', NOW).deadline).toBe('2026-11-23')
    expect(parseIntentRules('paper towels by monday', NOW).deadline).toBe('2026-11-23')
  })

  it('extracts preferences', () => {
    const i = parseIntentRules('the cheapest braided usb-c cable', NOW)
    expect(i.preferences).toEqual(['cheapest', 'braided'])
    expect(i.query).toBe('usb-c cable')
  })

  it('marks empty requests unknown', () => {
    expect(parseIntentRules('hey please', NOW).kind).toBe('unknown')
  })
})
