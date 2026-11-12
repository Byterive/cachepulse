import { expect, test } from 'claude-code/testing'

import { TOAST_MS, WARN_LEAD_MS, expiryToast } from './warn'

const MIN = 60_000
const S = (at: number, over: Record<string, unknown> = {}) => ({
  turnId: `t${at}`,
  index: 0,
  model: 'm',
  at,
  read: 1000,
  written: 10,
  uncached: 1,
  output: 1,
  hitShare: 0.99,
  state: 'data' as const,
  ...over,
})
const SET5 = { ttl: '5m' as const, kind: 'set' as const, source: 'set in CachePulse' }
const UNKNOWN = { ttl: null, kind: 'unknown' as const, source: 'no setting, no plan data yet' }

test('warns once inside the last minute, with the TTL and where it came from', () => {
  const list = [S(0)]
  const t = expiryToast(list, 5 * MIN - 30_000, SET5, true, null)
  expect(t?.text).toBe('Cache may expire in ~1 min (5m TTL, set in CachePulse). The next request would rewrite it.')
  expect(t?.anchor).toBe(0)
  // Already warned for this request: silent.
  expect(expiryToast(list, 5 * MIN - 10_000, SET5, true, { at: 0, lead: MIN })).toBeNull()
  // The next request has a new anchor, so it warns again.
  expect(expiryToast([S(0), S(10 * MIN)], 15 * MIN - 30_000, SET5, true, { at: 0, lead: MIN })).not.toBeNull()
})

test('silent before the window, at or after expiry', () => {
  const list = [S(0)]
  expect(expiryToast(list, 5 * MIN - WARN_LEAD_MS - 1, SET5, true, null)).toBeNull()
  expect(expiryToast(list, 5 * MIN - WARN_LEAD_MS, SET5, true, null)).not.toBeNull()
  expect(expiryToast(list, 5 * MIN, SET5, true, null)).toBeNull()
  expect(expiryToast(list, 6 * MIN, SET5, true, null)).toBeNull()
})

test('silent when switched off, when the TTL is unknown, or with no cache request', () => {
  const list = [S(0)]
  expect(expiryToast(list, 5 * MIN - 30_000, SET5, false, null)).toBeNull()
  expect(expiryToast(list, 5 * MIN - 30_000, UNKNOWN, true, null)).toBeNull()
  expect(expiryToast([], 5 * MIN - 30_000, SET5, true, null)).toBeNull()
  expect(expiryToast([S(0, { read: 0, written: 0 })], 5 * MIN - 30_000, SET5, true, null)).toBeNull()
})

test('a subagent request does not move the anchor', () => {
  const list = [S(0), S(4 * MIN, { agentId: 'a' })]
  expect(expiryToast(list, 5 * MIN - 30_000, SET5, true, null)?.anchor).toBe(0)
})

test('an inferred or configured TTL says so in the toast', () => {
  const list = [S(0)]
  const inferred = { ttl: '1h' as const, kind: 'inferred' as const, source: 'subscription default' }
  expect(expiryToast(list, 60 * MIN - 30_000, inferred, true, null)?.text).toContain('1h TTL, inferred, subscription default')
  const cfg = { ttl: '5m' as const, kind: 'configured' as const, source: 'promptCacheTtl setting' }
  expect(expiryToast(list, 5 * MIN - 30_000, cfg, true, null)?.text).toContain('configured, promptCacheTtl setting')
})

test('a 1h TTL warns at 10 min left and again at 1 min left; a tighter lead shown skips the looser', () => {
  const list = [S(0)]
  const H1 = { ttl: '1h' as const, kind: 'set' as const, source: 'set in CachePulse' }
  expect(expiryToast(list, 49 * MIN, H1, true, null)).toBeNull()
  const first = expiryToast(list, 50 * MIN + 10_000, H1, true, null)
  expect(first?.lead).toBe(10 * MIN)
  expect(first?.text).toBe('Cache may expire in ~10 min (1h TTL, set in CachePulse). The next request would rewrite it.')
  // The 10 min one was shown: silent until 1 min left, then the 1 min one.
  expect(expiryToast(list, 55 * MIN, H1, true, { at: 0, lead: 10 * MIN })).toBeNull()
  expect(expiryToast(list, 59 * MIN + 10_000, H1, true, { at: 0, lead: 10 * MIN })?.lead).toBe(MIN)
  expect(expiryToast(list, 59 * MIN + 20_000, H1, true, { at: 0, lead: MIN })).toBeNull()
  // First seen already inside the last minute: only the 1 min toast.
  expect(expiryToast(list, 59 * MIN + 10_000, H1, true, null)?.lead).toBe(MIN)
})

test('toasts stay 60 s', () => {
  expect(TOAST_MS).toBe(60_000)
})
