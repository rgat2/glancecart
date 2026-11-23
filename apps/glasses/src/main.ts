// GlanceCart glasses app: say it → see 3 options → hold to buy → 30 s to cancel.
// One full-screen text container; each state renders one screen from screens.ts.
import './polyfills'
import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
  AudioInputSource,
} from '@evenrealities/even_hub_sdk'
import { explorerAddress, type Order, type OptionCard } from '@glancecart/shared'
import * as S from './screens'
import { API_URL, ApiError, ERROR_LINES, askAudio, askPhoto, askText, authed, errorLine } from './api'
import { downscale, fileToBase64 } from './image'
import { AgentWallet, topUpLink, type WalletSnapshot } from './wallet'
import { pcmToWav, pcmSeconds } from './wav'
import { mountUi, setMirror, setStatus, setWallet, setWalletError, showTelegramLink } from './ui'

type State =
  | { name: 'home' }
  | { name: 'listening'; chunks: Uint8Array[]; bytes: number; startedAt: number }
  | { name: 'thinking'; photo?: boolean }
  | { name: 'snapping' }
  | { name: 'cards'; options: OptionCard[]; index: number }
  | { name: 'confirm'; options: OptionCard[]; index: number }
  | { name: 'paying'; option: OptionCard; step: 'signing' | 'confirming' }
  | { name: 'paid'; option: OptionCard; order: Order }
  | { name: 'cancelling'; option: OptionCard; done: boolean }
  | { name: 'message'; text: string }

const MAX_LISTEN_S = 12
const SWIPE_THROTTLE_MS = 300
const CONFIRM_POLL_MS = 2500
const CONFIRM_TIMEOUT_MS = 120_000
const FUND_URL: string =
  (import.meta.env.VITE_FUND_URL as string | undefined) || `${API_URL}/fund`

// Dev only: `?say=<text>` makes a tap send that text instead of opening the mic,
// so the simulator can run the full flow without a microphone or STT key.
const DEV_SAY = import.meta.env.DEV ? new URLSearchParams(location.search).get('say') : null

mountUi({
  onTypedRequest: text => void runAsk(() => askText(text), text),
  onSaveCaps: (pp, day) => void saveCaps(pp, day),
  onRevoke: () => void revoke(),
  onRefresh: () => void refreshWallet(),
  onLinkTelegram: () => void linkTelegram(),
  onPhoto: file => void snapFromFile(file),
})
setStatus('connecting', 'Connecting to glasses…')

const bridge = await waitForEvenAppBridge()
const ID = 1
const NAME = 'main'

let state: State = { name: 'home' }
let shown = ''
let renderTimer: number | null = null
let ticker: number | null = null
let lastSwipe = 0
let wallet: AgentWallet | null = null
let snap: WalletSnapshot | null = null
let walletOffline = false
let walletRetry: number | null = null

const created = await bridge.createStartUpPageContainer(
  new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [
      new TextContainerProperty({
        xPosition: 0, yPosition: 0, width: 576, height: 288,
        borderWidth: 0, borderColor: 5, paddingLength: 4,
        containerID: ID, containerName: NAME,
        content: S.home(null), isEventCapture: 1,
      }),
    ],
  }),
)
if (created !== 0) setStatus('error', `Glasses page failed (${created})`)
else setStatus('paused', 'Ready')
shown = S.home(null)
setMirror(shown)

// ---------- wallet ----------

function homeWallet(): S.HomeWallet | null {
  if (!snap || !wallet) return null
  return { balanceGram: snap.balanceGram, capLeftGram: wallet.capLeft(), revoked: snap.view.caps.revoked }
}

function walletView(): S.WalletView {
  return {
    balanceGram: snap?.balanceGram ?? 0,
    capLeftGram: wallet?.capLeft() ?? 0,
    perPurchaseGram: snap?.view.caps.perPurchaseGram ?? 0,
  }
}

function publishWallet() {
  if (!wallet || !snap) return
  setWallet({
    address: snap.address,
    balanceGram: snap.balanceGram,
    perPurchaseGram: snap.view.caps.perPurchaseGram,
    dailyGram: snap.view.caps.dailyGram,
    capLeftGram: wallet.capLeft(),
    revoked: snap.view.caps.revoked,
    fundUrl: `${FUND_URL}/?to=${encodeURIComponent(snap.address)}&amount=1`,
    tonLink: topUpLink(snap.address, 1),
    explorerUrl: explorerAddress(snap.address),
    telegramLinked: snap.view.telegramLinked,
  })
}

