// Funding page: the owner connects Gram Wallet via TON Connect (testnet) and
// sends a small budget to the phone-side agent wallet. Runs in a normal
// browser (or a Telegram Mini App), not inside the Even app WebView.
import './polyfills'
import { Address, beginCell, toNano } from '@ton/core'
import { CHAIN, TonConnectUI } from '@tonconnect/ui'
import './style.css'

const TESTNET = CHAIN.TESTNET // '-3'
const MAX_GRAM = 5

const params = new URLSearchParams(location.search)
const toEl = document.querySelector<HTMLInputElement>('#to')!
const amountEl = document.querySelector<HTMLInputElement>('#amount')!
const sendEl = document.querySelector<HTMLButtonElement>('#send')!
const msgEl = document.querySelector<HTMLParagraphElement>('#msg')!
toEl.value = params.get('to') ?? ''
amountEl.value = params.get('amount') ?? '1'

const ui = new TonConnectUI({
  // Wallets fetch the manifest over public HTTPS.
  // Next to index.html: emitted by the build (GitHub Pages) or served by the API under /fund/.
  manifestUrl: (import.meta.env.VITE_TC_MANIFEST_URL as string | undefined) || new URL("tonconnect-manifest.json", location.href).href,
  buttonRootId: 'connect',
})
// Testnet only: the SDK aborts the connection if the wallet is on another network.
ui.setConnectionNetwork(TESTNET)

function say(text: string, kind: 'muted' | 'ok' | 'err' = 'muted') {
  msgEl.textContent = text
  msgEl.className = kind
}

function validTarget(): string | null {
  try {
    const a = Address.parseFriendly(toEl.value.trim())
    if (!a.isTestOnly) return null
    return a.address.toString({ testOnly: true, bounceable: false })
  } catch {
    return null
  }
}

function update() {
  const w = ui.wallet
  const amount = Number(amountEl.value)
  const ok = Boolean(w) && validTarget() !== null && amount > 0 && amount <= MAX_GRAM
  sendEl.disabled = !ok
  if (!w) say('Connect your wallet to continue.')
  else if (w.account.chain !== TESTNET) say('Your wallet is on mainnet. Switch it to testnet.', 'err')
  else if (!validTarget()) say('Enter a testnet agent wallet address (starts with 0Q or kQ).', 'err')
  else if (!(amount > 0 && amount <= MAX_GRAM)) say(`Amount must be between 0.1 and ${MAX_GRAM} GRAM.`, 'err')
  else say(`Connected: ${w.device.appName}. Ready to send.`, 'ok')
}

ui.onStatusChange(update)
toEl.addEventListener('input', update)
amountEl.addEventListener('input', update)
update()

sendEl.addEventListener('click', async () => {
  const to = validTarget()
  if (!to || !ui.wallet || ui.wallet.account.chain !== TESTNET) return update()
  const comment = beginCell().storeUint(0, 32).storeStringTail('GlanceCart top-up').endCell().toBoc().toString('base64')
  sendEl.disabled = true
  say('Confirm the transfer in your wallet…')
  try {
    await ui.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      network: TESTNET,
      messages: [{ address: to, amount: toNano(amountEl.value).toString(), payload: comment }],
    })
    say('Sent. The agent wallet balance updates on your glasses in a few seconds.', 'ok')
  } catch (err) {
    say(`Not sent: ${(err as Error).message}`, 'err')
  } finally {
    update()
  }
})
