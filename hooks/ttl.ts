import type { Account, Config, Sample, Ttl } from '../types'

// TTL resolver (p2-s4b). The mod API passes only token counts, so the main
// conversation's TTL is never read from the host. It is resolved from what the
// user configured, then inferred, and every result says which. Idea follows the
// precedence Claude Code documents; the code is CachePulse's own.

const MINUTE = 60_000
/** Arrival times differ from request starts by a response's duration. */
const SLACK_MS = 30_000

export type TtlKind = 'set' | 'configured' | 'inferred' | 'unknown'

export type TtlResult = {
  ttl: Ttl | null
  kind: TtlKind
  /** Plain words for the band and pane: where the value came from. */
  source: string
}

export function ttlMs(ttl: Ttl): number {
  return ttl === '1h' ? 60 * MINUTE : 5 * MINUTE
}

/** "5m" or "1h" from a settings value or variable; anything else is null. */
export function asTtl(value: unknown): Ttl | null {
  return value === '5m' || value === '1h' ? value : null
}

/** A variable switched on: 1, true, yes or on (case-insensitive). */
export function isOn(value: string | undefined): boolean {
  return value !== undefined && /^(1|true|yes|on)$/i.test(value.trim())
}

/** The host's plan windows: the five-hour and seven-day limits. */
export function isPlanWindow(w: { kind: string }): boolean {
  return ['five_hour', 'seven_day'].includes(w.kind)
}

/**
 * The account, from the plan windows the last response reported: a five-hour or
 * seven-day window means a Claude subscription, a full one means usage credits.
 * With no window it stays "unknown": windows can be missing from a response even
 * on a subscription (seen live 2026-11-11), so "other" is never guessed.
 */
export function accountOf(
  windows: readonly { kind: string; percentUsed: number }[],
  _hasResponded: boolean,
): Account {
  const plan = windows.filter(isPlanWindow)
  if (plan.length > 0) return plan.some(w => w.percentUsed >= 100) ? 'credits' : 'subscription'
  return 'unknown'
}

/** "Account" from the store: a plan account an earlier process saw, else unknown. */
export function asAccount(value: unknown): Account {
  return value === 'subscription' || value === 'credits' ? value : 'unknown'
}

/**
 * The TTL the request timing implies, over main-thread requests with the same
 * model: a hit more than 5 minutes after the previous request proves 1h; a miss
 * 5 to 60 minutes after, with a prompt that did not shrink, suggests 5m (weaker).
 * Arrival times stand in for request starts, so thresholds carry slack.
 */
export function observeTtl(samples: readonly Sample[]): Ttl | null {
  let known: Ttl | null = null
  let prev: Sample | undefined
  for (const cur of samples) {
    if (cur.agentId !== undefined || cur.state !== 'data') continue
    if (prev !== undefined && prev.read + prev.written > 0 && cur.model === prev.model) {
      const gap = cur.at - prev.at
      const before = prev.read + prev.written + prev.uncached
      const now = cur.read + cur.written + cur.uncached
      if (gap > 5 * MINUTE + SLACK_MS) {
        if (cur.read >= before * 0.5) known = '1h'
        else if (known !== '1h' && cur.written > 0 && now >= before * 0.7 && gap < 60 * MINUTE + SLACK_MS) {
          known = '5m'
        }
      }
    }
    prev = cur
  }
  return known
}

/**
 * Order: the user's pin; a timing proof of 1h; FORCE_PROMPT_CACHING_5M;
 * CLAUDE_CODE_PROMPT_CACHE_TTL; the promptCacheTtl setting; ENABLE_PROMPT_CACHING_1H;
 * a weaker timing hint of 5m; the account default; unknown.
 */
export function resolveTtl(config: Config, samples: readonly Sample[]): TtlResult {
  const observed = observeTtl(samples)
  if (config.pin !== null) {
    return { ttl: config.pin, kind: 'set', source: 'set in CachePulse' }
  }
  if (observed === '1h') {
    return { ttl: '1h', kind: 'inferred', source: 'a cache hit after more than 5 minutes' }
  }
  if (config.env.force5m) {
    return { ttl: '5m', kind: 'configured', source: 'FORCE_PROMPT_CACHING_5M' }
  }
  if (config.env.ttl !== null) {
    return { ttl: config.env.ttl, kind: 'configured', source: 'CLAUDE_CODE_PROMPT_CACHE_TTL' }
  }
  if (config.setting !== null) {
    return { ttl: config.setting, kind: 'configured', source: 'promptCacheTtl setting' }
  }
  if (config.env.enable1h) {
    return { ttl: '1h', kind: 'configured', source: 'ENABLE_PROMPT_CACHING_1H' }
  }
  if (observed === '5m') {
    return { ttl: '5m', kind: 'inferred', source: 'a miss after 5 minutes (weaker evidence)' }
  }
  if (config.account === 'subscription') {
    return { ttl: '1h', kind: 'inferred', source: 'subscription default' }
  }
  if (config.account === 'credits') {
    return { ttl: '5m', kind: 'inferred', source: 'usage-credits default' }
  }
  if (config.account === 'other') {
    return { ttl: '5m', kind: 'inferred', source: 'API key or cloud default' }
  }
  return { ttl: null, kind: 'unknown', source: 'no setting, no plan data yet' }
}

/** Short note for the band: "1h TTL · configured (promptCacheTtl setting)". */
export function describeTtl(result: TtlResult): string {
  if (result.ttl === null) return 'TTL unknown'
  switch (result.kind) {
    case 'set':
      return `${result.ttl} TTL · ${result.source}`
    case 'configured':
      return `${result.ttl} TTL · configured (${result.source})`
    default:
      return `~${result.ttl} TTL · inferred (${result.source})`
  }
}
