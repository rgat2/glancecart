// Per-agent-wallet settings (caps, spend ledger, Telegram link) persisted to a
// JSON file. No keys or funds here: the agent wallet's key never leaves the phone.
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DEFAULT_CAPS, type Caps, type SpendEntry } from '@glancecart/shared'

/** A completed purchase, kept for reorder and receipts. */
export interface HistoryEntry {
  orderId: string
  productId: string
  title: string
  usd: number
  gram: number
  paidAt: number
  txHash?: string
  status: 'paid' | 'refunded'
  receiptSent?: boolean
}

export interface WalletRecord {
  address: string
  tokenHash: string
  caps: Caps
  spends: SpendEntry[]
  history: HistoryEntry[]
  telegramChatId?: number
  createdAt: number
}

interface StateFile {
  wallets: Record<string, WalletRecord>
  /** One-time Telegram link codes → wallet address. */
  linkCodes: Record<string, { address: string; expiresAt: number }>
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export class Store {
  private data: StateFile
  constructor(private path: string | null) {
    this.data = path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { wallets: {}, linkCodes: {} }
    this.data.linkCodes ??= {}
    for (const w of Object.values(this.data.wallets)) w.history ??= []
  }

  private save() {
    if (!this.path) return
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(this.data, null, 2))
  }

  /** Registers a new agent wallet; returns its bearer token (shown once). */
  register(address: string): string | null {
    if (this.data.wallets[address]) return null
    const token = randomBytes(24).toString('base64url')
    this.data.wallets[address] = {
      address, tokenHash: hash(token), caps: { ...DEFAULT_CAPS }, spends: [], history: [], createdAt: Date.now(),
    }
    this.save()
    return token
  }

  byToken(token: string): WalletRecord | null {
    const h = hash(token)
    return Object.values(this.data.wallets).find(w => w.tokenHash === h) ?? null
  }

  byAddress(address: string): WalletRecord | null {
    return this.data.wallets[address] ?? null
  }

  byChat(chatId: number): WalletRecord[] {
    return Object.values(this.data.wallets).filter(w => w.telegramChatId === chatId)
  }

  linked(): WalletRecord[] {
    return Object.values(this.data.wallets).filter(w => w.telegramChatId != null)
  }

  /** One-time code the user sends to the bot (/start <code>) to link this wallet. */
  createLinkCode(address: string, ttlMs = 10 * 60_000): string {
    const code = randomBytes(9).toString('base64url')
    const now = Date.now()
    for (const [k, v] of Object.entries(this.data.linkCodes)) if (v.expiresAt < now) delete this.data.linkCodes[k]
    this.data.linkCodes[code] = { address, expiresAt: now + ttlMs }
    this.save()
    return code
  }

  /** Consumes a link code; returns the linked wallet or null if unknown/expired. */
  redeemLinkCode(code: string, chatId: number): WalletRecord | null {
    const entry = this.data.linkCodes[code]
    delete this.data.linkCodes[code]
    if (!entry || entry.expiresAt < Date.now() || !this.data.wallets[entry.address]) {
      this.save()
      return null
    }
    return this.update(entry.address, w => { w.telegramChatId = chatId })
  }

  update(address: string, fn: (w: WalletRecord) => void): WalletRecord {
    const w = this.data.wallets[address]
    if (!w) throw new Error('unknown wallet')
    fn(w)
    this.save()
    return w
  }
}
