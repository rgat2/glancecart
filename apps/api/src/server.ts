// GlanceCart API: speech-to-text, intent, search + ranking, purchase relay,
// TON relay, Telegram bot, and the hosted funding page.
// Provider keys live here (never in the glasses app). Wallet keys stay on the phone.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { daysUntil, type AskResponse, type OptionCard, type Product, type ShoppingIntent } from '@glancecart/shared'
import { parseIntent } from './intent.ts'
import { rankOptions } from './rank.ts'
import { sttFromEnv } from './stt.ts'
import { llmEnabled } from './llm.ts'
import { Store, type WalletRecord } from './state.ts'
import { purchaseRoutes } from './purchase.ts'
import { tonProxy } from './tonproxy.ts'
import { Receipts, startDailySummary, type Notifier } from './receipts.ts'
import { findReorder, reorderCard } from './reorder.ts'
import { startBot } from './telegram.ts'
import { HttpError, storeFetch } from './errors.ts'
import { compareWithShelf, identifyProduct, MAX_IMAGE_BYTES } from './snap.ts'

const STORE_URL = process.env.STORE_URL ?? 'http://localhost:8788'
/** Public HTTPS origin of this API once deployed, e.g. https://<random>.trycloudflare.com */
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, '') || null
const FUND_URL = process.env.FUND_PUBLIC_URL || (PUBLIC_URL ? `${PUBLIC_URL}/fund/` : null)
const MAX_AUDIO_BYTES = 16_000 * 2 * 20 + 44 // 20 s of 16 kHz s16 mono WAV
const TONCENTER = process.env.TONCENTER_ENDPOINT ?? 'https://testnet.toncenter.com/api/v2/jsonRPC'

const stt = sttFromEnv()
const store = new Store(process.env.STATE_FILE || fileURLToPath(new URL('../data/state.json', import.meta.url)))

// ---------- Telegram ----------

let notifier: Notifier | null = null
let botUsername: string | null = null
const receipts = new Receipts(store, STORE_URL, { send: (chatId, html) => notifier?.send(chatId, html) ?? Promise.resolve() })

async function balanceOf(address: string): Promise<number | null> {
  try {
    const res = await fetch(TONCENTER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.TONCENTER_API_KEY ? { 'X-API-Key': process.env.TONCENTER_API_KEY } : {}) },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'getAddressBalance', params: { address } }),
    })
    const json = (await res.json()) as { ok: boolean; result?: string }
    return json.ok && json.result != null ? Number(json.result) / 1e9 : null
  } catch {
    return null
  }
}

if (process.env.TELEGRAM_BOT_TOKEN) {
  try {
    const bot = await startBot(process.env.TELEGRAM_BOT_TOKEN, { store, balanceOf, fundUrl: FUND_URL })
    notifier = bot.notifier
    botUsername = bot.username
    startDailySummary(store, bot.notifier)
  } catch (err) {
    console.warn('telegram bot failed to start:', (err as Error).message)
  }
}

// ---------- helpers ----------

async function searchStore(intent: ShoppingIntent): Promise<Product[]> {
  const params = new URLSearchParams({ q: intent.query, limit: '10' })
  if (intent.maxUsd != null) params.set('maxUsd', String(intent.maxUsd))
  if (intent.deadline) params.set('maxDays', String(Math.max(0, daysUntil(intent.deadline))))
  const res = await storeFetch(`${STORE_URL}/products/search?${params}`)
  if (!res.ok) throw new HttpError(502, 'store_unavailable')
  return ((await res.json()) as { results: Product[] }).results
}

async function productById(id: string): Promise<Product | null> {
  const res = await storeFetch(`${STORE_URL}/products/${encodeURIComponent(id)}`)
  return res.ok ? ((await res.json()) as Product) : null
}

async function transcribe(body: ArrayBuffer): Promise<string> {
  if (!stt) throw new HttpError(503, 'stt_not_configured')
  if (body.byteLength < 44 + 3200) throw new HttpError(400, 'audio_too_short')
  if (body.byteLength > MAX_AUDIO_BYTES) throw new HttpError(413, 'audio_too_long')
  try {
    return await stt.transcribe(new Uint8Array(body as ArrayBuffer))
  } catch (err) {
    console.warn('stt failed:', (err as Error).message)
    throw new HttpError(502, 'stt_failed')
  }
}

function walletFromHeader(auth: string | undefined): WalletRecord | null {
  const token = auth?.replace(/^Bearer\s+/i, '')
  return token ? store.byToken(token) : null
}

/** Reorder: the last matching purchase as a single card, or null to fall back to search. */
async function reorderOptions(w: WalletRecord | null, intent: ShoppingIntent): Promise<OptionCard[] | null> {
  if (!w) return null
  const h = findReorder(w.history, intent.query)
  if (!h) return null
  const p = await productById(h.productId)
  if (!p || p.stock <= 0) return null
  return [reorderCard(h, p)]
}

