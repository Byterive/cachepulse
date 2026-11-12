import { expect, test } from 'claude-code/testing'

import { whyLines, whyText } from './why'

const S = (at: number, read: number, written: number, extra: Record<string, unknown> = {}) => ({
  turnId: `t${at}`,
  index: 0,
  model: 'claude-sonnet-5-5',
  at,
  read,
  written,
  uncached: 2,
  output: 1,
  hitShare: read + written + 2 === 0 ? null : read / (read + written + 2),
  state: 'data' as const,
  ...extra,
})

test('why names the latest miss, its cause with confidence, the evidence and the 80% cutoff', () => {
  const list = [S(1000, 50_000, 1000), S(2000, 0, 60_000)]
  const marks = [{ kind: 'compact' as const, at: 1500, detail: 'manual' }]
  const lines = whyLines(list, marks, '1h')
  expect(lines[0]).toBe('Latest miss')
  expect(lines.join('\n')).toContain('Miss: read 0')
  expect(lines).toContain('Cause: conversation compacted (observed)')
  expect(lines.some(l => l.startsWith('Based on: compaction marker'))).toBe(true)
  expect(lines.at(-1)).toContain('80%')
})

test('a likely cause says likely, an unknown one says unknown, never observed', () => {
  const first = whyLines([S(1000, 0, 60_000)], [], '1h').join('\n')
  expect(first).toContain('(likely)')
  expect(first).not.toContain('(observed)')
  const odd = whyLines([S(1000, 50_000, 1000), S(2000, 10_000, 60_000)], [], '1h').join('\n')
  expect(odd).toContain('Partial hit')
  expect(odd).toContain('Cause: no cause found (unknown)')
})

test('with only hits it says so; with no samples it says nothing recorded', () => {
  expect(whyLines([S(1, 50_000, 100), S(2, 50_000, 100)], [], '1h')[1]).toContain('No miss or partial hit among the last 2')
  expect(whyText([], [], null)).toBe('CachePulse: no requests recorded yet.')
})

test('an older miss is still found once newer requests hit', () => {
  const list = [S(1000, 50_000, 100), S(2000, 0, 60_000), S(3000, 60_000, 100)]
  expect(whyLines(list, [], '1h').join('\n')).toContain('Miss: read 0')
})
