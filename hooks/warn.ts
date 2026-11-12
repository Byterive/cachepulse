import type { Sample } from '../types'
import { lastCacheActive } from './meter'
import { ttlMs } from './ttl'
import type { TtlResult } from './ttl'

const MIN = 60_000
/** Lead times before the TTL runs out, longest first; a 1h TTL also warns at 10 min. */
export const WARN_LEADS: Record<'5m' | '1h', readonly number[]> = { '5m': [MIN], '1h': [10 * MIN, MIN] }
/** How long each toast stays, ms. */
export const TOAST_MS = 60_000
export const WARN_LEAD_MS = MIN

/** Where the TTL came from, in the words the band uses (never shown as certain when inferred). */
function basis(ttl: TtlResult): string {
  if (ttl.kind === 'set') return ttl.source
  if (ttl.kind === 'configured') return `configured, ${ttl.source}`
  return `inferred, ${ttl.source}`
}

/**
 * The toast when one is due, else null. Due means: switched on, the
 * TTL is known, and the last main-thread cache request (subagents are
 * skipped) leaves less than a lead time, and nothing that tight was shown yet.
 * `warned` is the request (`at`) and the tightest lead already shown for it; a
 * new request has a new `at`, so the next idle gap warns again. When two leads
 * are both crossed, only the tighter one shows.
 */
export function expiryToast(
  samples: readonly Sample[],
  now: number,
  ttl: TtlResult,
  on: boolean,
  warned: { at: number; lead: number } | null,
): { text: string; anchor: number; lead: number } | null {
  if (!on || ttl.ttl === null) return null
  const anchor = lastCacheActive(samples)
  if (anchor === null) return null
  const left = ttlMs(ttl.ttl) - Math.max(0, now - anchor.at)
  if (left <= 0) return null
  const lead = [...WARN_LEADS[ttl.ttl]].reverse().find(l => left <= l)
  if (lead === undefined) return null
  if (warned !== null && warned.at === anchor.at && warned.lead <= lead) return null
  return {
    anchor: anchor.at,
    lead,
    text: `Cache may expire in ~${Math.round(lead / MIN)} min (${ttl.ttl} TTL, ${basis(ttl)}). The next request would rewrite it.`,
  }
}
