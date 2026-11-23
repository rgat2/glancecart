// Turns a spoken request into a structured ShoppingIntent.
// Uses Claude when ANTHROPIC_API_KEY is set; otherwise (and on any LLM error)
// a rule-based parser that covers the demo phrases.
import { z } from 'zod'
import type { ShoppingIntent } from '@glancecart/shared'
import { llmEnabled, parseJson } from './llm.ts'

const IntentSchema = z.object({
  kind: z.enum(['search', 'reorder', 'unknown']),
  query: z.string(),
  maxUsd: z.number().nullable(),
  deadline: z.string().nullable(),
  preferences: z.array(z.string()),
})

const SYSTEM = `You turn a short spoken shopping request into JSON for a store search.
Fields:
- kind: "reorder" if the user wants something they bought before again ("reorder", "same as last time", "again"); "search" for a new item; "unknown" if it is not a shopping request.
- query: 1-4 lowercase words naming the product only, for keyword search (e.g. "usb-c cable", "coffee beans"). No prices, dates or filler words. For reorder, the product if named, else "".
- maxUsd: the price ceiling in US dollars if stated ("under 15 dollars" -> 15), else null.
- deadline: latest delivery date as YYYY-MM-DD if stated ("by Friday" -> the next Friday on or after today), else null.
- preferences: short soft preferences such as "braided", "cheapest", "fastest", "decaf"; [] if none.
The text comes from speech-to-text and may contain recognition errors; infer the most likely product.`

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

const NUMBER_WORDS: Record<string, number> = {
  five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
}

/** Rule-based parser used without an API key and as the LLM fallback. */
export function parseIntentRules(text: string, now: Date = new Date()): ShoppingIntent {
  let t = ` ${text.toLowerCase().replace(/[.,!?]/g, ' ')} `
  let maxUsd: number | null = null
  let deadline: string | null = null
  const preferences: string[] = []

  const price = t.match(/\b(?:under|below|less than|max(?:imum)?|up to|no more than)\s+\$?\s*(\d+(?:\.\d+)?|[a-z]+)\s*(?:dollars?|bucks|usd|\$)?/)
  if (price) {
    const n = Number(price[1])
    maxUsd = Number.isFinite(n) ? n : (NUMBER_WORDS[price[1]] ?? null)
    t = t.replace(price[0], ' ')
  }

  const by = t.match(/\b(?:by|before|arriving|for)\s+(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  if (by) {
    const w = by[1]
    if (w === 'today' || w === 'tonight') deadline = iso(now)
    else if (w === 'tomorrow') deadline = iso(addDays(now, 1))
    else deadline = iso(addDays(now, (WEEKDAYS.indexOf(w) - now.getDay() + 7) % 7))
    t = t.replace(by[0], ' ')
  }

  const reorder = /\b(reorder|re-order|again|same as last time|usual|more of)\b/.test(t)

  for (const p of ['cheapest', 'fastest', 'braided', 'decaf', 'organic', 'best rated']) {
    if (t.includes(p)) {
      preferences.push(p)
      t = t.replace(p, ' ')
    }
  }

  const query = t
    .replace(/\b(reorder|re-order|again|same as last time|the usual|usual|more of)\b/g, ' ')
    .replace(/\b(hey|please|can you|could you|i need|i want|i'd like|get me|find me|buy me|order me|find|buy|get|order|me|some|a|an|the|new|my|one|of|that|is|which|cheap)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const kind: ShoppingIntent['kind'] = reorder ? 'reorder' : query ? 'search' : 'unknown'
  return { kind, query, maxUsd, deadline, preferences }
}

export async function parseIntent(text: string, now: Date = new Date()): Promise<ShoppingIntent> {
  if (!llmEnabled()) return parseIntentRules(text, now)
  try {
    const out = await parseJson({
      system: SYSTEM,
      // Date goes in the user turn so the system prompt stays identical (cacheable).
      user: `Today is ${WEEKDAYS[now.getDay()]} ${iso(now)}.\nRequest: ${text}`,
      schema: IntentSchema,
      maxTokens: 1000,
    })
    if (out) return { ...out, query: out.query.trim().toLowerCase() }
  } catch (err) {
    console.warn('intent LLM failed, using rules:', (err as Error).message)
  }
  return parseIntentRules(text, now)
}