async function refreshWallet() {
  try {
    wallet ??= await AgentWallet.load(bridge)
    snap = await wallet.refresh()
    walletOffline = false
    publishWallet()
  } catch (err) {
    console.warn('[glancecart] wallet', err)
    walletOffline = true
    setWalletError(`Wallet unavailable: ${errorLine(err)}`)
    // Keep retrying in the background (e.g. phone was offline or the API restarted).
    if (walletRetry === null) {
      walletRetry = window.setTimeout(() => { walletRetry = null; void refreshWallet() }, 15_000)
    }
  }
  render()
}

async function saveCaps(perPurchaseGram: number, dailyGram: number) {
  try {
    await authed('PUT', '/wallets/me/caps', { perPurchaseGram, dailyGram })
  } catch (err) {
    alert(`Could not save caps: ${err instanceof ApiError ? err.code : err}`)
  }
  await refreshWallet()
}

async function linkTelegram() {
  try {
    const { url } = await authed<{ url: string }>('POST', '/wallets/me/telegram-link')
    showTelegramLink(url)
    window.open(url, '_blank')
  } catch (err) {
    alert(err instanceof ApiError && err.code === 'telegram_not_configured'
      ? 'The Telegram bot is not configured on the server (TELEGRAM_BOT_TOKEN).'
      : `Could not create a Telegram link: ${errorLine(err)}`)
  }
}

async function revoke() {
  if (!wallet) return
  try {
    const { owner } = await wallet.revoke()
    alert(owner ? `Revoked. Returning the balance to ${owner}.` : 'Revoked. No funding wallet found, so nothing to return.')
  } catch (err) {
    alert(`Revoke failed: ${errorLine(err)}`)
  }
  await refreshWallet()
}

void refreshWallet()

// ---------- rendering ----------

function secondsLeft(o: Order): number {
  return Math.max(0, Math.ceil(((o.cancelUntil ?? 0) - Date.now()) / 1000))
}

function blockFor(o: OptionCard): S.Block {
  if (!wallet || !snap) return 'invalid_amount'
  const c = wallet.check(o.gram, snap.balanceGram)
  return c.ok ? null : c.reason
}

function screenFor(s: State): string {
  switch (s.name) {
    case 'home': return S.home(homeWallet(), undefined, walletOffline)
    case 'listening': return S.listening(Math.floor((Date.now() - s.startedAt) / 1000))
    case 'thinking': return S.thinking(undefined, s.photo)
    case 'snapping': return S.snapping()
    case 'cards': return S.card(s.index, s.options.length, s.options[s.index])
    case 'confirm': {
      const o = s.options[s.index]
      if (!wallet || !snap) return S.error(walletOffline ? ERROR_LINES.wallet_unavailable : 'Wallet still loading...')
      return S.confirm(o, walletView(), blockFor(o))
    }
    case 'paying': return S.paying(s.option, s.step)
    case 'paid': return S.paid(s.option, s.order.orderId, secondsLeft(s.order), s.order.txHash, snap?.view.telegramLinked ?? false)
    case 'cancelling': return S.cancelled(s.option, s.done ? 'done' : 'working')
    case 'message': return s.text
  }
}

/** Debounced write to the glasses (BLE writes are slow, ~80 ms each). */
function render() {
  const text = screenFor(state)
  setMirror(text)
  if (renderTimer !== null) return
  renderTimer = window.setTimeout(async () => {
    renderTimer = null
    const latest = screenFor(state)
    if (latest === shown) return
    shown = latest
    await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: ID, containerName: NAME, content: latest }))
  }, 100)
}

function stopTicker() {
  if (ticker !== null) window.clearInterval(ticker)
  ticker = null
}

function go(next: State) {
  stopTicker()
  state = next
  render()
}

// ---------- voice ----------

async function startListening() {
  if (DEV_SAY) return runAsk(() => askText(DEV_SAY), DEV_SAY)
  go({ name: 'listening', chunks: [], bytes: 0, startedAt: Date.now() })
  setStatus('listening', 'Listening · tap to finish')
  const micOk = await bridge.audioControl(true, AudioInputSource.Glasses).catch(() => false)
  if (!micOk) {
    setStatus('error', 'Microphone unavailable')
    return go({ name: 'message', text: S.error(ERROR_LINES.mic_unavailable) })
  }
  ticker = window.setInterval(() => {
    if (state.name !== 'listening') return
    if (Date.now() - state.startedAt >= MAX_LISTEN_S * 1000) void stopListening(true)
    else render()
  }, 1000)
}

