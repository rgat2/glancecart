// @ton/core expects Node's Buffer; this module must be imported first.
import { Buffer } from 'buffer'
;(globalThis as unknown as { Buffer?: typeof Buffer }).Buffer ??= Buffer
