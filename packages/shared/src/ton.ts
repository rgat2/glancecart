// TON testnet wallet helpers shared by the phone-side agent wallet and the
// mock store's merchant wallet. TESTNET ONLY: networkGlobalId -3.
import { Address, beginCell, Cell, external, internal, SendMode, storeMessage, toNano, fromNano, type Transaction } from '@ton/core'
import { mnemonicToPrivateKey, type KeyPair } from '@ton/crypto'
import { WalletContractV5R1 } from '@ton/ton'

export const TESTNET_GLOBAL_ID = -3

export function testnetWallet(publicKey: Buffer): WalletContractV5R1 {
  return WalletContractV5R1.create({
    publicKey,
    walletId: { networkGlobalId: TESTNET_GLOBAL_ID, context: { walletVersion: 'v5r1', workchain: 0, subwalletNumber: 0 } },
  })
}

export async function keyFromMnemonic(words: string[] | string): Promise<KeyPair> {
  const list = Array.isArray(words) ? words : words.trim().split(/\s+/)
  return mnemonicToPrivateKey(list)
}

/** User-friendly testnet address (UQ…/0Q… non-bounceable), used everywhere in the UI. */
export function friendly(addr: Address): string {
  return addr.toString({ testOnly: true, bounceable: false, urlSafe: true })
}

export function sameAddress(a: string | Address, b: string | Address): boolean {
  const pa = typeof a === 'string' ? Address.parse(a) : a
  const pb = typeof b === 'string' ? Address.parse(b) : b
  return pa.equals(pb)
}

export const gramToNano = (gram: number): bigint => toNano(gram.toFixed(9))
export const nanoToGram = (nano: bigint | string): number => Number(fromNano(BigInt(nano)))

/**
 * Builds a signed external message (base64 BoC) that makes `wallet` send `amount`
 * nanograms to `to` with a text comment. Includes the StateInit when the wallet
 * isn't deployed yet (seqno 0), so the first payment also deploys it.
 */
export function signedTransferBoc(opts: {
  wallet: WalletContractV5R1
  secretKey: Buffer
  seqno: number
  to: string
  amount: bigint
  comment: string
  deployed: boolean
  /** Send the whole balance (used to sweep funds back on revoke). */
  sweep?: boolean
}): string {
  const body = opts.wallet.createTransfer({
    seqno: opts.seqno,
    secretKey: opts.secretKey,
    sendMode: opts.sweep ? SendMode.CARRY_ALL_REMAINING_BALANCE : SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: [internal({ to: Address.parse(opts.to), value: opts.sweep ? 0n : opts.amount, bounce: false, body: opts.comment })],
  })
  const ext = external({ to: opts.wallet.address, init: opts.deployed ? undefined : opts.wallet.init, body })
  return beginCell().store(storeMessage(ext)).endCell().toBoc().toString('base64')
}

/** Text comment of an internal message body, or null. */
export function commentOf(body: Cell | undefined): string | null {
  if (!body) return null
  const s = body.beginParse()
  if (s.remainingBits < 32 || s.loadUint(32) !== 0) return null
  try {
    return s.loadStringTail()
  } catch {
    return null
  }
}

export interface IncomingTransfer {
  from: string
  nano: bigint
  comment: string | null
  hash: string
  lt: string
  at: number
}

/** Incoming value transfers from a list of transactions (as returned by TonClient.getTransactions). */
export function incomingTransfers(txs: Transaction[]): IncomingTransfer[] {
  const out: IncomingTransfer[] = []
  for (const tx of txs) {
    const m = tx.inMessage
    if (!m || m.info.type !== 'internal') continue
    out.push({
      from: friendly(m.info.src),
      nano: m.info.value.coins,
      comment: commentOf(m.body),
      hash: tx.hash().toString('hex'),
      lt: tx.lt.toString(),
      at: tx.now * 1000,
    })
  }
  return out
}
