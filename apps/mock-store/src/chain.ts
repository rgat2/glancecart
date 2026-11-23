// The store's view of TON testnet: its own merchant wallet, broadcasting the
// buyer's signed payment, finding that payment on-chain, and sending refunds.
// The merchant key is the store's own testnet wallet, never the buyer's.
import { Address } from '@ton/core'
import { TonClient } from '@ton/ton'
import { friendly, incomingTransfers, keyFromMnemonic, sameAddress, signedTransferBoc, testnetWallet } from '@glancecart/shared/ton'

export interface Chain {
  /** Merchant wallet address (testnet, user-friendly). */
  address: string
  broadcast(boc: string): Promise<void>
  /** Hash of an incoming transfer with this comment from `payer` of at least `minNano`, or null. */
  findPayment(memo: string, payer: string, minNano: bigint): Promise<string | null>
  /** Sends a refund from the merchant wallet. */
  refund(to: string, nano: bigint, comment: string): Promise<void>
}

/**
 * Retries a toncenter call that was rate limited (HTTP 429). Without an API key
 * toncenter allows ~1 request/s per IP, and the API's relay shares that budget.
 * A 429 means the request was rejected, so re-sending (even a BOC) is safe.
 */
export async function retry429<T>(fn: () => Promise<T>, tries = 4, baseMs = 1200): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as { response?: { status?: number }; status?: number }).response?.status ?? (err as { status?: number }).status
      if (status !== 429 || attempt >= tries) throw err
      await new Promise(r => setTimeout(r, baseMs * attempt))
    }
  }
}

export async function tonChain(env = process.env): Promise<Chain | null> {
  if (!env.STORE_TESTNET_MNEMONIC) return null
  const key = await keyFromMnemonic(env.STORE_TESTNET_MNEMONIC)
  const wallet = testnetWallet(key.publicKey)
  const client = new TonClient({
    endpoint: env.TONCENTER_ENDPOINT ?? 'https://testnet.toncenter.com/api/v2/jsonRPC',
    apiKey: env.TONCENTER_API_KEY || undefined,
  })
  const address = friendly(wallet.address)

  // Merchant sends are serialized so two refunds never reuse a seqno.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn)
    queue = run.catch(() => undefined)
    return run
  }

  return {
    address,
    async broadcast(boc) {
      await retry429(() => client.sendFile(Buffer.from(boc, 'base64')))
    },
    async findPayment(memo, payer, minNano) {
      const txs = await retry429(() => client.getTransactions(wallet.address, { limit: 30 }))
      const hit = incomingTransfers(txs).find(t => t.comment === memo && t.nano >= minNano && sameAddress(t.from, payer))
      return hit?.hash ?? null
    },
    refund(to, nano, comment) {
      return serial(async () => {
        const opened = client.open(wallet)
        const deployed = await retry429(() => client.isContractDeployed(wallet.address))
        const seqno = deployed ? await retry429(() => opened.getSeqno()) : 0
        const boc = signedTransferBoc({
          wallet, secretKey: key.secretKey, seqno, to: friendly(Address.parse(to)), amount: nano, comment, deployed,
        })
        await retry429(() => client.sendFile(Buffer.from(boc, 'base64')))
      })
    },
  }
}
