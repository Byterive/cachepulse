import type { Sample } from '../types'
import { ttlMs as ttlToMs } from './ttl'
import type { TtlResult } from './ttl'

const MINUTE = 60_000
/** Remaining time under which the cache counts as expiring (brief: T-60 s). */
const EXPIRING_MS = MINUTE
/** D6: under this idle time the cache may still be held by a keepalive. */
const KEEPALIVE_WINDOW_MS = 60 * MINUTE

export type CacheState = 'warm' | 'expiring' | 'expired' | 'keepalive' | 'unknown'

export type Meter = {
  state: CacheState
  /** Approximate time left, ms; only when the TTL is known and not expired. */
  remainingMs: number | null
  /** Time since the last cache-active main-thread request, ms. */
  idleMs: number | null
}

/** "477k", "2.1k", "2": token counts as the design shows them. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return (k < 10 ? k.toFixed(1) : String(Math.round(k))) + 'k'
}

/** True for a release at or above 2.1.300 (D6); false when unknown. */
export function isAtLeast2_1_300(base: string | undefined): boolean {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(base ?? '')
  if (m === null) return false
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return a > 2 || (a === 2 && (b > 1 || (b === 1 && c >= 300)))
}

/** The last main-thread sample that read or wrote cache: the TTL anchor. */
export function lastCacheActive(samples: readonly Sample[]): Sample | null {
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i]
    if (s === undefined) continue
    if (s.agentId === undefined && s.state === 'data' && (s.read > 0 || s.written > 0)) {
      return s
    }
  }
  return null
}

/**
 * Warm, expiring, expired or unknown. The anchor is the stop chunk's arrival,
 * later than the request's start, so any time left is approximate (inferred).
 */
export function meter(
  samples: readonly Sample[],
  now: number,
  ttl: TtlResult,
  keepAliveHint: boolean,
): Meter {
  const anchor = lastCacheActive(samples)
  if (anchor === null) return { state: 'unknown', remainingMs: null, idleMs: null }
  const idleMs = Math.max(0, now - anchor.at)
  if (ttl.ttl === null) return { state: 'unknown', remainingMs: null, idleMs }
  const remainingMs = ttlToMs(ttl.ttl) - idleMs
  if (remainingMs > EXPIRING_MS) return { state: 'warm', remainingMs, idleMs }
  if (remainingMs > 0) return { state: 'expiring', remainingMs, idleMs }
  if (keepAliveHint && idleMs < KEEPALIVE_WINDOW_MS) {
    return { state: 'keepalive', remainingMs: null, idleMs }
  }
  return { state: 'expired', remainingMs: null, idleMs }
}

export function formatDuration(ms: number): string {
  if (ms < MINUTE) return `${Math.max(1, Math.round(ms / 1000))} s`
  return `${Math.round(ms / MINUTE)} min`
}
