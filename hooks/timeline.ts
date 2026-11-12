import type { Marker, Sample } from '../types'
import { formatTokens } from './meter'

/** HH:MM:SS in the local time of the machine running Claude Code. */
export function formatClock(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

/** "claude-sonnet-5-5" -> "sonnet-5-5"; other ids are kept. */
export function shortModel(model: string): string {
  return model.replace(/^claude-/, '')
}

export function percent(share: number | null): string {
  return share === null ? 'No data' : `${(share * 100).toFixed(1)}%`
}

export type Totals = { read: number; written: number; uncached: number; output: number }

/** Sums over the given samples (the kept window, not the whole session). */
export function totals(samples: readonly Sample[]): Totals {
  const t: Totals = { read: 0, written: 0, uncached: 0, output: 0 }
  for (const s of samples) {
    t.read += s.read
    t.written += s.written
    t.uncached += s.uncached
    t.output += s.output
  }
  return t
}

/** Plain-text timeline, newest last, for hosts that draw nothing. */
export function textTimeline(
  samples: readonly Sample[],
  count: number,
  markers: readonly Marker[] = [],
): string {
  if (samples.length === 0 && markers.length === 0) return 'CachePulse: no requests recorded yet.'
  const rows = [
    ...samples.map(s => ({ at: s.at, order: 1, text: sampleLine(s) })),
    ...markers.map(m => ({ at: m.at, order: 0, text: markerText(m) })),
  ]
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .slice(-count)
  const lines = rows.map(r => r.text)
  const split = splitTotals(samples)
  lines.push(
    `Last ${samples.length} request(s). Counts are observed; times are when each response ended.`,
    totalsText('Main', split.main),
    totalsText('Subagents', split.sub),
    ...modelGroups(samples).map(g => totalsText(g.label, g)),
  )
  return lines.join('\n')
}

export type ModelGroup = Totals & { n: number; label: string }

/**
 * One group per model and side, never mixing main and subagent requests.
 * Empty unless more than one model was seen, because one model
 * would only repeat the totals. Newest model first.
 */
export function modelGroups(samples: readonly Sample[]): ModelGroup[] {
  if (new Set(samples.map(s => s.model)).size < 2) return []
  const groups = new Map<string, { at: number; list: Sample[]; label: string }>()
  for (const s of samples) {
    const side = s.agentId === undefined ? 'main' : 'sub'
    const key = `${s.model}|${side}`
    const g = groups.get(key) ?? { at: 0, list: [], label: `${shortModel(s.model)} ${side}` }
    g.list.push(s)
    g.at = Math.max(g.at, s.at)
    groups.set(key, g)
  }
  return [...groups.values()]
    .sort((a, b) => b.at - a.at)
    .map(g => ({ ...totals(g.list), n: g.list.length, label: g.label }))
}

/** Main conversation and subagents summed apart: their prefixes and shares never mix. */
export function splitTotals(samples: readonly Sample[]): { main: Totals & { n: number }; sub: Totals & { n: number } } {
  const main = samples.filter(s => s.agentId === undefined)
  const sub = samples.filter(s => s.agentId !== undefined)
  return { main: { ...totals(main), n: main.length }, sub: { ...totals(sub), n: sub.length } }
}

/** Read share of a total: read over all input; null when there is none. */
export function totalShare(t: Totals): number | null {
  const all = t.read + t.written + t.uncached
  return all === 0 ? null : t.read / all
}

/** "Main: 3 request(s), read 120k, wrote 2.1k, new 6, out 900, read share 98.2%" or "Subagents: none seen". */
export function totalsText(label: string, t: Totals & { n: number }): string {
  if (t.n === 0) return `${label}: none seen`
  return (
    `${label}: ${t.n} request(s), read ${formatTokens(t.read)}, wrote ${formatTokens(t.written)}, ` +
    `new ${formatTokens(t.uncached)}, out ${formatTokens(t.output)}, read share ${percent(totalShare(t))}`
  )
}

function sampleLine(s: Sample): string {
  const who = s.agentId === undefined ? 'main' : 'subagent'
  return (
    `${formatClock(s.at)}  ${who}  ${shortModel(s.model)}  ` +
    `read ${formatTokens(s.read)}  wrote ${formatTokens(s.written)}  ` +
    `new ${formatTokens(s.uncached)}  out ${formatTokens(s.output)}  ${percent(s.hitShare)}`
  )
}

export function describeMarker(m: Marker): string {
  switch (m.kind) {
    case 'compact':
      return `Conversation compacted (${m.detail ?? 'unknown trigger'})`
    case 'clear':
      return 'Conversation cleared (/clear)'
    case 'session':
      return 'New session (a /clear or a restart; not told apart here)'
    case 'model':
      return `Model changed: ${m.detail ?? 'unknown'}`
  }
}

function markerText(m: Marker): string {
  return `${formatClock(m.at)}  -- ${describeMarker(m)} --`
}
