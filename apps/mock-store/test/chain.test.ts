import { describe, expect, it, vi } from 'vitest'
import { retry429 } from '../src/chain.ts'

const rateLimited = () => Object.assign(new Error('Request failed with status code 429'), { response: { status: 429 } })

describe('retry429', () => {
  it('retries rate-limited toncenter calls until one succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(rateLimited()).mockRejectedValueOnce(rateLimited()).mockResolvedValue('ok')
    await expect(retry429(fn, 4, 1)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('gives up after the last try', async () => {
    const fn = vi.fn().mockRejectedValue(rateLimited())
    await expect(retry429(fn, 3, 1)).rejects.toThrow(/429/)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry other errors', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('bad boc'), { response: { status: 500 } }))
    await expect(retry429(fn, 4, 1)).rejects.toThrow('bad boc')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
