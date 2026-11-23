# GlanceCart — plan

Voice shopping on Even Realities G2: say it, see 3 options, hold to buy, paid in test GRAM on TON testnet from a capped agent wallet funded by the user's Gram Wallet.

Deadline: **2026-11-29 19:59 UTC**. Rules: [RULES.md](RULES.md).

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Main track 02 (Crypto & DeFi), second track 01 (Telegram)**, plus the Best Telegram special prize. | Gram Wallet is the core integration; the Telegram bot is a real second integration. |
| D2 | **Agent wallet key lives on the user's phone**, generated in the Even app WebView and kept in bridge storage (`setLocalStorage`). The server never sees keys or holds funds. | RULES: "Do not hold user funds"; custody stays with the user. |
| D3 | Agent wallet = **W5R1 testnet wallet** (`@ton/ton`, `walletId.networkGlobalId = -3`). TON Tech Agentic Wallets are documented as the production path but not used. | Agentic Wallets (2026-04-28) are a developer preview, unaudited, mainnet-first, and have **no spending limits**, so they add nothing for caps. |
| D4 | **Caps**: per-purchase and daily caps are enforced in the signing module on the phone (it refuses to sign), and checked again by the API (it refuses to build an order). The **wallet balance is the hard cap**: the user deposits only a small budget. **Revoke** = sweep the balance back to the owner's Gram Wallet and wipe the key. | No standard on-chain spending-limit extension exists for W5. |
| D5 | **Owner wallet = Gram Wallet via TON Connect** (`@tonconnect/ui`, wallet `gramwallet`, network `-3`). It is used for funding, balance, sweep-back on revoke, and the Gram Wallet address on receipts. Funding runs on a separate page (also usable as a Telegram Mini App), with a `ton://transfer` QR as fallback. | Wallet handoff from the Even app WebView to another app is unverified; a separate page avoids it. |
| D6 | **Price in test GRAM**, not USDT. | Native transfers are simpler. The testnet USDT faucet's jetton is unverified, and `@x402/tvm` is jetton-only. |
| D7 | **Mock store uses an x402-style 402 flow, built in-house.** `GET /buy` returns 402 with `{payTo, amount, memo, expires}`. The phone signs and sends the GRAM transfer, then `POST /settle {boc/txHash}`. The store verifies on-chain via toncenter. Refunds come from the store's own testnet wallet (the merchant's funds, not the user's). | Keeps the 402 story without a jetton facilitator. |
| D8 | **Gestures**: tap = select / next step; swipe = move between cards; **hold (LONG_PRESS) on the confirm screen = buy**. Double tap on the home screen = exit (QA requires `shutDownPageContainer(1)`); double tap elsewhere = back / cancel. A single tap never buys. Talk = tap to start listening, tap again to stop (hold-to-talk also works via press/release). | The prompt wanted double-press-to-confirm, but double tap is reserved for exit on the root page and tap-then-hold is claimed by the OS menu. |
| D9 | **STT via our API** (`POST /stt`). The phone buffers 16 kHz s16le PCM while listening and uploads it as WAV when the user stops. Provider: **Deepgram** (pre-recorded endpoint) behind a `SttProvider` interface; Whisper is the swap-in. | Never ship API keys in the app (the template's `VITE_STT_API_KEY` pattern is dropped). Batch upload is simpler than streaming and fine for short phrases. |
| D10 | Intent + ranking: Anthropic API, `claude-sonnet-5-5`, JSON output, called only from the API. | Per the prompt. |
| D11 | Monorepo with pnpm workspaces: `apps/glasses` (Vite + TS + SDK 0.0.16), `apps/api` (Hono), `apps/mock-store` (Hono), `apps/fund` (TON Connect funding page), `packages/shared`. | |
| D12 | Screen copy: ASCII plus `·` and `★` only. **No `✓`**: Dingbats aren't in the G2 font and unsupported glyphs are silently dropped. Target ≤ 8 lines, ~46 chars per line (verify in the simulator per screen). | even-g2-notes glyph table. |
| D13 | Persist with bridge `setLocalStorage` / `getLocalStorage`, not browser `localStorage`. | Docs and community notes disagree on whether browser storage persists. |
| D14 | Handle tap/double-tap from `sysEvent`, `textEvent` **and** `listEvent`; `CLICK_EVENT = 0` arrives as `undefined` inside an existing envelope. | The simulator sends taps on `sysEvent` and swipes on `textEvent`; hardware reportedly differs. |

## Open questions

1. **Organizers**: does "built on Gram Wallet" accept a testnet flow? Telegram's native Gram wallet is **mainnet only**; the standalone Gram Wallet app (gramwallet.io) has no documented testnet support. Fallback if it can't do testnet: TON Connect with Tonkeeper testnet for the demo, plus a mainnet "connect + read balance" with Gram Wallet (no spending). Ask in the hackathon chat on Day 1.
2. Do we have real G2 glasses for testing (affects Day 4)?
3. Team members and names for SUBMISSION.md.
4. Deployment host for the API and store (Fly vs Vercel). Default: **Fly.io**, because Hono plus a Telegram long-poll bot fits a long-running process. Decide on Day 4.

## Risks

| Risk | Mitigation |
|---|---|
| Gram Wallet has no testnet support | Open question 1. Funding page works with any TON Connect wallet; documented. |
| Even app WebView won't open wallet deep links | Funding happens on a separate page / Telegram Mini App, never inside the glasses app. |
| Android kills the WebView in the background; the mic stops when it's suspended | Re-enable the mic on `FOREGROUND_ENTER_EVENT`; keep the key in bridge storage. |
| toncenter testnet is limited to 1 request/s without a key | Get a testnet key from @tonapibot; cache balances; poll with backoff. |
| Testnet faucet limit (~2 GRAM per request, a few per hour) | Keep prices at 0.1–2 test GRAM (display "price in test GRAM"); fund early. |
| Real-hardware PCM chunk size unknown | Buffer by bytes, not by frame count. |
| BLE redraw cost (~83 ms per upgrade, ~165 ms per rebuild) | One idea per screen; debounce; prefer a single text container. |

## Day plan

- **Day 1 (Nov 23)**: rules, docs, this plan, monorepo, hello + input log in the simulator. **Checkpoint 1.**
- **Day 2**: mic → `/stt` → `/intent` → store search → 3 cards, swipe to navigate; payment mocked. **Checkpoint 2.**
- **Day 3**: phone-side W5 wallet, 402 flow, caps, confirm screen, 30 s cancel + refund, Gram Wallet funding page. **Checkpoint 3.**
- **Day 4**: Telegram bot (receipts, caps, top-up link, daily summary), reorder, deploy, QR test on glasses. **Checkpoint 4.**
- **Day 5**: snap-to-buy if time allows; error screens (offline, STT fail, low balance, out of stock, cap hit).
- **Day 6 (Nov 28)**: README, pre-existing code disclosure, `.ehpk`, DEMO_SCRIPT.md (≤ 3 min), SUBMISSION.md, API_FEEDBACK.md (≤ 5 requests). **Final checkpoint.**
- **Nov 29**: buffer only.

Cut order if late: snap-to-buy → reorder → Telegram shop-bot purchase. Never cut the safety features or the end-to-end demo.

## Day 5 notes

- **Errors**: every failure maps to an error code and one line of ≤ 46 chars (`apps/glasses/src/errors.ts`). A test renders all of them as screens.
  - New codes: `store_unavailable`, `stt_failed`, `timeout`, `refund_failed`, `mic_unavailable`, `wallet_unavailable`, `camera_unavailable` / `camera_cancelled`, `no_product_in_photo`, `vision_not_configured`.
  - The API wraps every store call, so a store outage returns 502 `store_unavailable` instead of a 500.
- **Wallet offline**: the home screen shows "Wallet offline · retrying" and retries every 15 s.
- **Recording and the background**: if the app goes to the background mid-recording, the take is dropped.
- **D28 Snap-to-buy**: swipe on the home screen (or "Snap from a photo" in the phone panel) → phone camera (`captureImageFromCamera`, `camera` permission) → downscale to 1024 px JPEG on the phone → `POST /snap`. Claude vision returns `{found, query, label, shelfPriceUsd}`, then normal search and ranking. The card's "why" compares with the shelf: "$12.00 less than here ($34.00)". It needs `ANTHROPIC_API_KEY` (which costs money); without it the glasses say "Photo search not set up".
- **Simulator findings**: the mic works (PCM recorded → `/ask` → "Speech service not set up" without a key). `captureImageFromCamera` is not implemented in simulator 0.9.5 ("unknown variant"), so snap is testable only through the phone-panel photo upload or on hardware.

## Day 4 notes

- **D27 (replaces D25 as the default): no paid hosting.** The API, store and bot run locally. The bot long-polls, so it needs no inbound URL. The funding page is static and talks only to the wallet, so it goes on free **GitHub Pages**; its TON Connect manifest is emitted at build time with the Pages URL. When public HTTPS is needed for the API (packaged `.ehpk`, glasses off your Wi-Fi), a free **Cloudflare quick tunnel** (`pnpm tunnel`) is used, plus `pnpm set-origin <url>` to update the whitelist and build URL. The Fly config stays as an optional paid path. Judging needs the repo and the video, not a live server.

- **D21**: The Telegram bot (grammY, long polling) runs inside the API process. Linking uses a one-time code (10 min, single use) through a `t.me/<bot>?start=` deep link, and the chat id is stored on the wallet record. The command logic is a plain function (`handleCommand`) with tests.
- **D22**: A receipt is sent **after** the cancel window (`cancelUntil + 1.5 s`), and only if the store still reports the order as paid. A cancelled order gets a refund note instead, never both.
- **D23**: Revoke from Telegram blocks purchases immediately (caps.revoked). Sweeping the funds back still needs the phone, because only the phone holds the key. That is the price of the non-custodial design, and the bot says so.
- **D24**: Reorder matches the latest **paid** purchase in the history by title words, then re-reads price and stock from the store. Refunded orders are skipped.
- **D25**: Deploy is **one Fly.io container**: the API is public on :8080, the mock store is internal on 127.0.0.1:8788, and the funding page is served at `/fund/`. The TON Connect manifest is generated from `PUBLIC_URL`. A Fly volume `/data` holds `state.json`. The machine never auto-stops, because the bot long-polls and receipts are timers.
- **D26**: Phone storage writes to both the bridge and WebView `localStorage`. In the simulator the bridge storage doesn't survive a restart, which regenerated the agent wallet (and its address) each launch. Fixed and verified across two restarts.
- `.ehpk` packs: `evenhub pack` stamped `min_app_version` 2.2.10 (the SDK 0.0.16 floor), and the network whitelist holds the reserved placeholder `https://api.glancecart.example` until `pnpm set-origin <url>` is run (D29: never whitelist a domain we do not control).
- Not done yet, because these need you: creating the bot with BotFather, pushing the repo to GitHub and enabling Pages, testing on real glasses. The Telegram shop-bot purchase (bonus) is deferred.

## Day 3 notes

**Payment flow (x402-style, TON testnet, native GRAM):**
1. Glasses → API `POST /purchase/quote`. The API checks caps first, then the store answers **HTTP 402** with `{scheme: exact, network: tvm:-3, asset: GRAM, amount (nano), payTo, memo = orderId, expiresAt}` (also as an `X-Payment-Required` header).
2. The phone verifies the requirements: testnet only, amount no higher than the price shown on the confirm screen, quote not expired. It checks caps again plus the on-chain balance, then **signs a W5R1 transfer locally** with the memo as comment. The first payment also deploys the wallet.
3. API `POST /purchase/pay` re-checks caps, records a pending spend, and relays to the store as `X-Payment: base64({orderId, boc})`. The store broadcasts and answers 202.
4. The store watches its own wallet for an incoming transfer with that comment, from that payer, for at least the amount. Then the order is `paid` with `cancelUntil = paidAt + 30 s`.
5. Cancel inside the window: the store refunds from its own merchant wallet, with comment `refund <orderId>`.

**Decisions:**
- **D15**: Caps live in the API, keyed by agent address: settings only, no funds. They are editable from the phone (and Telegram on Day 4). The phone enforces them using the larger of the API's and its own local spend ledger, so a server bug can't make it overspend. The balance stays the hard cap.
- **D16**: The phone reaches toncenter through an API relay (`/ton/jsonRPC`) that allows only the wallet's read methods and `sendBoc`, so the toncenter key stays on the server. The relay spaces calls 1.1 s apart when no key is set.
- **D17**: Revoke sets `revoked` in the API and on the phone, then sweeps the whole balance (`CARRY_ALL_REMAINING_BALANCE`) to the address that first funded the wallet. That address is read from the chain, not from any server, so a compromised API can't redirect the sweep.
- **D18**: The phone authenticates to the API with a per-wallet bearer token. It is created at registration and stored hashed on the server.
- **D19**: The key is stored in plain form in Even app bridge storage. Encrypting it without a user secret would only look safe. This is acceptable for testnet; noted as a production gap (use the platform keystore, or an Agentic Wallet with operator-key revocation).
- **D20**: The funding page (`apps/fund`) uses `@tonconnect/ui` 5 with `setConnectionNetwork('-3')`, so a mainnet wallet is refused at connect time. A `ton://transfer` link is the fallback. TON Connect wallets fetch the manifest over public HTTPS, so funding via TON Connect only works once `apps/fund` is deployed (Day 4).

**Verified in the simulator:** the agent wallet is created on the phone side, registered and read from testnet through the relay. With 0 GRAM the confirm screen says "Not enough GRAM" and holding does nothing. The phone wallet panel shows the address, balance, cap editor, fund links and revoke.

**Not yet verified, because it needs test GRAM:** a real payment, confirmation, cancel/refund and revoke sweep on testnet. TON Connect from Gram Wallet also needs the deployed manifest and a wallet set to testnet.

## Day 2 notes

- **Pricing**: catalog prices are realistic USD; charged in test GRAM at a fixed demo rate `USD_PER_GRAM = 100` (`packages/shared`), so $12.40 = 0.124 GRAM and the faucet's ~2 GRAM covers many demo buys.
- **Pipeline**: one round trip `POST /ask` (WAV body, or JSON `{text}`) → STT → intent → store search → ranking → 3 cards. Each LLM step falls back to rules when there is no key or the call fails, so the demo never hard-fails on the LLM.
- **LLM calls** use `claude-sonnet-5-5`, structured outputs (Zod), `effort: low`, and server-side refusal fallback (`fallbacks: "default"`).
- **Search**: keyword scoring with plural folding and "USB C" → "usb-c" normalization; hard filters for price, delivery days (from the deadline) and stock.
- **Input routing**: one gesture per event envelope (first of `textEvent` / `listEvent` / `sysEvent`), swipes throttled to 300 ms.
- **Dev hook**: `?say=<text>` (dev builds only) replaces the mic with a scripted request, so the simulator automation API can run the whole loop.
- The simulator doesn't draw the system exit dialog: double tap on home blanks the page there. Check on hardware.
- Not yet tested: real mic → Deepgram (needs `DEEPGRAM_API_KEY`), Claude intent and ranking (needs `ANTHROPIC_API_KEY`).

## Verified on Day 1 (simulator 0.9.5, SDK 0.0.16)

- Text container renders; `·` renders.
- Events received: tap → `sysEvent` (eventType omitted = CLICK, carries `eventSource`), swipe up/down → `textEvent` (1/2), hold → `sysEvent` 9, release → `sysEvent` 10.
- Simulator automation API on `--automation-port 9898`: `POST /api/input {action}`, `GET /api/screenshot/glasses`, `GET /api/console`. Used to test screens without clicking.
