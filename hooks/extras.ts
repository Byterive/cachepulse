import type { Sample } from '../types'
import { formatTokens } from './meter'
import { COOL, GOOD, MUTED } from './style'

// Pane extras: savings hint, trend graph. Pure: data in, text out.

/** Prompt size of a request: everything the model was sent. */
const contextOf = (s: Sample): number => s.read + s.written + s.uncached

const main = (list: readonly Sample[]): Sample[] =>
  list.filter(s => s.agentId === undefined && s.state === 'data')

/**
 * What /clear could save each request: the current context less the smallest
 * this session saw (the start of the conversation). Inferred; /compact keeps a
 * summary, so it saves at most as much. Null under 10k: not worth a line.
 */
export function savingsText(list: readonly Sample[]): string | null {
  const ok = main(list)
  const last = ok.at(-1)
  if (last === undefined) return null
  const now = contextOf(last)
  const floor = Math.min(...ok.map(contextOf))
  const saved = now - floor
  if (saved < 10_000) return null

  return (
    `/clear could cut about ${formatTokens(saved)} tokens from each request; /compact may cut up to that. ` +
    `(Inferred: context is now ${formatTokens(now)}, smallest this session ${formatTokens(floor)}.) ` +
    'The first request after either rewrites the cache. Save your notes before either.'
  )
}

/** The newest main-thread requests the trend draws. */
const TREND_POINTS = 20

/** Read share is drawn from this floor to 100%: it sits near 99%, so a full scale hides dips. */
const SHARE_FLOOR = 0.8

/** 0..1 position of a read share between SHARE_FLOOR and 100%. */
const sharePos = (s: Sample): number =>
  Math.min(1, Math.max(0, ((s.hitShare ?? 0) - SHARE_FLOOR) / (1 - SHARE_FLOOR)))

/** 0..1 position of each context between the smallest and largest seen (middle when all equal). */
function contextPos(ok: readonly Sample[]): (s: Sample) => number {
  const values = ok.map(contextOf)
  const lo = Math.min(...values)
  const hi = Math.max(...values)

  return s => (hi === lo ? 0.5 : (contextOf(s) - lo) / (hi - lo))
}

/**
 * Read share (green, 80% to 100%) and context size (teal, dashed, smallest to
 * largest this session) over the last requests, as an SVG that fills the pane's
 * width; null under 2 points.
 */
export function trendSvg(list: readonly Sample[]): string | null {
  const ok = main(list).slice(-TREND_POINTS)
  if (ok.length < 2) return null
  const w = 400
  const h = 80
  const left = 34
  const pad = 8
  const ctx = contextPos(ok)
  const x = (i: number) => left + (i * (w - left - pad)) / (ok.length - 1)
  const y = (v: number) => h - pad - v * (h - 2 * pad)
  const line = (v: (s: Sample) => number) =>
    ok.map((s, i) => `${x(i).toFixed(1)},${y(v(s)).toFixed(1)}`).join(' ')
  const dots = ok
    .map((s, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(sharePos(s)).toFixed(1)}" r="3" fill="${GOOD}"/>`)
    .join('')
  const label = (v: number, text: string) =>
    `<text x="2" y="${(y(v) + 4).toFixed(1)}" font-size="11" fill="${MUTED}">${text}</text>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%">` +
    label(1, '100%') +
    label(0, '80%') +
    `<polyline points="${line(ctx)}" fill="none" stroke="${COOL}" stroke-width="2" stroke-dasharray="4 3"/>` +
    `<polyline points="${line(sharePos)}" fill="none" stroke="${GOOD}" stroke-width="2"/>` +
    dots +
    '</svg>'
  )
}

const BLOCKS = '▁▂▃▄▅▆▇█'
const block = (v: number) => BLOCKS[Math.min(7, Math.max(0, Math.round(v * 7)))] ?? '▁'

/** The same two series as block characters, for the terminal (no Svg there). */
export function textTrend(list: readonly Sample[]): { share: string; context: string } {
  const ok = main(list).slice(-TREND_POINTS)
  const ctx = contextPos(ok)

  return {
    share: ok.map(s => block(sharePos(s))).join(''),
    context: ok.map(s => block(ctx(s))).join(''),
  }
}