// ---------- routes ----------

const app = new Hono()
app.use('*', logger(), cors())

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
  console.error(err)
  return c.json({ error: 'internal', detail: err.message }, 500)
})

app.get('/health', c => c.json({ ok: true, stt: stt?.name ?? null, llm: llmEnabled(), telegram: botUsername, network: 'testnet' }))

app.post('/stt', async c => c.json({ text: await transcribe(await c.req.arrayBuffer()) }))

app.post('/intent', async c => {
  const { text } = await c.req.json<{ text: string }>()
  return c.json(await parseIntent(text ?? ''))
})

app.post('/search', async c => {
  const intent = await c.req.json<ShoppingIntent>()
  return c.json({ options: await rankOptions(intent, await searchStore(intent)) })
})

/**
 * One round trip for the glasses: audio/wav body (or JSON { text } for typed input)
 * → transcript → intent → (reorder from history | store search + ranking) → cards.
 */
app.post('/ask', async c => {
  const isJson = (c.req.header('content-type') ?? '').includes('application/json')
  const transcript = isJson
    ? ((await c.req.json<{ text?: string }>()).text ?? '').trim()
    : await transcribe(await c.req.arrayBuffer())
  if (!transcript) throw new HttpError(422, 'no_speech')
  const intent = await parseIntent(transcript)
  let options: OptionCard[] = []
  if (intent.kind === 'reorder') {
    options = (await reorderOptions(walletFromHeader(c.req.header('Authorization')), intent)) ?? []
    if (options.length === 0 && intent.query) options = await rankOptions(intent, await searchStore(intent))
  } else if (intent.kind === 'search' && intent.query) {
    options = await rankOptions(intent, await searchStore(intent))
  }
  const body: AskResponse = { transcript, intent, options }
  return c.json(body)
})

/**
 * Snap-to-buy. Body: { imageBase64, mediaType } from the phone camera.
 * Returns AskResponse plus { snap: { label, shelfPriceUsd } }.
 */
app.post('/snap', async c => {
  if (Number(c.req.header('content-length') ?? 0) > (MAX_IMAGE_BYTES * 4) / 3 + 1000) throw new HttpError(413, 'image_too_large')
  const { imageBase64, mediaType } = await c.req.json<{ imageBase64?: string; mediaType?: string }>()
  if (!imageBase64) throw new HttpError(400, 'bad_image')
  const snap = await identifyProduct(imageBase64, mediaType ?? 'image/jpeg')
  const intent: ShoppingIntent = { kind: 'search', query: snap.query, maxUsd: null, deadline: null, preferences: [] }
  const options = compareWithShelf(await rankOptions(intent, await searchStore(intent)), snap.shelfPriceUsd)
  return c.json({
    transcript: `[photo] ${snap.label}`, intent, options,
    snap: { label: snap.label, shelfPriceUsd: snap.shelfPriceUsd },
  })
})

/** Phone panel: one-time deep link that links this wallet to the user's Telegram chat. */
app.post('/wallets/me/telegram-link', async c => {
  const w = walletFromHeader(c.req.header('Authorization'))
  if (!w) throw new HttpError(401, 'unauthorized')
  if (!botUsername) throw new HttpError(503, 'telegram_not_configured')
  const code = store.createLinkCode(w.address)
  return c.json({ url: `https://t.me/${botUsername}?start=${code}` })
})

app.route('/', purchaseRoutes({ store, storeUrl: STORE_URL, onOrderUpdate: receipts.onOrderUpdate }))
app.route('/', tonProxy())

// Hosted funding page (apps/fund build) + its TON Connect manifest.
const fundDist = fileURLToPath(new URL('../../fund/dist', import.meta.url))
const manifest = () => {
  const base = PUBLIC_URL ?? 'http://localhost:8787'
  return { url: `${base}/fund/`, name: 'GlanceCart', iconUrl: `${base}/fund/icon.png` }
}
app.get('/tonconnect-manifest.json', c => c.json(manifest()))
app.get('/fund/tonconnect-manifest.json', c => c.json(manifest()))
if (existsSync(fundDist)) {
  app.get('/fund', c => c.redirect('/fund/'))
  app.use('/fund/*', serveStatic({ root: fundDist, rewriteRequestPath: p => p.replace(/^\/fund/, '') }))
}

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 8787)
serve({ fetch: app.fetch, port })
console.log(`api on :${port} · stt=${stt?.name ?? 'off'} · llm=${llmEnabled() ? 'on' : 'rules'} · telegram=${botUsername ?? 'off'}`)
