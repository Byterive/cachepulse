import { expect, test } from 'claude-code/testing'

import { PARTIAL_BELOW, classify } from './classify'

const MIN = 60_000
const S = (at: number, read: number, written: number, uncached = 0, over: Record<string, unknown> = {}) => ({
  turnId: `t${at}`,
  index: 0,
  model: 'claude-sonnet-5-5',
  at,
  read,
  written,
  uncached,
  output: 1,
  hitShare: read + written + uncached === 0 ? null : read / (read + written + uncached),
  state: read + written + uncached === 0 ? ('nodata' as const) : ('data' as const),
  ...over,
})

test('a high read share is a hit with no cause; zero tokens is nodata, never a 0% miss', () => {
  const list = [S(0, 0, 50_000), S(MIN, 50_000, 1000)]
  expect(classify(list, [], 1, '5m')).toMatchObject({ kind: 'hit', cause: null })
  expect(classify([S(0, 0, 0)], [], 0, '5m')).toMatchObject({ kind: 'nodata', cause: null })
})

test('first request: likely, never observed (the mod may have loaded mid-session)', () => {
  const v = classify([S(0, 0, 50_000)], [], 0, '5m')
  expect(v).toMatchObject({ kind: 'miss', cause: 'first-request', confidence: 'likely' })
  expect(v?.evidence.length).toBeGreaterThan(0)
})

test('compaction, clear and model markers are observed, in that priority, only when between the two requests', () => {
  const list = [S(0, 40_000, 1000), S(MIN, 0, 20_000)]
  expect(classify(list, [{ kind: 'compact', at: 30_000, detail: 'auto' }], 1, '5m')).toMatchObject({ cause: 'compaction', confidence: 'observed' })
  expect(classify(list, [{ kind: 'clear', at: 30_000 }, { kind: 'compact', at: 31_000 }], 1, '5m')).toMatchObject({ cause: 'clear', confidence: 'observed' })
  expect(classify(list, [{ kind: 'model', at: 30_000, detail: 'a -> b' }], 1, '5m')).toMatchObject({ cause: 'model-change', confidence: 'observed' })
  // Markers from before the previous request or after this one are not evidence.
  expect(classify(list, [{ kind: 'compact', at: -5 }, { kind: 'compact', at: MIN + 1 }], 1, '5m')).toMatchObject({ cause: 'unexplained' })
})

test('a differing model field is observed even without a marker', () => {
  const list = [S(0, 40_000, 1000), S(MIN, 0, 20_000, 0, { model: 'claude-opus-5-5' })]
  expect(classify(list, [], 1, '5m')).toMatchObject({ cause: 'model-change', confidence: 'observed' })
})

test('TTL lapse is likely and only for a full miss; a shorter gap stays unexplained (unknown)', () => {
  const lapsed = [S(0, 40_000, 1000), S(6 * MIN, 0, 20_000)]
  expect(classify(lapsed, [], 1, '5m')).toMatchObject({ kind: 'miss', cause: 'ttl-expired', confidence: 'likely' })
  expect(classify(lapsed, [], 1, '1h')).toMatchObject({ cause: 'unexplained', confidence: 'unknown' })
  expect(classify(lapsed, [], 1, null)).toMatchObject({ cause: 'unexplained', confidence: 'unknown' })
  const quick = [S(0, 40_000, 1000), S(MIN, 0, 20_000)]
  expect(classify(quick, [], 1, '5m')).toMatchObject({ cause: 'unexplained', confidence: 'unknown' })
})

test('session marker is likely, not observed (a /clear and a restart look alike)', () => {
  const list = [S(0, 40_000, 1000), S(MIN, 0, 20_000)]
  expect(classify(list, [{ kind: 'session', at: 30_000 }], 1, '5m')).toMatchObject({ cause: 'new-session', confidence: 'likely' })
})

test('caching off: nothing read and nothing written', () => {
  const list = [S(0, 40_000, 1000), S(MIN, 0, 0, 30_000)]
  expect(classify(list, [], 1, '5m')).toMatchObject({ kind: 'miss', cause: 'caching-off', confidence: 'likely' })
})

test(`partial hit: under ${PARTIAL_BELOW * 100}% with a write; a marker explains it, otherwise unknown`, () => {
  const list = [S(0, 40_000, 1000), S(MIN, 30_000, 20_000)]
  expect(classify(list, [], 1, '5m')).toMatchObject({ kind: 'partial', cause: 'unexplained', confidence: 'unknown' })
  expect(classify(list, [{ kind: 'compact', at: 30_000 }], 1, '5m')).toMatchObject({ kind: 'partial', cause: 'compaction' })
  // The TTL cannot explain a partial hit: part of the prefix was read.
  const slow = [S(0, 40_000, 1000), S(9 * MIN, 30_000, 20_000)]
  expect(classify(slow, [], 1, '5m')).toMatchObject({ kind: 'partial', cause: 'unexplained' })
})

test('low share with nothing written is new content, likely; exactly at the cutoff is a hit', () => {
  const list = [S(0, 40_000, 1000), S(MIN, 40_000, 0, 30_000)]
  expect(classify(list, [], 1, '5m')).toMatchObject({ kind: 'hit', cause: 'new-content', confidence: 'likely' })
  expect(classify([S(0, 800, 0, 200)], [], 0, '5m')).toMatchObject({ kind: 'hit', cause: null })
})

test('subagent requests and bad indexes are not classified; subagent samples do not count as the previous request', () => {
  const list = [S(0, 40_000, 1000), S(10_000, 0, 5000, 0, { agentId: 'a' }), S(MIN, 0, 20_000)]
  expect(classify(list, [], 1, '5m')).toBeNull()
  expect(classify(list, [], 9, '5m')).toBeNull()
  expect(classify(list, [{ kind: 'compact', at: 5000 }], 2, '5m')).toMatchObject({ cause: 'compaction' })
})
