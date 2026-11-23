// Phone-side agent wallet (TESTNET). The key is generated here and kept in the
// Even app's bridge storage; it never leaves the phone. The API only ever sees
// the wallet address and already-signed transfers.
//
// Safety layers, in order:
//   1. The balance is the hard cap: the owner deposits only a small budget.
//   2. This module refuses to sign over the per-purchase / 24 h caps, using the
//      caps from the API and its own local spend ledger (which the API can't edit).
//   3. The API checks the same caps again before creating or relaying an order.
//   4. Revoke sweeps the balance back to the owner's Gram Wallet and stops signing.
import { Address } from '@ton/core'
import { mnemonicNew } from '@ton/crypto'
import { TonClient } from '@ton/ton'
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import {
  checkPurchase, spentLast24h, round4, TON_TESTNET,
  type CapCheck, type Caps, type Order, type PaymentRequired, type SpendEntry, type WalletRecordView,
} from '@glancecart/shared'
import {
  friendly, gramToNano, incomingTransfers, keyFromMnemonic, nanoToGram, signedTransferBoc, testnetWallet,
} from '@glancecart/shared/ton'
import { API_URL, ApiError, authed, setToken } from './api'

const K_MNEMONIC = 'gc.agent.mnemonic.testnet'
const K_TOKEN = 'gc.api.token'
const K_SPENDS = 'gc.spends'

/**
 * Persistent phone storage. Bridge storage is the primary store; the WebView's
 * own localStorage is a mirror, because the simulator (and possibly some app
 * versions) don't keep bridge storage across restarts. Both live on the phone.
 */
export class PhoneStorage {
  constructor(private bridge: EvenAppBridge) {}
  async get(key: string): Promise<string> {
    let v = ''
    try { v = (await this.bridge.getLocalStorage(key)) || '' } catch { /* bridge unavailable */ }
    if (!v) {
      try { v = localStorage.getItem(key) ?? '' } catch { /* storage blocked */ }
      if (v) await this.set(key, v)
    }
    return v
  }
  async set(key: string, value: string): Promise<void> {
    try { await this.bridge.setLocalStorage(key, value) } catch { /* bridge unavailable */ }
    try { localStorage.setItem(key, value) } catch { /* storage blocked */ }
  }
}

export interface WalletSnapshot {
  address: string
  balanceGram: number
  view: WalletRecordView
}

export class AgentWallet {
  private constructor(
    private storage: PhoneStorage,
    private key: { publicKey: Buffer; secretKey: Buffer },
    readonly contract: ReturnType<typeof testnetWallet>,
    private client: TonClient,
    private localSpends: SpendEntry[],
    public view: WalletRecordView,
  ) {}

  get address(): string {
    return friendly(this.contract.address)
  }

