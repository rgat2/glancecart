// Phone-side companion UI (inside the Even app WebView): glasses mirror,
// typed-input fallback, and the agent wallet panel (fund, caps, revoke).
// Styles adapted from the evenhub-templates asr template.

type Status = 'connecting' | 'listening' | 'paused' | 'error'

export interface WalletPanel {
  address: string
  balanceGram: number
  perPurchaseGram: number
  dailyGram: number
  capLeftGram: number
  revoked: boolean
  fundUrl: string
  tonLink: string
  explorerUrl: string
  telegramLinked: boolean
}

export interface UiHandlers {
  onTypedRequest(text: string): void
  onSaveCaps(perPurchaseGram: number, dailyGram: number): void
  onRevoke(): void
  onRefresh(): void
  onLinkTelegram(): void
  onPhoto(file: File): void
}

let statusEl: HTMLDivElement
let mirrorEl: HTMLPreElement
let walletEl: HTMLElement
let handlers: UiHandlers

export function mountUi(h: UiHandlers) {
  handlers = h
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <main class="panel">
      <header>
        <h1>GlanceCart</h1>
        <div id="status" class="status status-connecting">Connecting…</div>
      </header>
      <pre id="mirror" class="mirror" aria-live="polite"></pre>
      <form id="typed" class="row">
        <input id="typed-text" placeholder="Or type a request, e.g. AA batteries by tomorrow" autocomplete="off" />
        <button type="submit">Ask</button>
      </form>
      <label class="photo">📷 Snap from a photo <input id="photo" type="file" accept="image/*" capture="environment" hidden /></label>
      <section id="wallet" class="card"><p class="muted">Loading agent wallet…</p></section>
      <footer>TON testnet only · the agent wallet key stays on this phone</footer>
    </main>
  `
  statusEl = app.querySelector<HTMLDivElement>('#status')!
  mirrorEl = app.querySelector<HTMLPreElement>('#mirror')!
  walletEl = app.querySelector<HTMLElement>('#wallet')!
  const photo = app.querySelector<HTMLInputElement>('#photo')!
  photo.addEventListener('change', () => {
    const f = photo.files?.[0]
    if (f) h.onPhoto(f)
    photo.value = ''
  })
  const input = app.querySelector<HTMLInputElement>('#typed-text')!
  app.querySelector<HTMLFormElement>('#typed')!.addEventListener('submit', e => {
    e.preventDefault()
    const text = input.value.trim()
    if (text) h.onTypedRequest(text)
    input.value = ''
  })
  injectStyles()
}

export function setStatus(kind: Status, text: string) {
  if (!statusEl) return
  statusEl.className = `status status-${kind}`
  statusEl.textContent = text
}

export function setMirror(text: string) {
  if (mirrorEl) mirrorEl.textContent = text
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

export function setWalletError(message: string) {
  if (walletEl) walletEl.innerHTML = `<h2>Agent wallet</h2><p class="err">${esc(message)}</p>`
}

export function setWallet(w: WalletPanel) {
  if (!walletEl) return
  walletEl.innerHTML = `
    <h2>Agent wallet <span class="muted">testnet</span></h2>
    <p class="big">${w.balanceGram.toFixed(4)} GRAM</p>
    <p class="mono"><a href="${esc(w.explorerUrl)}" target="_blank" rel="noopener">${esc(w.address)}</a></p>
    ${w.revoked
      ? '<p class="err">Revoked: purchases are blocked.</p>'
      : `<p>Cap left today: <b>${w.capLeftGram.toFixed(4)} GRAM</b></p>`}
    <div class="row">
      <a class="btn" href="${esc(w.fundUrl)}" target="_blank" rel="noopener">Fund from Gram Wallet</a>
      <a class="btn ghost" href="${esc(w.tonLink)}">Open in wallet app</a>
    </div>
    <form id="caps" class="caps">
      <label>Per purchase <input id="cap-pp" type="number" step="0.01" min="0" value="${w.perPurchaseGram}" /> GRAM</label>
      <label>Per 24 h <input id="cap-day" type="number" step="0.01" min="0" value="${w.dailyGram}" /> GRAM</label>
      <button type="submit">Save caps</button>
    </form>
    <p>${w.telegramLinked ? 'Telegram: <b>linked</b> · receipts and daily summary on' : 'Telegram: not linked'}</p>
    <div class="row">
      <button id="tg" class="ghost">${w.telegramLinked ? 'Re-link Telegram' : 'Link Telegram'}</button>
      <button id="refresh" class="ghost">Refresh</button>
      <button id="revoke" class="danger" ${w.revoked ? 'disabled' : ''}>Revoke &amp; return funds</button>
    </div>
  `
  walletEl.querySelector<HTMLFormElement>('#caps')!.addEventListener('submit', e => {
    e.preventDefault()
    const pp = Number(walletEl.querySelector<HTMLInputElement>('#cap-pp')!.value)
    const day = Number(walletEl.querySelector<HTMLInputElement>('#cap-day')!.value)
    handlers.onSaveCaps(pp, day)
  })
  walletEl.querySelector('#refresh')!.addEventListener('click', () => handlers.onRefresh())
  walletEl.querySelector('#tg')!.addEventListener('click', () => handlers.onLinkTelegram())
  walletEl.querySelector('#revoke')!.addEventListener('click', () => {
    if (confirm('Revoke the agent wallet? Purchases stop and the whole balance goes back to the wallet that funded it.')) handlers.onRevoke()
  })
}

/**
 * Shows the one-time Telegram link in the panel. Some WebViews (including the
 * Even Hub simulator) ignore window.open, so the link must also be visible.
 */
export function showTelegramLink(url: string) {
  if (!walletEl) return
  walletEl.querySelector('#tg-link')?.remove()
  const p = document.createElement('p')
  p.id = 'tg-link'
  p.className = 'mono'
  p.innerHTML = `Open in Telegram and press Start (one-time link):<br><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`
  walletEl.appendChild(p)
}

function injectStyles() {
  const css = `
    :root { color-scheme: dark; }
    html, body { margin: 0; min-height: 100%; background: #232323; color: #E5E5E5;
      font: 16px/1.4 -apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif;
      touch-action: manipulation; -webkit-text-size-adjust: 100%; overscroll-behavior: none; }
    .panel { display: flex; flex-direction: column; gap: 16px;
      width: 100%; max-width: 640px; margin: 0 auto; padding: 24px 16px; box-sizing: border-box; }
    header { display: flex; align-items: center; justify-content: space-between; }
    h1 { font-size: 18px; font-weight: 600; margin: 0; letter-spacing: 0.02em; }
    h2 { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
    p { margin: 6px 0; }
    .status { font-size: 12px; padding: 4px 10px; border-radius: 999px;
      border: 1px solid transparent; letter-spacing: 0.04em; text-transform: uppercase; }
    .status-connecting { color: #A7A7A7; border-color: #3E3E3E; }
    .status-listening  { color: #3CFA44; border-color: #3CFA44; background: rgba(60,250,68,0.08); }
    .status-paused     { color: #E5E5E5; border-color: #7B7B7B; background: rgba(229,229,229,0.06); }
    .status-error      { color: #FF453A; border-color: #FF453A; background: rgba(255,69,58,0.08); }
    .mirror { margin: 0; background: #000; color: #3CFA44; border: 1px solid #3E3E3E; border-radius: 12px;
      padding: 16px; font: 15px/1.45 ui-monospace, Menlo, Consolas, monospace; min-height: 190px;
      white-space: pre-wrap; word-break: break-word; }
    .card { background: #2E2E2E; border: 1px solid #3E3E3E; border-radius: 12px; padding: 16px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .row input { flex: 1; min-width: 0; }
    input { padding: 10px 12px; border-radius: 10px; border: 1px solid #3E3E3E; background: #232323; color: #E5E5E5; font-size: 16px; }
    .caps { display: grid; gap: 8px; margin-top: 12px; }
    .caps label { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .caps input { width: 90px; padding: 6px 8px; }
    button, .btn { padding: 10px 14px; border-radius: 10px; border: 0; background: #3CFA44; color: #111;
      font-weight: 600; font-size: 15px; text-decoration: none; cursor: pointer; }
    .ghost { background: transparent; color: #E5E5E5; border: 1px solid #7B7B7B; }
    .danger { background: #FF453A; color: #fff; }
    button:disabled { opacity: 0.4; }
    .big { font-size: 24px; font-weight: 600; }
    .mono { font: 12px ui-monospace, Menlo, Consolas, monospace; word-break: break-all; }
    .mono a { color: #A7A7A7; }
    .muted { color: #7B7B7B; font-weight: 400; }
    .err { color: #FF453A; }
    .photo { display: block; text-align: center; padding: 10px; border-radius: 10px; border: 1px dashed #7B7B7B; color: #E5E5E5; font-size: 15px; cursor: pointer; }
    footer { font-size: 12px; color: #7B7B7B; text-align: center; }
  `
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
}
