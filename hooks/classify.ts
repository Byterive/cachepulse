import type { Marker, Sample, Ttl } from '../types'
import { shortModel } from './timeline'
import { ttlMs } from './ttl'

/** A read share below this, with something written, is a partial hit. Shown on screen with the verdict. */
export const PARTIAL_BELOW = 0.8

/** Observed = a host event or field shows it; likely = consistent with the evidence; unknown = cannot be told (event-schema.md). */
export type Confidence = 'observed' | 'likely' | 'unknown'

export type Cause =
  | 'first-request'
  | 'new-session'
  | 'clear'
  | 'compaction'
  | 'model-change'
  | 'caching-off'
  | 'ttl-expired'
  | 'new-content'
  | 'unexplained'

export type Verdict = {
  /** hit: share at or above the cutoff; partial: below it with some read; miss: nothing read. */
  kind: 'hit' | 'partial' | 'miss' | 'nodata'
  cause: Cause | null
  confidence: Confidence | null
  /** Plain words naming what the verdict rests on (events, fields, times); never prompt text. */
  evidence: string[]
}

const NONE: Verdict = { kind: 'hit', cause: null, confidence: null, evidence: [] }

/**
 * Classifies one main-thread request from the samples and markers before it.
 * Pure: host data only (no status-line bridge, no transcripts). `ttl` is the TTL
 * CachePulse shows, so a lapse found here is at most "likely".
 * Returns null for a subagent request or an index outside the list.
 */
export function classify(
  samples: readonly Sample[],
  markers: readonly Marker[],
  index: number,
  ttl: Ttl | null,
): Verdict | null {
  const cur = samples[index]
  if (cur === undefined || cur.agentId !== undefined) return null
  if (cur.state === 'nodata' || cur.hitShare === null) {
    return { kind: 'nodata', cause: null, confidence: null, evidence: ['the host gave no token counts for this request'] }
  }
  const kind: Verdict['kind'] =
    cur.read === 0 ? 'miss' : cur.hitShare < PARTIAL_BELOW && cur.written > 0 ? 'partial' : 'hit'
  if (kind === 'hit') {
    // Read but nothing written and still under the cutoff: more new, uncached input than usual.
    if (cur.hitShare < PARTIAL_BELOW) {
      return {
        kind,
        cause: 'new-content',
        confidence: 'likely',
        evidence: [`${pct(cur.hitShare)} read, nothing written: new input after the cached part`],
      }
    }
    return NONE
  }

  let prev: Sample | undefined
  for (let i = index - 1; i >= 0; i--) {
    const s = samples[i]
    if (s !== undefined && s.agentId === undefined) {
      prev = s
      break
    }
  }
  const since = prev === undefined ? -Infinity : prev.at
  const between = markers.filter(m => m.at > since && m.at <= cur.at)
  const found = (k: Marker['kind']): Marker | undefined => between.find(m => m.kind === k)

  const clear = found('clear')
  if (clear !== undefined) return v(kind, 'clear', 'observed', ['clear marker: session.end reason clear before this request'])
  const compact = found('compact')
  if (compact !== undefined) {
    return v(kind, 'compaction', 'observed', [
      `compaction marker${compact.detail === undefined ? '' : ` (${compact.detail})`} before this request`,
    ])
  }
  const model = found('model')
  if (model !== undefined) {
    return v(kind, 'model-change', 'observed', [`model changed ${model.detail ?? ''}`.trim()])
  }
  if (prev !== undefined && prev.model !== cur.model) {
    return v(kind, 'model-change', 'observed', [`model field differs: ${shortModel(prev.model)} to ${shortModel(cur.model)}`])
  }
  const session = found('session')
  if (session !== undefined) {
    return v(kind, 'new-session', 'likely', ['new-session marker: a /clear or a restart, not told apart here'])
  }
  if (cur.written === 0 && cur.uncached > 0) {
    return v(kind, 'caching-off', 'likely', ['input was neither read from nor written to the cache'])
  }
  if (prev === undefined) {
    return v(kind, 'first-request', 'likely', ['no earlier request seen since this mod loaded'])
  }
  if (kind === 'miss' && ttl !== null) {
    const gap = cur.at - prev.at
    if (gap > ttlMs(ttl)) {
      return v(kind, 'ttl-expired', 'likely', [
        `${Math.round(gap / 1000)}s since the last request, over the ${ttl} TTL (inferred from arrival times)`,
      ])
    }
  }
  return v(kind, 'unexplained', 'unknown', [
    'no marker, model change or TTL lapse found; a changed prompt start cannot be told from token counts',
  ])
}

const v = (kind: Verdict['kind'], cause: Cause, confidence: Confidence, evidence: string[]): Verdict => ({
  kind,
  cause,
  confidence,
  evidence,
})

const pct = (share: number): string => `${(share * 100).toFixed(1)}%`
