# DoraHacks submission: GlanceCart

_Copy each field into the DoraHacks "Submit Build" form. Fill the placeholders marked ✏️._

## Title
GlanceCart

## Tagline
Say it, see it, hold to buy: voice shopping on Even G2, paid from a capped TON agent wallet you control.

## Tracks
- **Main:** 02 · Crypto & DeFi (Gram Wallet)
- **Second:** 01 · Messaging & News (Telegram)
- **Special prize:** Best Telegram integration

## Links
- Repo: https://github.com/rgat2/glancecart
- Demo video (≤ 3 min): ✏️ `<YouTube/Drive link>` (file: `media/glancecart-demo.mp4`, not in git)
- Packaged build: `glancecart.ehpk`, attached to the GitHub release (build with `pnpm --filter @glancecart/glasses pack:ehpk`)
- Funding page: https://rgat2.github.io/glancecart/ (after enabling Pages → GitHub Actions)
- On-chain proof (TON testnet agent wallet): https://testnet.tonviewer.com/0QAUwEtUl4OdPveQOPDRFLYRBd7M-Q_HOAFqhCxf7Dc15gtv

## Brief description
Voice shopping for Even G2: say what you need, glance at three options, hold to buy. Paid on TON testnet from a capped, non-custodial agent wallet, with receipts in Telegram.

## Long description (paste into "Describe your Build")

````markdown
## The problem
Small purchases come up at awkward moments. You're cooking and the coffee is almost gone, or your cable dies mid-task. Getting out your phone, opening an app, searching, comparing and paying takes minutes and breaks your focus. Handing the job to an AI agent raises a fair worry: **what stops it from spending your money?**

GlanceCart lets Even G2 glasses shop for you in a few seconds, from a wallet that **can't overspend**, because you set the limits and you hold the key.

## How it works
1. **Say it.** Tap the temple or the R1 ring and say *"Find a USB-C cable under 15 dollars by Friday."* The glasses mic records only between your taps. Our server transcribes it (Deepgram) and turns it into a structured query (Claude, with a rules fallback so it still works without an AI key).
2. **See it.** Up to three options, one per screen: price in test GRAM, delivery day and a one-line reason ("cheapest, 4.6★"). Swipe to compare.
3. **Confirm.** The confirm screen shows the total, your balance after purchase and the cap left today. **A single tap never buys. Only a deliberate hold does.**
4. **Pay.** The store answers with an x402-style **HTTP 402** quote. The **agent wallet on your phone** (TON W5, testnet) checks the quote against your caps, signs the transfer locally and sends it. The server only relays signed transfers and never holds keys or funds. The store sees the payment on-chain by its order ID.
5. **Undo or done.** You get a 30-second window to tap and cancel, and the store **refunds on-chain**. After the window closes, the receipt arrives in **Telegram** with an explorer link.

You fund the agent wallet from **Gram Wallet** through TON Connect (testnet enforced). The wallet balance is the hard limit on top of your caps.

## Key features
| Feature | What you do |
|---|---|
| Voice search | One sentence with budget and deadline: "AA batteries by tomorrow" |
| Glanceable cards | Three options on the 576×288 display, swipe to compare |
| Hold to buy | Only a long press pays. Taps never do. |
| 30 s cancel + refund | Tap during the countdown and the money comes back on-chain |
| Reorder | "Reorder the coffee beans" gives one card, "same as last time" |
| Spending caps | Per purchase and per 24 h. Checked on the phone **and** the server; over the cap, the glasses show no hold option at all |
| Telegram bot | Receipts, cancel notices, daily summary, `/status`, `/caps` with one-tap buttons, `/topup`, `/revoke` |
| Revoke | Blocks purchases instantly (also from Telegram); the phone can sweep the balance back to the wallet that funded it |
| Snap-to-buy | Photo of a shelf price, compared with the store (needs a Claude key; not in the demo) |

