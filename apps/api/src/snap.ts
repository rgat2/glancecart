// Snap-to-buy: a phone-camera photo → what product it is (and any visible shelf
// price) → store search → cards that compare online prices with the shelf.
import { z } from 'zod'
import type { OptionCard } from '@glancecart/shared'
import { llmEnabled, parseJson } from './llm.ts'
import { HttpError } from './errors.ts'

export const MAX_IMAGE_BYTES = 4_500_000 // decoded; the phone downsizes to ~1024 px first
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
type MediaType = (typeof MEDIA_TYPES)[number]

const SnapSchema = z.object({
  found: z.boolean(),
  query: z.string(),
  label: z.string(),
  shelfPriceUsd: z.number().nullable(),
})
export type SnapResult = z.infer<typeof SnapSchema>

const SYSTEM = `You identify a retail product in a photo taken by a shopper, so it can be bought online.
Return JSON:
- found: false if no purchasable product is clearly visible.
- query: 1-4 lowercase words for a keyword store search, generic not brand-specific (e.g. "usb-c cable", "coffee beans", "aa batteries").
- label: a short human name for what you see, at most 30 characters (e.g. "Anker USB-C cable 2m").
- shelfPriceUsd: the price on a visible price tag or sticker in US dollars, else null. Do not guess a price that is not visible.`

export async function identifyProduct(imageBase64: string, mediaType: string): Promise<SnapResult> {
  if (!llmEnabled()) throw new HttpError(503, 'vision_not_configured')
  if (!MEDIA_TYPES.includes(mediaType as MediaType)) throw new HttpError(400, 'bad_image')
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) throw new HttpError(413, 'image_too_large')
  const out = await parseJson({
    system: SYSTEM,
    user: [
      { type: 'image', source: { type: 'base64', media_type: mediaType as MediaType, data: imageBase64 } },
      { type: 'text', text: 'What product is this?' },
    ],
    schema: SnapSchema,
    maxTokens: 1000,
  })
  if (!out || !out.found || !out.query.trim()) throw new HttpError(422, 'no_product_in_photo')
  return { ...out, query: out.query.trim().toLowerCase() }
}

/** Rewrites each card's "why" to compare with the shelf price, e.g. "$12.00 less than here ($34.00)". */
export function compareWithShelf(options: OptionCard[], shelfPriceUsd: number | null): OptionCard[] {
  if (shelfPriceUsd == null || !(shelfPriceUsd > 0)) return options
  return options.map(o => {
    const diff = shelfPriceUsd - o.usd
    const why = diff >= 0.5
      ? `$${diff.toFixed(2)} less than here ($${shelfPriceUsd.toFixed(2)})`
      : `here $${shelfPriceUsd.toFixed(2)}, ${o.why}`
    return { ...o, why: why.length > 40 ? why.slice(0, 39) + '.' : why }
  })
}
