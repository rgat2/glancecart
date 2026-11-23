# Heads Up: Even Realities Hackathon — rules (saved 2026-11-23)

Source: https://dorahacks.io/hackathon/even-realities/detail (Details → Submission and rules, Judging, Build for G2, Tracks).

## Timeline
- Build week Nov 23–29, 2026. Submission opens 2026-11-23 08:00 UTC.
- Deadline: 2026-11-29 19:59 UTC (Nov 29, 23:59 Dubai).
- Judging Nov 30 – Dec 1. Demo Day Dec 3, 14:00–18:00 Dubai (Daos Hub), remote allowed for finalists.

## Tracks (pick a main track; up to 2 if the app genuinely connects apps from several tracks)
- 01 Messaging & News: Telegram (accounts, bots, channels, Mini Apps), Discord, Slack
- 02 Crypto & DeFi: **Gram Wallet, Polymarket, Hyperliquid, Trust Wallet**
  - "Check a wallet balance, live odds or an open position"
  - "Place a testnet bet or order by voice and confirm with one tap"
- 03 Exchanges & Stocks: Binance, OKX, Bybit, Coinbase, Interactive Brokers
- 04 AI Assistants & Work: Claude, ChatGPT, OpenRouter, Notion, Google Workspace
- Special prize: Best Telegram integration (any track), $1,000
- "G2 is the display, voice and input layer. Trading, custody and licensing stay with the underlying providers, reached through their APIs."

## Prizes
$10,000 USDT pool: Grand $2,000 (+2 G2); per track 1st $1,250, 2nd $375; Best Telegram $1,000; Community Partner up to $500. One cash prize per project (highest).

## Build for G2 (platform constraints from the page)
- Display monochrome green 576×288 per eye. Input: mic, touch on glasses, R1 ring. No camera or speaker on the glasses.
- App is a web app in a WebView inside the Even Realities App, talks to G2 over BLE via Even Hub SDK.
- One app on screen at a time; no display or alerts when the user switches away.
- No access to other apps' notifications; talk to services via their APIs.
- Bring your own STT: SDK gives raw mic audio.
- Use a backend: external calls must be whitelisted in `app.json` and pass CORS. Never ship API keys in the app.
- Google sign-in doesn't work in the WebView: use a separate login page or a pairing code.
- Setup: `npm i -g @evenrealities/evenhub-cli @evenrealities/evenhub-simulator`; start from the official minimal template.

## What to submit
- Public GitHub/GitLab repo with a README explaining setup
- Demo video, **max 3 minutes**, simulator or G2
- Short description: problem, who it's for, how it works, track
- Optional: feature requests, **up to 5** things the APIs you used were missing
- Optional: packaged `.ehpk`

## Rules
- Teams of 1–4, one team per person; up to 2 projects per team (one recommended).
- Build during the hackathon. Open-source libs and existing APIs allowed; say in README what existed before Nov 23.
- Build your core integration on the apps listed in your track; any other tools may be added on top.
- **Money safety: demos use testnet, paper trading or read-only data. Do not hold user funds. No financial advice. Never commit API keys or secrets.**
- Respect service terms and the privacy of people whose messages you show.
- Submit on the DoraHacks page before the deadline.

## Judging
- Usefulness on G2 — 30%: real everyday moment, glanceable, hands-free
- Read and write — 25%: acting is fast (short phrase, one tap or ring), smart defaults/AI drafts
- Technical execution — 20%: end to end, reliable, clean code
- UX for display and voice — 15%: clear on 576×288 mono, natural by voice
- Business potential and safety — 10%: real demand, careful with data and money