**Verified on TON testnet** (all visible at [the agent wallet on tonviewer](https://testnet.tonviewer.com/0QAUwEtUl4OdPveQOPDRFLYRBd7M-Q_HOAFqhCxf7Dc15gtv)): purchases, a cancel with on-chain refund, a reorder, and Telegram receipts. Each transfer carries its order ID as the comment.

## Tech stack
- **Glasses app:** Even Hub SDK 0.0.16 (text containers, touch, R1 ring, long press, glasses mic, bridge storage), TypeScript + Vite, packaged as `.ehpk` with `evenhub pack`
- **Crypto:** TON testnet; `@ton/ton` W5R1 agent wallet signed on the phone; TON Connect UI 5 for funding from Gram Wallet; x402-style 402 payments in native GRAM; toncenter testnet through an allow-listed, testnet-only relay
- **AI and voice:** Deepgram speech-to-text (Whisper-compatible option); Claude (`claude-sonnet-5-5`, structured outputs) for intent, ranking and product photos, with rule-based fallbacks
- **Telegram:** grammY bot, linked to the wallet with a one-time deep-link code
- **Backend:** Node + Hono API and a mock store; pnpm monorepo; **111 Vitest tests** (intent parser, caps, payment flow, refunds, bot, relay)

## Hackathon requirements
- **Tracks:** main **02 Crypto & DeFi (Gram Wallet)**, second **01 Messaging (Telegram)**, plus **Best Telegram integration**
- **Money safety:** testnet only; non-custodial (the key never leaves the phone); caps enforced on the phone, the server and the wallet balance; hold to confirm; 30 s cancel with refund; revoke. No financial advice.
- **No secrets in the repo or the app:** provider keys live on the server, and `.env` is gitignored
- **Privacy:** the mic is on only between taps; no always-on listening
- **Public repo** with setup instructions: https://github.com/rgat2/glancecart
- **Demo video** (≤ 3 min, recorded in the Even Hub simulator plus Telegram on a phone): ✏️ link
- **Packaged build:** `glancecart.ehpk` on the GitHub release
- **What existed before Nov 23:** the official `evenhub-templates/asr` scaffold (MIT) and open-source libraries; all app code was written during the build week (see README)
- **Feature requests (5):** secure key storage, open external URL, simulator parity, an OS confirm primitive for payments, and Gram Wallet testnet support (see `API_FEEDBACK.md`)
````

## Notes for the form (older draft below)

**Problem.** Small purchases happen at awkward moments: you're cooking and notice the coffee is almost gone, or you're at your desk and your cable dies. Pulling out your phone, opening an app, searching, comparing and paying takes minutes. Letting an AI agent buy for you raises a fair worry: what stops it from spending your money?

**Who it's for.** Even G2 wearers who want quick, hands-free errands, and anyone who wants an AI shopping agent with hard limits they set themselves.

**How it works.**
1. **Say it.** Tap the temple or R1 ring and say "USB-C cable under 15 dollars by Friday". The glasses mic streams PCM to our server for speech-to-text. Claude turns the request into a structured query, and a rule-based fallback keeps it working offline.
2. **See it.** Up to three option cards, one per screen: price in test GRAM, delivery day, and a one-line reason ("cheapest, 4.6★"). Swipe to compare.
3. **Confirm.** The confirm screen shows the total, your wallet balance after purchase, and the cap left today. Only a deliberate **hold** buys; a single tap never does.
4. **Pay.** The store answers with an x402-style **HTTP 402** payment requirement. The **agent wallet on your phone** (TON W5, testnet) checks the quote and your caps, then signs the transfer locally. The server only relays already-signed transfers and never holds keys or funds. The store sees the payment on TON testnet.
5. **Done.** You have 30 seconds to tap and cancel for an on-chain refund. After that, @xzec_bot sends the receipt with an explorer link.

You fund the agent wallet from **Gram Wallet** through TON Connect (testnet enforced). The balance is the hard limit. Per-purchase and 24-hour caps are enforced on the phone and on the server, and you can change them from the phone or from Telegram with one tap. **Revoke** blocks purchases instantly (from Telegram too) and sweeps the balance back to your Gram Wallet.

Extras:
- **Reorder** ("same as last time") is one sentence and one hold.
- **Snap-to-buy** compares a shelf price in a photo with online prices.
- **A daily spend summary** arrives in Telegram.

**Why G2.** It's the read-and-write loop the hackathon asks for: one thing on screen, a short phrase to act, one hold to confirm. Custody stays with the user, and the money moves on TON.

## Tech used
- **Glasses app:** Even Hub SDK 0.0.16 (text containers, touch and R1 ring events, long press, glasses mic, phone camera, bridge storage), Vite + TypeScript, packaged with `evenhub pack`.
- **Crypto:**
  - TON testnet
  - `@ton/ton` W5R1 wallet signed on the phone
  - TON Connect (`@tonconnect/ui` 5) to fund from Gram Wallet
  - x402-style 402 payment flow with native GRAM
  - toncenter testnet through an allow-listed relay
- **AI:** Claude `claude-sonnet-5-5` (structured outputs) for intent, ranking and product photos; Deepgram speech-to-text, swappable for Whisper.
- **Telegram:** a grammY bot for receipts, daily summary, caps with inline buttons, top-up and revoke, linked with a one-time deep-link code.
- **Server:** Node + Hono, with 111 Vitest tests.

## Safety summary
- Testnet only.
- Non-custodial: the key never leaves the phone.
- Caps enforced in three places: phone, server and the wallet balance.
- Hold to confirm.
- 30 s cancel window with refunds.
- Revoke sweeps funds back to the owner.
- No API keys in the app.
- The mic is on only between taps.

## Team
✏️ Name, role, contact (Telegram/GitHub), for each member (1–4)

## What existed before Nov 23
See the README section "What existed before Nov 23, 2026". In short: the official `evenhub-templates/asr` scaffold (MIT) and open-source libraries. All app code was written during the hackathon.

## Feature requests for the API teams (optional, ≤ 5)
See [API_FEEDBACK.md](API_FEEDBACK.md).

## How did you hear about this hackathon?
✏️ (Name the community that sent you; this counts toward the Community Partner Award.)
