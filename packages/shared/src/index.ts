// Types and helpers shared by the glasses app, API and mock store.

/** Demo exchange rate: prices are listed in USD and charged in test GRAM. */
export const USD_PER_GRAM = 100

export function usdToGram(usd: number): number {
  return Math.round((usd / USD_PER_GRAM) * 1e4) / 1e4
}

/** Structured shopping request produced by the intent parser. */
export interface ShoppingIntent {
  kind: 'search' | 'reorder' | 'unknown'
  /** Short product description used for catalog search, e.g. "usb-c cable". */
  query: string
  /** Upper price limit in USD, if the user gave one. */
  maxUsd: number | null
  /** Latest acceptable delivery date (YYYY-MM-DD), if the user gave one. */
  deadline: string | null
  /** Soft preferences, e.g. ["braided", "cheapest"]. */
  preferences: string[]
}

export interface Product {
  id: string
  title: string
  category: string
  tags: string[]
  usd: number
  rating: number
  deliveryDays: number
  stock: number
}

/** Catalog search request sent to the store. */
export interface SearchQuery {
  q: string
  maxUsd?: number | null
  /** Max delivery days allowed (derived from the deadline). */
  maxDays?: number | null
  limit?: number
}

/** One product option shown as a card on the glasses. */
export interface OptionCard {
  productId: string
  title: string
  usd: number
  gram: number
  /** Short delivery label, e.g. "Thu". */
  arrives: string
  rating: number
  /** One-line reason this option was picked. */
  why: string
}

/** Response of the API's /ask endpoint (text → intent → options). */
export interface AskResponse {
  transcript: string
  intent: ShoppingIntent
  options: OptionCard[]
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Delivery label for a product shipped `days` from `from`. */
export function arrivesLabel(days: number, from: Date = new Date()): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return WEEKDAYS[d.getDay()]
}

/** Whole days from `from` (local date) until the YYYY-MM-DD deadline. */
export function daysUntil(deadline: string, from: Date = new Date()): number {
  const [y, m, d] = deadline.split('-').map(Number)
  const end = new Date(y, m - 1, d)
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

export * from './caps.ts'
export * from './pay.ts'
