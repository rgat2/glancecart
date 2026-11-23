# GlanceCart: demo video script (target 2:50, hard limit 3:00)

The rules allow recording in the simulator. Shot in the Even Hub simulator plus three windows; on real G2, swap the simulator for a phone filming through the lens.

## Before recording (checklist)

- [ ] `.env` has `DEEPGRAM_API_KEY` (free credit) and `TELEGRAM_BOT_TOKEN`. `ANTHROPIC_API_KEY` is optional; the rules parser handles every phrase below. Add a testnet `TONCENTER_API_KEY`: without it every testnet call waits ~1 s.
- [ ] The store wallet has ≥ 2 test GRAM and the agent wallet ≥ 1 test GRAM (@testgiver_ton_bot). Fund the agent wallet through **Fund from Gram Wallet** once beforehand, so the funding transaction is on the explorer.
- [ ] The phone panel says Telegram is **linked**. Caps are the defaults: 0.5 GRAM per purchase, 1 GRAM per 24 h.
- [ ] Do one throwaway purchase of coffee beans (p11) and let its window pass, so **reorder** has history.
- [ ] Open the windows: simulator (left), phone panel (simulator webview, or the browser at `localhost:5173`), Telegram Desktop with @xzec_bot, and a browser tab on `testnet.tonviewer.com/<agent address>`.
- [ ] `pnpm dev` is running, the simulator mic is selected (`--aid`), and notifications are muted.
- [ ] If the mic isn't reliable, record with `?say=` (dev builds), and say on camera that it's scripted.

## Shot list

| Time | Show | Voiceover (say it slowly; it's short on purpose) |
|---|---|---|
| **0:00–0:12** | Title card: "GlanceCart · say it, see it, hold to buy" over the simulator home screen showing `Wallet 1.2 GRAM · cap left 1 GRAM` | "You're mid-task and you remember you're out of cables. GlanceCart lets your Even G2 glasses shop for you, with a wallet that can't overspend." |
| **0:12–0:30** | Tap. The screen shows `Listening... 3s`. Speak: **"Find a USB-C cable under fifteen dollars by Friday."** Tap again. | "I tap and say what I need. My glasses only listen between my two taps." |
| **0:30–0:50** | `Searching the store...` → card 1/3. Swipe through 2/3 and 3/3, then back to 2/3. | "Three options, one per screen: price in test GRAM, when it arrives, and one line on why. I swipe to compare." |
| **0:50–1:08** | Tap on 2/3 → confirm screen. Point at `Wallet after` / `Cap left today`. **Tap once**: nothing happens. | "Before anything moves I see the total, my balance after, and what's left of today's cap. A single tap never buys." |
| **1:08–1:30** | **Hold** → `Signing on your phone...` → `Confirming on TON testnet...` → `Paid 0.124 GRAM · …` with `Tap = cancel (29s)`. Cut to tonviewer: the transfer, with the order id as comment. | "I hold to confirm. The agent wallet on my phone signs the payment itself; the server never has the key. The store answered with an HTTP 402 quote, and here's the payment on TON testnet." |
| **1:30–1:45** | Wait out the countdown → `Receipt sent to Telegram`. Telegram pops the receipt with the explorer link. | "After the 30-second cancel window, the receipt lands in Telegram." |
| **1:45–2:05** | Tap and say **"Reorder the coffee beans"** → one card, `Why: same as last time (Nov 2x)`. Hold → Paid. **Tap** inside the window → `Cancelled · Refund sent`. Telegram shows "Order cancelled". | "Reordering is one sentence. And if I change my mind, one tap inside 30 seconds and the store refunds me on-chain." |
| **2:05–2:25** | Ask for **"wireless earbuds"** ($59 = 0.59 GRAM) → confirm shows `Over per-purchase cap (0.5 GRAM)` and no HOLD. In Telegram tap `/caps` → **Per-buy +0.1**. Back on the glasses the confirm screen now allows HOLD. | "Caps are enforced on the phone and on the server. Over the cap, the glasses just won't buy. I can raise it from Telegram in one tap." |
| **2:25–2:40** | Telegram `/revoke` → "Revoked". Phone panel: **Revoke & return funds** → tonviewer shows the sweep back to the Gram Wallet. | "And if anything feels wrong, revoke: purchases stop instantly and the balance goes back to my Gram Wallet." |
| **2:40–2:50** | End card: architecture diagram + "Track 02 · Gram Wallet · TON testnet · Telegram", repo URL. | "GlanceCart. Say it, see it, hold to buy, on a wallet you control." |

## If something isn't set up

- **No Anthropic key:** everything above still works (rules parser). Skip snap-to-buy, which isn't in the main cut anyway.
- **No Deepgram key:** type the requests in the phone panel and show the panel next to the glasses.
- **No test GRAM:** show the cap-hit and "Not enough GRAM" screens, and state on camera that payments are verified in tests. This is a much weaker demo; get faucet funds.
- **Gram Wallet can't do testnet:** fund with a testnet wallet through the same TON Connect page, and say why on camera (the Telegram native wallet is mainnet only).

## Optional 15-second insert (if under time)

Snap-to-buy: swipe on home, upload a photo of a cable with a $34 price tag → `Why: $12.00 less than here ($34.00)`. Needs `ANTHROPIC_API_KEY`.
