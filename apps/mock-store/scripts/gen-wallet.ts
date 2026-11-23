// Creates the mock store's own TESTNET merchant wallet and saves its mnemonic
// to the repo-root .env (gitignored). Prints only the address, never the words.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mnemonicNew } from '@ton/crypto'
import { friendly, keyFromMnemonic, testnetWallet } from '@glancecart/shared/ton'

const envPath = resolve(import.meta.dirname, '../../../.env')
const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
const existing = env.match(/^STORE_TESTNET_MNEMONIC=(.+)$/m)?.[1]?.trim()

const words = existing ? existing.split(/\s+/) : await mnemonicNew(24)
if (!existing) {
  const line = `STORE_TESTNET_MNEMONIC=${words.join(' ')}`
  const next = /^STORE_TESTNET_MNEMONIC=.*$/m.test(env)
    ? env.replace(/^STORE_TESTNET_MNEMONIC=.*$/m, line)
    : `${env.trimEnd()}\n${line}\n`
  writeFileSync(envPath, next)
}
const key = await keyFromMnemonic(words)
const address = friendly(testnetWallet(key.publicKey).address)
console.log(existing ? 'Store wallet already in .env' : 'Saved a new TESTNET store mnemonic to .env')
console.log(`Store address: ${address}`)
console.log('Fund it with test GRAM (for refund gas): https://t.me/testgiver_ton_bot')
console.log(`Explorer: https://testnet.tonviewer.com/${address}`)
