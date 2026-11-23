// "Reorder the coffee beans" → the most recent matching paid purchase.
import { arrivesLabel, usdToGram, type OptionCard, type Product } from '@glancecart/shared'
import type { HistoryEntry } from './state.ts'

const FILLER = new Set(['same', 'as', 'last', 'time', 'usual', 'thing', 'things', 'stuff', 'again', 'the', 'a', 'my', 'one', 'that', 'it', 'order', 'more', 'of'])

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t && !FILLER.has(t))
    .map(t => (t.length > 3 ? t.replace(/(ies|s)$/, m => (m === 'ies' ? 'y' : '')) : t))

/** Latest paid purchase whose title matches every query word (any purchase if the query is empty). */
export function findReorder(history: HistoryEntry[], query: string): HistoryEntry | null {
  const q = norm(query)
  const paid = history.filter(h => h.status === 'paid').sort((a, b) => b.paidAt - a.paidAt)
  if (q.length === 0) return paid[0] ?? null
  return paid.find(h => {
    const title = new Set(norm(h.title))
    return q.every(t => title.has(t))
  }) ?? null
}

export function reorderCard(h: HistoryEntry, current: Product, now = new Date()): OptionCard {
  const when = new Date(h.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return {
    productId: current.id,
    title: current.title,
    usd: current.usd,
    gram: usdToGram(current.usd),
    arrives: arrivesLabel(current.deliveryDays, now),
    rating: current.rating,
    why: current.usd > h.usd ? `same as ${when}, now $${(current.usd - h.usd).toFixed(2)} more` : `same as last time (${when})`,
  }
}
