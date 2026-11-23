// @GlanceCartBot: receipts, daily summary, caps, top-up and revoke from Telegram.
// Command logic lives in handleCommand() (pure, tested); grammY is a thin shell.
import { Bot, InlineKeyboard } from 'grammy'
import { round4, validateCaps } from '@glancecart/shared'
import type { Store, WalletRecord } from './state.ts'
import * as M from './messages.ts'
import type { Notifier } from './receipts.ts'

export interface Reply {
  html: string
  keyboard?: InlineKeyboard
}

export interface BotDeps {
  store: Store
  balanceOf: (address: string) => Promise<number | null>
  fundUrl: string | null
}

export function capsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Per-buy −0.1', 'cap:purchase:-0.1').text('Per-buy +0.1', 'cap:purchase:+0.1').row()
    .text('Daily −0.5', 'cap:daily:-0.5').text('Daily +0.5', 'cap:daily:+0.5').row()
    .text('⛔ Revoke now', 'revoke')
}

function setCap(store: Store, w: WalletRecord, which: string, value: number): Reply {
  const key = which.startsWith('p') ? 'perPurchaseGram' : which.startsWith('d') ? 'dailyGram' : null
  if (!key || !Number.isFinite(value)) return { html: 'Usage: /setcap daily 2 or /setcap purchase 0.5' }
  const next = validateCaps({ [key]: round4(value) }, w.caps)
  if ('error' in next) return { html: `❌ ${M.esc(next.error)}` }
  const r = store.update(w.address, rec => { rec.caps = next })
  return { html: `✅ Caps updated\n${M.capsText(r.caps)}`, keyboard: capsKeyboard() }
}

/** Handles one command (or button) for a chat. Returns the reply to send. */
export async function handleCommand(deps: BotDeps, chatId: number, text: string): Promise<Reply> {
  const { store } = deps
  const [cmdRaw, ...args] = text.trim().split(/\s+/)
  const cmd = cmdRaw.replace(/@\w+$/, '').toLowerCase()

  if (cmd === '/start') {
    if (!args[0]) return { html: `Open GlanceCart on your glasses' phone app and tap "Link Telegram".\n\n${M.HELP}` }
    const w = store.redeemLinkCode(args[0], chatId)
    if (!w) return { html: '❌ That link expired. Tap "Link Telegram" in GlanceCart again.' }
    return { html: `✅ Linked. Receipts and your daily summary will arrive here.\n\n${M.status(w, await deps.balanceOf(w.address))}` }
  }
  if (cmd === '/help') return { html: M.HELP }

  const w = store.byChat(chatId).at(-1)
  if (!w) return { html: 'No GlanceCart wallet linked yet. In the GlanceCart phone panel tap "Link Telegram".' }

  switch (cmd) {
    case '/status':
      return { html: M.status(w, await deps.balanceOf(w.address)), keyboard: capsKeyboard() }
    case '/caps':
      return { html: M.capsText(w.caps), keyboard: capsKeyboard() }
    case '/setcap':
      return setCap(store, w, (args[0] ?? '').toLowerCase(), Number(args[1]))
    case '/topup':
      return { html: M.topUp(w.address, deps.fundUrl) }
    case '/summary':
      return { html: M.summary(w) }
    case '/revoke': {
      store.update(w.address, r => { r.caps = { ...r.caps, revoked: true } })
      return {
        html: '⛔ <b>Revoked.</b> The agent can no longer buy anything.\nTo get the balance back, tap "Revoke &amp; return funds" in the GlanceCart phone panel (only the phone holds the key). /enable to undo.',
      }
    }
    case '/enable': {
      store.update(w.address, r => { r.caps = { ...r.caps, revoked: false } })
      return { html: `✅ Purchases allowed again.\n${M.capsText(w.caps)}`, keyboard: capsKeyboard() }
    }
    default:
      return { html: M.HELP }
  }
}

/** Maps an inline button to a command. */
export function callbackToCommand(data: string, w: WalletRecord | undefined): string | null {
  if (data === 'revoke') return '/revoke'
  const m = data.match(/^cap:(purchase|daily):([+-]\d+(?:\.\d+)?)$/)
  if (!m || !w) return null
  const current = m[1] === 'purchase' ? w.caps.perPurchaseGram : w.caps.dailyGram
  return `/setcap ${m[1]} ${Math.max(0, round4(current + Number(m[2])))}`
}

export async function startBot(token: string, deps: BotDeps): Promise<{ notifier: Notifier; username: string }> {
  const bot = new Bot(token)
  const reply = (r: Reply) => ({ parse_mode: 'HTML' as const, reply_markup: r.keyboard, link_preview_options: { is_disabled: true } })

  bot.on('message:text', async ctx => {
    const r = await handleCommand(deps, ctx.chat.id, ctx.message.text)
    await ctx.reply(r.html, reply(r))
  })
  bot.on('callback_query:data', async ctx => {
    const chatId = ctx.chat?.id
    if (chatId == null) return ctx.answerCallbackQuery()
    const cmd = callbackToCommand(ctx.callbackQuery.data, deps.store.byChat(chatId).at(-1))
    if (!cmd) return ctx.answerCallbackQuery()
    const r = await handleCommand(deps, chatId, cmd)
    await ctx.answerCallbackQuery()
    await ctx.reply(r.html, reply(r))
  })
  bot.catch(err => console.warn('bot error:', err.message))

  await bot.api.setMyCommands([
    { command: 'status', description: 'Balance, spend and caps' },
    { command: 'caps', description: 'View and adjust spending caps' },
    { command: 'topup', description: 'Fund the agent wallet' },
    { command: 'summary', description: 'Last 24 hours' },
    { command: 'revoke', description: 'Block all purchases now' },
  ])
  const me = await bot.api.getMe()
  void bot.start({ drop_pending_updates: true })
  return {
    username: me.username ?? "GlanceCartBot",
    notifier: { send: async (chatId, html) => { await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }) } },
  }
}
