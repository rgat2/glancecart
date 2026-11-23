// Thin wrapper around the Anthropic SDK for small JSON-returning calls.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5'

let client: Anthropic | null = null

/** True when an Anthropic key is configured; otherwise callers use rule-based fallbacks. */
export function llmEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function getClient(): Anthropic {
  client ??= new Anthropic({ timeout: 20_000, maxRetries: 1 })
  return client
}

/**
 * One structured-output call. Returns the parsed object, or null if the model
 * refused or the output didn't validate (callers fall back to rules).
 */
export async function parseJson<S extends z.ZodType>(opts: {
  system: string
  /** Plain text, or content blocks (e.g. an image followed by text). */
  user: string | Anthropic.Beta.BetaContentBlockParam[]
  schema: S
  maxTokens?: number
}): Promise<z.infer<S> | null> {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2000,
    // Server-side fallback re-runs a declined request on another model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // Short extraction tasks: low effort keeps the glasses snappy.
    output_config: { effort: 'low', format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  })
  if (response.stop_reason === 'refusal') return null
  return (response.parsed_output as z.infer<S> | null) ?? null
}
