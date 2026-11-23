import type { Product, SearchQuery } from '@glancecart/shared'
import products from './products.json' with { type: 'json' }

export const CATALOG: Product[] = products

const STOP = new Set(['a', 'an', 'the', 'some', 'for', 'of', 'and', 'with', 'my', 'new', 'pack'])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\busb[ -]?c\b/g, 'usb-c') // "USB C", "usbc" from speech-to-text
    .replace(/[^a-z0-9%\- ]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !STOP.has(t))
}

/** Crude plural folding so "batteries" matches "battery" and "cables" matches "cable". */
function stem(t: string): string {
  if (t.endsWith('ies') && t.length > 4) return t.slice(0, -3) + 'y'
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1)
  return t
}

/** Relevance score of a product for the query tokens (0 = no match). */
export function score(p: Product, qTokens: string[]): number {
  const title = new Set(tokens(p.title).map(stem))
  const tags = new Set(p.tags.flatMap(tokens).map(stem))
  let s = 0
  for (const t of qTokens.map(stem)) {
    if (title.has(t)) s += 2
    else if (tags.has(t)) s += 1.5
    else if (p.category === t) s += 1
  }
  return s
}

/**
 * Keyword search with hard filters (price, delivery, in stock).
 * Returns matches sorted by relevance, then rating, then price.
 */
export function search(query: SearchQuery, catalog: Product[] = CATALOG): Product[] {
  const qTokens = tokens(query.q)
  if (qTokens.length === 0) return []
  const best = Math.max(...catalog.map(p => score(p, qTokens)))
  if (best <= 0) return []
  return catalog
    .map(p => ({ p, s: score(p, qTokens) }))
    // Keep strong matches only: at least 3/4 of the best score.
    .filter(({ s }) => s >= best * 0.75)
    .filter(({ p }) => p.stock > 0)
    .filter(({ p }) => query.maxUsd == null || p.usd <= query.maxUsd)
    .filter(({ p }) => query.maxDays == null || p.deliveryDays <= query.maxDays)
    .sort((a, b) => b.s - a.s || b.p.rating - a.p.rating || a.p.usd - b.p.usd)
    .slice(0, query.limit ?? 10)
    .map(({ p }) => p)
}

export function byId(id: string): Product | undefined {
  return CATALOG.find(p => p.id === id)
}