async function stopListening(send: boolean) {
  stopTicker()
  await bridge.audioControl(false)
  setStatus('paused', 'Ready')
  if (state.name !== 'listening') return
  const { chunks, bytes } = state
  if (!send) return go({ name: 'home' })
  if (pcmSeconds(bytes) < 0.4) return go({ name: 'message', text: S.error('Too short. Tap and speak') })
  await runAsk(() => askAudio(pcmToWav(chunks)))
}

// ---------- snap-to-buy ----------

async function snapPhoto() {
  go({ name: 'snapping' })
  let asset: Awaited<ReturnType<typeof bridge.captureImageFromCamera>> = null
  let unavailable = false
  try {
    asset = await bridge.captureImageFromCamera()
  } catch (err) {
    // e.g. the simulator: "unknown variant `captureImageFromCamera`"
    console.warn('[glancecart] camera', err)
    unavailable = true
  }
  if (state.name !== 'snapping') return // user cancelled on the glasses
  if (!asset?.base64) {
    return go({ name: 'message', text: S.error(unavailable ? ERROR_LINES.camera_unavailable : ERROR_LINES.camera_cancelled) })
  }
  await runPhoto(asset.base64, asset.mimeType)
}

async function snapFromFile(file: File) {
  if (!['home', 'message', 'snapping', 'cards'].includes(state.name)) return
  await runPhoto(await fileToBase64(file), file.type)
}

async function runPhoto(base64: string, mimeType: string) {
  try {
    const img = await downscale(base64, mimeType)
    await runAsk(() => askPhoto(img.base64, img.mediaType), undefined, true)
  } catch (err) {
    console.warn('[glancecart] photo', err)
    go({ name: 'message', text: S.error(err instanceof ApiError ? errorLine(err) : 'Could not read that photo') })
  }
}

async function runAsk(call: () => ReturnType<typeof askText>, typed?: string, photo = false) {
  go({ name: 'thinking', photo })
  if (typed) setMirror(S.thinking(typed))
  try {
    const res = await call()
    console.log('[glancecart] ask', res)
    if (res.intent.kind === 'unknown') return go({ name: 'message', text: S.error(`Didn't get an item: "${res.transcript}"`) })
    if (res.options.length === 0) return go({ name: 'message', text: S.noResults(res.intent.query) })
    go({ name: 'cards', options: res.options, index: 0 })
  } catch (err) {
    console.warn('[glancecart] ask failed', err)
    go({ name: 'message', text: S.error(errorLine(err)) })
  }
}

// ---------- purchase ----------

async function openConfirm(options: OptionCard[], index: number) {
  go({ name: 'confirm', options, index })
  // Refresh balance + caps so the screen shows live numbers (and any cap block).
  if (wallet) {
    try {
      snap = await wallet.refresh()
      publishWallet()
    } catch (err) {
      console.warn('[glancecart] refresh', err)
    }
    if (state.name === 'confirm') render()
  }
}

async function buy(option: OptionCard) {
  if (!wallet) return
  go({ name: 'paying', option, step: 'signing' })
  try {
    let order = await wallet.buy(option.productId, option.gram)
    go({ name: 'paying', option, step: 'confirming' })
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS
    while (order.status === 'confirming' && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, CONFIRM_POLL_MS))
      order = await wallet.order(order.orderId)
    }
    if (order.status !== 'paid') throw new ApiError(order.error ?? 'payment_not_seen', 502)
    console.log('[glancecart] paid', order)
    showPaid(option, order)
    void refreshWallet()
  } catch (err) {
    console.warn('[glancecart] buy failed', err)
    go({ name: 'message', text: S.error(errorLine(err)) })
    void refreshWallet()
  }
}

function showPaid(option: OptionCard, order: Order) {
  go({ name: 'paid', option, order })
  ticker = window.setInterval(() => {
    if (state.name !== 'paid') return stopTicker()
    render()
    if (secondsLeft(state.order) === 0) stopTicker()
  }, 1000)
}

