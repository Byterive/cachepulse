import { expect, test } from 'claude-code/testing'

import { savingsText, textTrend, trendSvg } from './extras'

const S = (at: number, read: number, written: number, extra: Record<string, unknown> = {}) => ({
  turnId: `t${at}`,
  index: 0,
  model: 'claude-opus-5-5',
  at,
  read,
  written,
  uncached: 0,
  output: 1,
  hitShare: read + written === 0 ? null : read / (read + written),
  state: 'data' as const,
  ...extra,
})

test('savings: current context minus the smallest this session, main thread only, labelled inferred', () => {
  const list = [S(1, 30_000, 1000), S(2, 100_000, 2000), S(3, 150_000, 1000), S(4, 5000, 0, { agentId: 'sub' })]
  const text = savingsText(list)
  expect(text).toContain('/clear could cut about 120k tokens from each request')
  expect(text).toContain('Save your notes before either.')
  expect(text).toContain('/compact')
  expect(text).toContain('Inferred')
  expect(text).toContain('rewrites the cache')
  // Under 10k there is nothing worth saying.
  expect(savingsText([S(1, 30_000, 0), S(2, 35_000, 0)])).toBeNull()
  expect(savingsText([])).toBeNull()
})

test('trend: an svg with a share line and a context line; text blocks for the terminal', () => {
  const list = [S(1, 50, 50), S(2, 90, 10), S(3, 99, 1)]
  const svg = trendSvg(list)
  expect(svg).toContain('<svg')
  expect(svg?.match(/<polyline/g)).toHaveLength(2)
  expect(trendSvg([S(1, 50, 50)])).toBeNull()
  expect(textTrend(list).share).toHaveLength(3)
  expect(textTrend(list).context).toHaveLength(3)
})

test('trend fits the pane and spreads the lines', () => {
  const list = [S(1, 280_000, 1000), S(2, 285_000, 6000), S(3, 290_000, 2000)]
  const svg = trendSvg(list) ?? ''
  expect(svg).toContain('width="100%"')
  expect(svg).not.toContain('width="400"')
  expect(svg).toContain('>80%<')
  expect(svg).toContain('>100%<')
  // Context runs from its smallest (bottom) to its largest (top): first point low, last point high.
  const context = /<polyline points="([^"]+)"[^>]*stroke-dasharray/.exec(svg)?.[1] ?? ''
  const ys = context.split(' ').map(p => Number(p.split(',')[1]))
  expect(ys[0]).toBeGreaterThan(60)
  expect(ys[2]).toBeLessThan(20)
})
