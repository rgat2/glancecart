import { describe, expect, it } from 'vitest'
import { Cell, loadMessage } from '@ton/core'
import { mnemonicNew } from '@ton/crypto'
import { keyFromMnemonic, testnetWallet, friendly, signedTransferBoc, gramToNano, nanoToGram, commentOf } from '../src/ton.ts'

describe('testnet wallet helpers', () => {
  it('derives a testnet W5 address and signs a deploying transfer with a comment', async () => {
    const words = await mnemonicNew(24)
    const key = await keyFromMnemonic(words)
    const w = testnetWallet(key.publicKey)
    const addr = friendly(w.address)
    expect(addr).toMatch(/^0Q/) // testnet, non-bounceable

    const boc = signedTransferBoc({
      wallet: w, secretKey: key.secretKey, seqno: 0, to: addr, amount: gramToNano(0.124), comment: 'gc-123', deployed: false,
    })
    const msg = loadMessage(Cell.fromBase64(boc).beginParse())
    expect(msg.info.type).toBe('external-in')
    expect(msg.init).toBeTruthy() // StateInit attached for first send
  })

  it('converts GRAM and nano', () => {
    expect(gramToNano(0.124)).toBe(124_000_000n)
    expect(nanoToGram(124_000_000n)).toBe(0.124)
  })

  it('reads text comments', async () => {
    const { beginCell } = await import('@ton/core')
    expect(commentOf(beginCell().storeUint(0, 32).storeStringTail('gc-abc').endCell())).toBe('gc-abc')
    expect(commentOf(beginCell().storeUint(5, 32).endCell())).toBeNull()
    expect(commentOf(undefined)).toBeNull()
  })
})
