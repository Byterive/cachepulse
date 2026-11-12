import type { Marker, Sample, Ttl } from '../types'
import { classify, PARTIAL_BELOW } from './classify'
import type { Cause, Verdict } from './classify'
import { formatTokens } from './meter'
import { formatClock, percent } from './timeline'

/** Plain words for each cause (no prompt text, only host facts). */
const CAUSE_TEXT: Record<Cause, string> = {
  'first-request': 'first request seen since CachePulse loaded',
  'new-session': 'new session (a /clear or a restart)',
  clear: '/clear',
  compaction: 'conversation compacted',
  'model-change': 'model changed',
  'caching-off': 'caching looks off for this request',
  'ttl-expired': 'cache lifetime ran out',
  'new-content': 'new content after the cached part',
  unexplained: 'no cause found',
}

export type LatestMiss = { sample: Sample; verdict: Verdict }

/** The newest main-thread request that was a miss or a partial hit, or null. */
export function latestMiss(
  samples: readonly Sample[],
  markers: readonly Marker[],
  ttl: Ttl | null,
): LatestMiss | null {
  for (let i = samples.length - 1; i >= 0; i--) {
    const sample = samples[i]
    if (sample === undefined) continue
    const verdict = classify(samples, markers, i, ttl)
    if (verdict !== null && (verdict.kind === 'miss' || verdict.kind === 'partial')) return { sample, verdict }
  }
  return null
}

/** The cutoff sentence shown with every verdict (80%, configured in CachePulse). */
export const CUTOFF_TEXT = `Hit: read share ${PARTIAL_BELOW * 100}% or more (cutoff set in CachePulse). Partial: under that with a write. Miss: nothing read.`

/** Lines for the pane card and for `/cachepulse why`; first line is the heading. */
export function whyLines(
  samples: readonly Sample[],
  markers: readonly Marker[],
  ttl: Ttl | null,
): string[] {
  const found = latestMiss(samples, markers, ttl)
  if (found === null) {
    return ['Latest miss', `No miss or partial hit among the last ${samples.length} request(s).`, CUTOFF_TEXT]
  }
  const { sample: s, verdict: v } = found
  const label = v.kind === 'miss' ? 'Miss' : 'Partial hit'
  const cause = v.cause === null || v.confidence === null ? 'cause unknown' : `${CAUSE_TEXT[v.cause]} (${v.confidence})`
  return [
    'Latest miss',
    `${formatClock(s.at)}  ${label}: read ${formatTokens(s.read)}, wrote ${formatTokens(s.written)}, new ${formatTokens(s.uncached)}, share ${percent(s.hitShare)}`,
    `Cause: ${cause}`,
    ...v.evidence.map(e => `Based on: ${e}`),
    CUTOFF_TEXT,
  ]
}

/** Text answer of `/cachepulse why` (also the terminal answer with no surface). */
export function whyText(samples: readonly Sample[], markers: readonly Marker[], ttl: Ttl | null): string {
  if (samples.length === 0) return 'CachePulse: no requests recorded yet.'
  return whyLines(samples, markers, ttl).join('\n')
}
