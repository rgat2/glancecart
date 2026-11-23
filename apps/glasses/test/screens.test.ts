import { describe, expect, it } from 'vitest'
import type { OptionCard } from '@glancecart/shared'
import * as S from '../src/screens'
import { pcmToWav } from '../src/wav'
import { ERROR_LINES } from '../src/errors'

const long: OptionCard = {
  productId: 'p1', title: 'Extremely long product title that goes on and on forever', usd: 1234.56, gram: 12.3456,
  arrives: 'tomorrow', rating: 4.6, why: 'cheapest with 4.6★ and arrives tomorrow ok',
}
const short: OptionCard = { ...long, title: 'USB-C cable 2m braided', usd: 12.4, gram: 0.124, arrives: 'Thu', why: 'cheapest, 4.6★' }

const W = { balanceGram: 0.0512, capLeftGram: 0.0123, perPurchaseGram: 0.5 }

const screens: Record<string, string> = {
  home: S.home({ balanceGram: 1234.5678, capLeftGram: 999.1234, revoked: false }),
  homeNoWallet: S.home(null),
  homeRevoked: S.home({ balanceGram: 0, capLeftGram: 0, revoked: true }),
  listening: S.listening(12),
  thinking: S.thinking('find a usb-c cable under fifteen dollars by friday please thanks'),
  card: S.card(1, 3, long),
  cardSingle: S.card(0, 1, short),
  confirm: S.confirm(long, { balanceGram: 1000, capLeftGram: 999, perPurchaseGram: 5 }),
  confirmPerCap: S.confirm(long, W, 'over_purchase_cap'),
  confirmDaily: S.confirm(long, W, 'over_daily_cap'),
  confirmBalance: S.confirm(long, W, 'insufficient_balance'),
  confirmRevoked: S.confirm(long, W, 'revoked'),
  paying: S.paying(long, 'confirming'),
  paid: S.paid(long, 'gc-abcdef1234', 29, 'f'.repeat(64)),
  paidClosed: S.paid(long, 'gc-abcdef1234', 0),
  paidTelegram: S.paid(long, 'gc-abcdef1234', 0, 'f'.repeat(64), true),
  cancelling: S.cancelled(long, 'working'),
  cancelled: S.cancelled(long, 'done'),
  noResults: S.noResults('a very long query that someone said into the glasses'),
  error: S.error('Something went wrong'),
  homeOffline: S.home(null, undefined, true),
  snapping: S.snapping(),
  thinkingPhoto: S.thinking(undefined, true),
  ...Object.fromEntries(Object.entries(ERROR_LINES).map(([code, line]) => [`error:${code}`, S.error(line)])),
}

describe('screen copy fits the G2 display budget', () => {
  for (const [name, text] of Object.entries(screens)) {
    it(name, () => {
      const lines = text.split('\n')
      expect(lines.length).toBeLessThanOrEqual(S.MAX_LINES)
      for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(S.MAX_CHARS)
      expect(text).not.toMatch(/[✓…]/) // not in the G2 font
      expect(text.endsWith('\n')).toBe(false) // trailing newline adds a scrollbar
    })
  }

  it('card matches the spec layout', () => {
    expect(S.card(1, 3, short)).toBe(
      ['2/3  USB-C cable 2m braided', '$12.40 · 0.124 GRAM · arrives Thu', 'Why: cheapest, 4.6★', '', 'Tap = select   Swipe = next', 'Double tap = back'].join('\n'),
    )
  })

  it('confirm shows balance and cap after purchase', () => {
    const t = S.confirm(short, { balanceGram: 2, capLeftGram: 1, perPurchaseGram: 0.5 })
    expect(t).toContain('Wallet after: 1.876 GRAM')
    expect(t).toContain('Cap left today: 0.876 GRAM')
    expect(t).toContain('HOLD to buy')
  })

  it('blocked confirm hides the buy action and says why', () => {
    const t = S.confirm(short, W, 'over_daily_cap')
    expect(t).not.toContain('HOLD')
    expect(t).toContain('Daily cap: only 0.0123 GRAM left')
  })

  it('paid screen counts down the cancel window', () => {
    expect(S.paid(short, 'gc-1', 12)).toContain('Tap = cancel (12s)')
    expect(S.paid(short, 'gc-1', 0)).not.toContain('cancel')
  })
})

describe('pcmToWav', () => {
  it('writes a valid 16 kHz mono header', () => {
    const wav = pcmToWav([new Uint8Array(3200), new Uint8Array(1600)])
    const v = new DataView(wav.buffer)
    expect(wav.byteLength).toBe(44 + 4800)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(40, true)).toBe(4800)
  })
})
