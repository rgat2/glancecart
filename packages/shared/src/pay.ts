// x402-style payment messages between the glasses app, API and mock store.
// The store answers an unpaid order with HTTP 402 and these requirements; the
// payer signs a native GRAM transfer on TON testnet carrying `memo` as comment.

export const TON_TESTNET = 'tvm:-3'

export interface PaymentRequirements {
  scheme: 'exact'
  network: typeof TON_TESTNET
  asset: 'GRAM'
  /** Amount in nanograms (1 GRAM = 1e9), as a decimal string. */
  amount: string
  /** Store's testnet wallet address (user-friendly, testnet, non-bounceable). */
  payTo: string
  /** Text comment the transfer must carry; equals the order id. */
  memo: string
  /** Unix ms after which the quote is void. */
  expiresAt: number
}

export interface PaymentRequired {
  x402Version: 1
  error: 'payment_required'
  orderId: string
  accepts: PaymentRequirements[]
}

export type OrderStatus = 'awaiting_payment' | 'confirming' | 'paid' | 'refunding' | 'refunded' | 'expired' | 'failed'

export interface Order {
  orderId: string
  productId: string
  title: string
  usd: number
  gram: number
  payer: string
  status: OrderStatus
  createdAt: number
  paidAt?: number
  /** Unix ms until which the buyer can cancel for a refund. */
  cancelUntil?: number
  txHash?: string
  refundTxHash?: string
  error?: string
}

/** Cancel window after payment is confirmed. */
export const CANCEL_WINDOW_MS = 30_000

export const explorerTx = (hash: string) => `https://testnet.tonviewer.com/transaction/${hash}`
export const explorerAddress = (addr: string) => `https://testnet.tonviewer.com/${addr}`