  /** Loads the agent wallet from bridge storage, creating and registering it on first run. */
  static async load(bridge: EvenAppBridge): Promise<AgentWallet> {
    const storage = new PhoneStorage(bridge)
    let words = await storage.get(K_MNEMONIC)
    if (!words) {
      words = (await mnemonicNew(24)).join(' ')
      await storage.set(K_MNEMONIC, words)
    }
    const key = await keyFromMnemonic(words)
    const contract = testnetWallet(key.publicKey)
    const address = friendly(contract.address)

    let token = await storage.get(K_TOKEN)
    if (!token) {
      const res = await fetch(`${API_URL}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
      const body = (await res.json()) as { token?: string; error?: string }
      if (!res.ok || !body.token) throw new ApiError(body.error ?? 'register_failed', res.status)
      token = body.token
      await storage.set(K_TOKEN, token)
    }
    setToken(token)

    const view = await authed<WalletRecordView>('GET', '/wallets/me')
    const spends = JSON.parse((await storage.get(K_SPENDS)) || '[]') as SpendEntry[]
    const client = new TonClient({ endpoint: `${API_URL}/ton/jsonRPC` })
    return new AgentWallet(storage, key, contract, client, spends, view)
  }

  async refresh(): Promise<WalletSnapshot> {
    const [view, nano] = await Promise.all([
      authed<WalletRecordView>('GET', '/wallets/me'),
      this.client.getBalance(this.contract.address),
    ])
    this.view = view
    return { address: this.address, balanceGram: nanoToGram(nano), view }
  }

  /** Caps the phone enforces: the API's caps, but spend counted from both ledgers. */
  private effective(): { caps: Caps; spends: SpendEntry[] } {
    const apiSpent = this.view.spentGram
    const localSpent = spentLast24h(this.localSpends)
    // Count whichever ledger says more was spent today.
    const spends = localSpent >= apiSpent
      ? this.localSpends
      : [{ orderId: 'api', gram: apiSpent, at: Date.now(), status: 'paid' as const }]
    return { caps: this.view.caps, spends }
  }

  check(gram: number, balanceGram?: number): CapCheck {
    const { caps, spends } = this.effective()
    return checkPurchase(caps, spends, gram, balanceGram)
  }

  capLeft(): number {
    const { caps, spends } = this.effective()
    return caps.revoked ? 0 : Math.max(0, round4(caps.dailyGram - spentLast24h(spends)))
  }

  private async saveSpends() {
    await this.storage.set(K_SPENDS, JSON.stringify(this.localSpends.slice(-50)))
  }

  /**
   * Full purchase: quote (402) → verify requirements → cap + balance check →
   * sign transfer locally → relay. Returns the order (status "confirming").
   */
  async buy(productId: string, expectedGram: number): Promise<Order> {
    const { payment, wallet } = await authed<{ payment: PaymentRequired; wallet: WalletRecordView }>(
      'POST', '/purchase/quote', { productId },
    )
    this.view = wallet
    const req = payment.accepts[0]
    const gram = nanoToGram(req.amount)
    // Never pay more than the price shown on the confirm screen, and only on testnet.
    if (req.network !== TON_TESTNET || req.asset !== 'GRAM') throw new ApiError('wrong_network', 400)
    if (gram > expectedGram + 1e-9) throw new ApiError('price_changed', 409)
    if (Date.now() > req.expiresAt) throw new ApiError('quote_expired', 410)

    const opened = this.client.open(this.contract)
    const [nano, deployed] = await Promise.all([
      this.client.getBalance(this.contract.address),
      this.client.isContractDeployed(this.contract.address),
    ])
    const check = this.check(gram, nanoToGram(nano))
    if (!check.ok) throw new ApiError(check.reason, 403)

    const seqno = deployed ? await opened.getSeqno() : 0
    const boc = signedTransferBoc({
      wallet: this.contract, secretKey: this.key.secretKey, seqno, deployed,
      to: req.payTo, amount: BigInt(req.amount), comment: req.memo,
    })
    this.localSpends.push({ orderId: payment.orderId, gram, at: Date.now(), status: 'pending' })
    await this.saveSpends()
    try {
      return await authed<Order>('POST', '/purchase/pay', { orderId: payment.orderId, boc, gram })
    } catch (err) {
      await this.setSpend(payment.orderId, 'failed')
      throw err
    }
  }

  async order(orderId: string): Promise<Order & { explorer: string | null }> {
    const o = await authed<Order & { explorer: string | null }>('GET', `/purchase/${orderId}`)
    if (o.status === 'paid' || o.status === 'refunded' || o.status === 'failed' || o.status === 'expired') {
      await this.setSpend(orderId, o.status === 'expired' ? 'failed' : o.status)
    }
    return o
  }

  async cancel(orderId: string): Promise<Order> {
    const o = await authed<Order>('POST', `/purchase/${orderId}/cancel`)
    if (o.status === 'refunded') await this.setSpend(orderId, 'refunded')
    return o
  }

  private async setSpend(orderId: string, status: SpendEntry['status']) {
    const s = this.localSpends.find(x => x.orderId === orderId)
    if (s && s.status !== status) {
      s.status = status
      await this.saveSpends()
    }
  }

  /** Owner = the address that first funded this wallet (read from chain, not from any server). */
  async owner(): Promise<string | null> {
    const txs = await this.client.getTransactions(this.contract.address, { limit: 50 })
    const incoming = incomingTransfers(txs).filter(t => t.nano > 0n)
    return incoming.length ? incoming[incoming.length - 1].from : null
  }

  /** Revoke: stop all purchases (API + local) and sweep the whole balance back to the owner. */
  async revoke(): Promise<{ owner: string | null }> {
    this.view = await authed<WalletRecordView>('PUT', '/wallets/me/caps', { revoked: true })
    const owner = await this.owner()
    const deployed = await this.client.isContractDeployed(this.contract.address)
    if (owner && deployed) {
      const seqno = await this.client.open(this.contract).getSeqno()
      const boc = signedTransferBoc({
        wallet: this.contract, secretKey: this.key.secretKey, seqno, deployed,
        to: friendly(Address.parse(owner)), amount: 0n, comment: 'GlanceCart revoke: returning funds', sweep: true,
      })
      await this.client.sendFile(Buffer.from(boc, 'base64'))
    }
    return { owner }
  }
}

/** Deep link a phone wallet can open to fund the agent wallet (testnet). */
export function topUpLink(address: string, gram: number): string {
  return `ton://transfer/${address}?amount=${gramToNano(gram)}&text=${encodeURIComponent('GlanceCart top-up')}`
}
