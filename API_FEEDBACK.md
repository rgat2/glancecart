# API feedback and feature requests

From building GlanceCart (Even Hub SDK 0.0.16, simulator 0.9.5, CLI 0.2.0; TON Connect UI 5.0.4). The submission allows five requests; each one below comes from a problem we actually hit.

## Feature requests (5)

### 1. Even Hub: secure key storage
`setLocalStorage` is plain key-value storage. A non-custodial agent wallet (or any app holding a credential) needs the phone's **Keychain / Android Keystore**, ideally with biometric unlock:

```ts
bridge.secureStore.set(key, value, { requireBiometric?: boolean })
bridge.secureStore.get(key)
```

Today we keep a testnet key in plain bridge storage and document that as a production gap. Crypto and payment apps on G2 need this.

### 2. Even Hub: open an external URL / deep link
There is no documented way for the app to hand a URL to the OS. That covers wallet deep links (`ton://transfer`, TON Connect universal links), `t.me/<bot>?start=…`, and the system browser. We moved wallet funding to a separate web page and rely on `window.open` working inside the WebView.

Request: `bridge.openExternalUrl(url)`, plus a way to come back to the app afterwards (a return URL scheme for the Even app).

### 3. Even Hub: simulator parity
These differences cost us debugging time. Each one hides a real-device behavior:
- `captureImageFromCamera` fails in simulator 0.9.5 ("unknown variant `captureImageFromCamera`").
- Bridge `setLocalStorage` doesn't survive a simulator restart, so our wallet key was silently regenerated on every launch. We now mirror it to WebView `localStorage`.
- `shutDownPageContainer(1)` blanks the page instead of drawing the system exit dialog.
- There is no way to inject mic audio from a file, or to `eval` in the page over the automation API. The automation API itself is great; adding `POST /api/audio` (WAV) and `POST /api/eval` would make voice apps fully testable in CI.

### 4. Even Hub: a confirm primitive for money actions
Today an app picks its own "confirm" gesture. Double tap is reserved for exit on the root page, tap-then-hold opens the OS menu, and we can't set the long-press threshold or give haptic or audio feedback (G2 has no speaker).

Request: an OS-drawn confirm sheet that shows the amount and recipient, with a fixed and consistent gesture and haptic feedback on the R1 ring. Users would learn one safe "yes, spend" motion across all G2 apps, and a web app couldn't fake it.

### 5. Gram Wallet / Telegram Wallet: testnet support for TON Connect
Telegram's native Gram wallet is mainnet only, and the standalone Gram Wallet app doesn't document testnet. That makes "build on Gram Wallet" and "demos use testnet" pull against each other.

Request: a testnet mode (or a developer toggle) that accepts `network: "-3"` in TON Connect, plus testnet deep links (`ton://transfer` with a testnet flag).

## Other limits we hit (not counted as requests)

- **Network whitelist needs exact origins.** It doesn't work with changing dev URLs (tunnels, LAN IPs). A dev-mode wildcard would help, for example `https://*.trycloudflare.com` when the app is sideloaded via `evenhub qr`.
- **Font coverage is undocumented.** Unsupported glyphs are dropped silently (we hit `✓` and `…`). A published glyph list, or a fallback box character, would help.
- **No per-line or char-width metric.** We test against a ~46-chars × 8-lines budget estimated from screenshots. Something like `measureText(content, width)` would let apps paginate correctly.
- **Docs lag the npm releases.** For example, the docs say SDK 0.0.14 is current while 0.0.16 ships, and the long-press `eventSource` note is out of date. The `evenhub-templates` pin SDK `^0.0.10` and `min_app_version 2.0.0`.
- **No built-in speech-to-text.** Each app sends raw PCM to its own server. An optional hosted, streaming STT (even rate-limited) would lower the barrier for voice-first apps a lot.