async function cancel(option: OptionCard, order: Order) {
  go({ name: 'cancelling', option, done: false })
  try {
    await wallet!.cancel(order.orderId)
    go({ name: 'cancelling', option, done: true })
  } catch (err) {
    go({ name: 'message', text: S.error(errorLine(err)) })
  }
  void refreshWallet()
}

// ---------- input ----------

type Gesture = 'tap' | 'double' | 'up' | 'down' | 'hold' | 'release'

function onGesture(g: Gesture) {
  const s = state
  switch (s.name) {
    case 'home':
      if (g === 'tap' || g === 'hold') void startListening()
      else if (g === 'up' || g === 'down') void snapPhoto()
      // QA rule: double tap on the root screen opens the system exit dialog.
      else if (g === 'double') void bridge.shutDownPageContainer(1)
      return
    case 'snapping':
      if (g === 'double') go({ name: 'home' })
      return
    case 'listening':
      if (g === 'tap' || g === 'release') void stopListening(true)
      else if (g === 'double') void stopListening(false)
      return
    case 'cards':
      if (g === 'up' || g === 'down') {
        const now = Date.now()
        if (now - lastSwipe < SWIPE_THROTTLE_MS) return
        lastSwipe = now
        const n = s.options.length
        go({ ...s, index: (s.index + (g === 'down' ? 1 : n - 1)) % n })
      } else if (g === 'tap') void openConfirm(s.options, s.index)
      else if (g === 'double') go({ name: 'home' })
      return
    case 'confirm':
      // Only a deliberate hold buys, and only when no cap/balance rule blocks it.
      // A single tap never buys.
      if (g === 'hold' && blockFor(s.options[s.index]) === null) void buy(s.options[s.index])
      else if (g === 'double') go({ name: 'cards', options: s.options, index: s.index })
      return
    case 'paid':
      if (g === 'tap') {
        if (secondsLeft(s.order) > 0) void cancel(s.option, s.order)
        else go({ name: 'home' })
      } else if (g === 'double' && secondsLeft(s.order) === 0) go({ name: 'home' })
      return
    case 'cancelling':
      if (s.done && (g === 'tap' || g === 'double')) go({ name: 'home' })
      return
    case 'message':
      if (g === 'tap' || g === 'double') go({ name: 'home' })
      return
    case 'thinking':
    case 'paying':
      return // busy; ignore input
  }
}

// CLICK_EVENT is 0 and protobuf drops zero values, so a tap arrives with
// eventType undefined. Default only when the envelope itself exists.
function typeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

const GESTURES: Partial<Record<OsEventTypeList, Gesture>> = {
  [OsEventTypeList.CLICK_EVENT]: 'tap',
  [OsEventTypeList.DOUBLE_CLICK_EVENT]: 'double',
  [OsEventTypeList.SCROLL_TOP_EVENT]: 'up',
  [OsEventTypeList.SCROLL_BOTTOM_EVENT]: 'down',
  [OsEventTypeList.LONG_PRESS_EVENT]: 'hold',
  [OsEventTypeList.LONG_PRESS_RELEASE_EVENT]: 'release',
}

const unsubscribe = bridge.onEvenHubEvent(event => {
  const pcm = event.audioEvent?.audioPcm
  if (pcm) {
    if (state.name === 'listening') {
      state.chunks.push(pcm)
      state.bytes += pcm.byteLength
    }
    return
  }
  // One gesture per envelope: the simulator sends taps on sysEvent and swipes on
  // textEvent; hardware may differ, so take the first envelope present.
  const t = typeOf(event.textEvent) ?? typeOf(event.listEvent) ?? typeOf(event.sysEvent)
  if (t === null) return
  if (t === OsEventTypeList.SYSTEM_EXIT_EVENT || t === OsEventTypeList.ABNORMAL_EXIT_EVENT) return cleanup()
  if (t === OsEventTypeList.FOREGROUND_ENTER_EVENT && state.name === 'home') return void refreshWallet()
  // App went to the background mid-recording: the mic stops anyway, so drop the take.
  if (t === OsEventTypeList.FOREGROUND_EXIT_EVENT && state.name === 'listening') return void stopListening(false)
  const g = GESTURES[t]
  if (g) {
    console.log('[glancecart] gesture', g, 'in', state.name)
    onGesture(g)
  }
})

let cleanedUp = false
function cleanup() {
  if (cleanedUp) return
  cleanedUp = true
  void bridge.audioControl(false)
  unsubscribe()
}
window.addEventListener('beforeunload', cleanup)
