// Picks the top 3 options from store results and writes a one-line "why" for each.
import { z } from 'zod'
import { arrivesLabel, usdToGram, type OptionCard, type Product, type ShoppingIntent } from '@glancecart/shared'
import { llmEnabled, parseJson } from './llm.ts'

/** Longest "why" that fits one glasses line after the "Why: " prefix. */
export const WHY_MAX = 40

function card(p: Product, why: string, now: Date): OptionCard {
  return {
    productId: p.id,
    title: p.title,
    usd: p.usd,
    gram: usdToGram(p.usd),
    arrives: arrivesLabel(p.deliveryDays, now),
    rating: p.rating,
    why: why.length > WHY_MAX ? why.slice(0, WHY_MAX - 1).trimEnd() + '.' : why,
  }
}

/**
 * Deterministic ranking: the cheapest, the best rated and the fastest
 * (deduplicated, then filled by relevance order), honoring preferences.
 */
export function rankRules(intent: ShoppingIntent, products: Product[], now: Date = new Date()): OptionCard[] {
  if (products.length === 0) return []
  const cheapest = [...products].sort((a, b) => a.usd - b.usd || b.rating - a.rating)[0]
  const bestRated = [...products].sort((a, b) => b.rating - a.rating || a.usd - b.usd)[0]
  const fastest = [...products].sort((a, b) => a.deliveryDays - b.deliveryDays || a.usd - b.usd)[0]

  const order: Array<[Product, string]> = [
    [cheapest, `cheapest, ${cheapest.rating}★`],
    [bestRated, `top rated, ${bestRated.rating}★`],
    [fastest, `fastest, arrives ${arrivesLabel(fastest.deliveryDays, now)}`],
  ]
  if (intent.preferences.includes('fastest')) order.unshift(order.splice(2, 1)[0])
  if (intent.preferences.includes('best rated')) order.unshift(order.splice(1, 1)[0])

  const picked = new Map<string, string>()
  for (const [p, why] of order) if (!picked.has(p.id)) picked.set(p.id, why)
  for (const p of products) {
    if (picked.size >= 3) break
    if (!picked.has(p.id)) picked.set(p.id, `good match, ${p.rating}★`)
  }
  const byId = new Map(products.map(p => [p.id, p]))
  return [...picked].slice(0, 3).map(([id, why]) => card(byId.get(id)!, why, now))
}

const RankSchema = z.object({
  picks: z.array(z.object({ productId: z.string(), why: z.string() })),
})

const SYSTEM = `You pick the best 3 products for a shopper wearing smart glasses with a tiny display.
Given the request and candidate products (JSON), return up to 3 picks, best first.
Respect stated preferences. Prefer a useful spread (e.g. cheapest, best rated, fastest) when nothing else decides.
"why" is at most ${WHY_MAX} characters, lowercase, plain ASCII except "★", e.g. "cheapest with 4.6★" or "braided, arrives tomorrow".
Use only productId values from the candidates.`

export async function rankOptions(intent: ShoppingIntent, products: Product[], now: Date = new Date()): Promise<OptionCard[]> {
  if (products.length <= 1 || !llmEnabled()) return rankRules(intent, products, now)
  try {
    const out = await parseJson({
      system: SYSTEM,
      user: JSON.stringify({
        request: intent,
        candidates: products.map(p => ({
          productId: p.id, title: p.title, usd: p.usd, rating: p.rating, arrives: arrivesLabel(p.deliveryDays, now),
        })),
      }),
      schema: RankSchema,
      maxTokens: 1000,
    })
    const byId = new Map(products.map(p => [p.id, p]))
    const seen = new Set<string>()
    const cards = (out?.picks ?? [])
      .filter(pk => byId.has(pk.productId) && !seen.has(pk.productId) && seen.add(pk.productId))
      .slice(0, 3)
      .map(pk => card(byId.get(pk.productId)!, pk.why, now))
    if (cards.length > 0) return cards
  } catch (err) {
    console.warn('rank LLM failed, using rules:', (err as Error).message)
  }
  return rankRules(intent, products, now)
}
