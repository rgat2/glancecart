// @ton/* expect Node's Buffer. Must be imported before anything that loads them.
import { Buffer } from 'buffer'

const g = globalThis as unknown as { Buffer?: typeof Buffer }
g.Buffer ??= Buffer
