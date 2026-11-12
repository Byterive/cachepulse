import { expect, test } from 'claude-code/testing'

import { percent, textTimeline, totals } from './timeline'

const S = {
  turnId: 't',
  index: 0,
  model: 'claude-sonnet-5-5',
  at: 0,
  read: 1000,
  written: 500,
  uncached: 2,
  output: 10,
  hitShare: 1000 / 1502,
  state: 'data',
} as const

test('text timeline is honest when empty and lists requests otherwise', () => {
  expect(textTimeline([], 10)).toBe('CachePulse: no requests recorded yet.')
  const text = textTimeline([S, { ...S, agentId: 'a1', read: 0, hitShare: 0 }], 10)
  expect(text).toContain('main')
  expect(text).toContain('subagent')
  expect(text).toContain('Last 2 request(s)')
  // main and subagents summed apart, each with its own share.
  expect(text).toContain('Main: 1 request(s), read 1.0k')
  expect(text).toContain('Subagents: 1 request(s), read 0')
  expect(textTimeline([S], 10)).toContain('Subagents: none seen')
  expect(textTimeline([S, S, S], 2).split('\n').length).toBe(5)
})

test('totals sum the kept samples', () => {
  expect(totals([S, S])).toEqual({ read: 2000, written: 1000, uncached: 4, output: 20 })
})

test('no data is written in sentence case (E10)', () => {
  expect(percent(null)).toBe('No data')
})
