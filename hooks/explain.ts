import type { Config, Sample } from '../types'
import { formatClock } from './timeline'
import { observeTtl, resolveTtl } from './ttl'

/** The TTL Claude Code itself reported at a model switch: observed, but only as of that moment. */
export type Reported = { ttl: '5m' | '1h'; at: number }

export type SourceRow = {
  /** Where the value comes from. */
  name: string
  /** configured = a real setting or variable; inferred = guessed by CachePulse; set = the user's pick here. */
  kind: 'set' | 'configured' | 'inferred'
  /** The TTL this source gives, or null when it is not set. */
  value: '5m' | '1h' | null
  /** True for the first row with a value: the one CachePulse shows. */
  win: boolean
}

/**
 * Every TTL source in the order resolveTtl applies them. Read-only; the
 * winner is the first source with a value, so it always matches resolveTtl.
 */
export function sourceRows(config: Config, samples: readonly Sample[]): SourceRow[] {
  const seen = observeTtl(samples)
  const account =
    config.account === 'subscription' ? '1h' : config.account === 'credits' || config.account === 'other' ? '5m' : null
  const rows: Omit<SourceRow, 'win'>[] = [
    { name: 'CachePulse pick (display only)', kind: 'set', value: config.pin },
    { name: 'Timing proof of 1h', kind: 'inferred', value: seen === '1h' ? '1h' : null },
    { name: 'FORCE_PROMPT_CACHING_5M', kind: 'configured', value: config.env.force5m ? '5m' : null },
    { name: 'CLAUDE_CODE_PROMPT_CACHE_TTL', kind: 'configured', value: config.env.ttl },
    { name: 'promptCacheTtl setting', kind: 'configured', value: config.setting },
    { name: 'ENABLE_PROMPT_CACHING_1H', kind: 'configured', value: config.env.enable1h ? '1h' : null },
    { name: 'Timing hint of 5m (weaker)', kind: 'inferred', value: seen === '5m' ? '5m' : null },
    { name: 'Account default', kind: 'inferred', value: account },
  ]
  const first = rows.findIndex(r => r.value !== null)
  return rows.map((r, i) => ({ ...r, win: i === first }))
}

/** One row as text: "→ promptCacheTtl setting: 1h (configured)". */
export function rowText(r: SourceRow): string {
  const value = r.value === null ? 'not set' : `${r.value} (${r.kind})`
  return `${r.win ? '→' : ' '} ${r.name}: ${value}`
}

/** Fixed notes under the list. */
export const EXPLAIN_NOTES: readonly string[] = [
  'Read from Claude Code: the settings and the variables. Timing, the account default and your pick here are inferred or display-only.',
  '1h costs more to write but can help across longer breaks; 5m is cheaper to write.',
  'Read-only: CachePulse does not change Claude Code\'s settings.',
]

/** Subagent TTL inputs: its own variable and setting, plus the two that cover both buckets. */
export type SubInputs = { force5m: boolean; env: '5m' | '1h' | null; setting: '5m' | '1h' | null; enable1h: boolean }

/**
 * The subagent TTL line, in the documented order: FORCE_PROMPT_CACHING_5M,
 * CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL, subagentPromptCacheTtl, ENABLE_PROMPT_CACHING_1H,
 * then the 5m default (inferred). A subagent's own cacheTtl can still differ.
 */
export function subagentLine(i: SubInputs): string {
  const own = "; a subagent's own cacheTtl may differ"
  if (i.force5m) return `Subagent TTL: 5m (configured, FORCE_PROMPT_CACHING_5M)${own}.`
  if (i.env !== null) return `Subagent TTL: ${i.env} (configured, CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL)${own}.`
  if (i.setting !== null) return `Subagent TTL: ${i.setting} (configured, subagentPromptCacheTtl setting)${own}.`
  if (i.enable1h) return `Subagent TTL: 1h (configured, ENABLE_PROMPT_CACHING_1H)${own}.`
  return `Subagent TTL: ~5m (inferred, default)${own}.`
}

/**
 * The host report as a line, flagged when it differs from what CachePulse shows.
 * Null when Claude Code has not reported a TTL yet.
 */
export function reportedLine(
  config: Config,
  samples: readonly Sample[],
  reported: Reported | null,
): { text: string; differs: boolean } | null {
  if (reported === null) return null
  const shown = resolveTtl(config, samples).ttl
  const base = `Reported by Claude Code at the last model switch (${formatClock(reported.at)}): ${reported.ttl} (observed).`
  if (shown === reported.ttl) return { text: base, differs: false }
  const what = shown === null ? 'CachePulse shows the TTL as unknown' : `CachePulse shows ${shown}`
  return { text: `${base} ${what}; the real cache may differ from the band.`, differs: true }
}

/** The whole explainer as plain text, for `/cachepulse config`. */
export function explainText(
  config: Config,
  samples: readonly Sample[],
  reported: Reported | null = null,
  sub: string | null = null,
): string {
  const shown = resolveTtl(config, samples)
  const line = reportedLine(config, samples, reported)
  return [
    'Cache lifetime sources, in the order applied (the first one with a value wins):',
    ...sourceRows(config, samples).map(rowText),
    shown.ttl === null ? 'Shown: TTL unknown.' : `Shown: ${shown.ttl} (${shown.kind}: ${shown.source}).`,
    ...(line === null ? [] : [line.text]),
    ...(sub === null ? [] : [sub]),
    ...EXPLAIN_NOTES,
  ].join('\n')
}
