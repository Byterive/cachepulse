import type { Sample, Ttl } from '../types'

/**
 * List prices in US dollars per million tokens, taken from the
 * Anthropic pricing pages (see PRICES_AS_OF for the date). No regional (1.1x), batch or fast-mode adjustment.
 */
export const PRICES_AS_OF = '2026-11-10'
export const PRICES_SOURCE = 'Anthropic list prices (pricing docs)'

export type Price = { input: number; write5m: number; write1h: number; read: number; output: number }

const P = (input: number, write5m: number, write1h: number, read: number, output: number): Price => ({
  input,
  write5m,
  write1h,
  read,
  output,
})

/** Short model name (no "claude-", no date) to price. Haiku 5.5 has two tiers, picked per request. */
const TABLE: Record<string, Price> = {
  'fable-5-2': P(8, 10, 16, 0.2, 40),
  'mythos-5-2': P(8, 10, 16, 0.2, 40),
  'fable-5-1': P(10, 12.5, 20, 0.25, 50),
  'mythos-5-1': P(10, 12.5, 20, 0.25, 50),
  'fable-5': P(10, 12.5, 20, 1, 50),
  'mythos-5': P(10, 12.5, 20, 1, 50),
  'opus-5-5': P(4, 5, 8, 0.2, 20),
  'opus-5': P(5, 6.25, 10, 0.5, 25),
  'opus-4-8': P(5, 6.25, 10, 0.5, 25),
  'opus-4-7': P(5, 6.25, 10, 0.5, 25),
  'opus-4-6': P(5, 6.25, 10, 0.5, 25),
  'opus-4-5': P(5, 6.25, 10, 0.5, 25),
  'opus-4-1': P(15, 18.75, 30, 1.5, 75),
  'opus-4': P(15, 18.75, 30, 1.5, 75),
  'sonnet-5-5': P(2, 2.5, 4, 0.1, 10),
  'sonnet-5': P(2, 2.5, 4, 0.2, 10),
  'sonnet-4-6': P(3, 3.75, 6, 0.3, 15),
  'sonnet-4-5': P(3, 3.75, 6, 0.3, 15),
  'sonnet-4': P(3, 3.75, 6, 0.3, 15),
  'haiku-4-5': P(1, 1.25, 2, 0.1, 5),
}
const HAIKU_55_SMALL = P(0.1, 0.125, 0.2, 0.01, 0.5)
const HAIKU_55_LARGE = P(0.5, 0.625, 1, 0.05, 2.5)

/** "claude-opus-4-5-20251101[1m]" -> "opus-4-5". */
export function priceKey(model: string): string {
  return model
    .replace(/^claude-/, '')
    .replace(/\[.*\]$/, '')
    .replace(/-\d{8}$/, '')
}

/** The price for one request, or null for a model not in the table. Haiku 5.5's tier follows the prompt size. */
export function priceFor(sample: Sample): Price | null {
  const key = priceKey(sample.model)
  if (key === 'haiku-5-5') return sample.read + sample.written + sample.uncached > 100_000 ? HAIKU_55_LARGE : HAIKU_55_SMALL
  return TABLE[key] ?? null
}

/** `n`: requests priced, all recorded since CachePulse loaded. */
export type Saved = { usd: number; unpriced: string[]; n: number }

/**
 * What the cache saved at list price: each request's cost without caching
 * minus its cost with caching. Output costs the same either way and drops out.
 * Main writes are priced at the TTL shown; subagent writes at the 5m default.
 * Negative when writes were never read back.
 */
export function cacheSaved(samples: readonly Sample[], mainTtl: Ttl | null): Saved {
  let usd = 0
  let n = 0
  const unpriced = new Set<string>()
  for (const s of samples) {
    if (s.state !== 'data') continue
    const p = priceFor(s)
    if (p === null) {
      unpriced.add(priceKey(s.model))
      continue
    }
    n += 1
    const write = s.agentId === undefined && mainTtl === '1h' ? p.write1h : p.write5m
    usd += (s.read * (p.input - p.read) - s.written * (write - p.input)) / 1_000_000
  }
  return { usd, unpriced: [...unpriced], n }
}

/** "$1.23", "$0.004", "-$0.50". */
export function formatUsd(usd: number): string {
  const sign = usd < 0 ? '-' : ''
  const a = Math.abs(usd)
  return `${sign}$${a >= 0.1 || a === 0 ? a.toFixed(2) : a.toPrecision(1)}`
}
