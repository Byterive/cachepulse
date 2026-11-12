import { expect, test } from 'claude-code/testing'

import { meter } from './meter'
import { accountOf, describeTtl, observeTtl, resolveTtl } from './ttl'

const MIN = 60_000
const BASE = {
  setting: null,
  env: { force5m: false, ttl: null, enable1h: false },
  account: 'unknown',
  pin: null,
  keepAliveHint: true,
} as const

const S = (at: number, read: number, written: number, over: object = {}) => ({
  turnId: 't',
  index: 0,
  model: 'm',
  at,
  read,
  written,
  uncached: 1,
  output: 1,
  hitShare: 0.5,
  state: 'data' as const,
  ...over,
})

test('unknown until something says otherwise', () => {
  expect(resolveTtl(BASE, []).ttl).toBeNull()
  expect(describeTtl(resolveTtl(BASE, []))).toBe('TTL unknown')
})

test('configured sources keep their order and are labelled configured', () => {
  const r = (c: object) => resolveTtl({ ...BASE, ...c }, [])
  expect(r({ setting: '1h' })).toMatchObject({ ttl: '1h', kind: 'configured' })
  expect(r({ setting: '1h', env: { ...BASE.env, ttl: '5m' } }).source).toBe('CLAUDE_CODE_PROMPT_CACHE_TTL')
  expect(r({ setting: '1h', env: { ...BASE.env, ttl: '1h', force5m: true } })).toMatchObject({ ttl: '5m', source: 'FORCE_PROMPT_CACHING_5M' })
  expect(r({ env: { ...BASE.env, enable1h: true } })).toMatchObject({ ttl: '1h', kind: 'configured' })
})

test('account defaults are inferred, never configured', () => {
  const r = (account: string) => resolveTtl({ ...BASE, account } as never, [])
  expect(r('subscription')).toMatchObject({ ttl: '1h', kind: 'inferred' })
  expect(r('credits')).toMatchObject({ ttl: '5m', kind: 'inferred' })
  expect(r('other')).toMatchObject({ ttl: '5m', kind: 'inferred' })
  expect(describeTtl(r('subscription'))).toBe('~1h TTL · inferred (subscription default)')
})

test('the pin wins and is labelled as set in CachePulse', () => {
  const r = resolveTtl({ ...BASE, pin: '5m', setting: '1h' }, [])
  expect(r).toMatchObject({ ttl: '5m', kind: 'set' })
  expect(describeTtl(r)).toBe('5m TTL · set in CachePulse')
})

test('timing proves 1h on a late hit and hints 5m on a late miss', () => {
  expect(observeTtl([S(0, 100, 0), S(10 * MIN, 90, 5)])).toBe('1h')
  expect(observeTtl([S(0, 100, 0), S(10 * MIN, 0, 100)])).toBe('5m')
  expect(observeTtl([S(0, 100, 0), S(2 * MIN, 0, 100)])).toBeNull()
  expect(observeTtl([S(0, 100, 0), S(10 * MIN, 90, 5, { model: 'other' })])).toBeNull()
  expect(observeTtl([S(0, 100, 0), S(10 * MIN, 90, 5, { agentId: 'sub' })])).toBeNull()
  expect(resolveTtl({ ...BASE, setting: '5m' }, [S(0, 100, 0), S(10 * MIN, 90, 5)]).ttl).toBe('1h')
})

test('account comes from plan windows; with none it stays unknown', () => {
  expect(accountOf([], false)).toBe('unknown')
  expect(accountOf([], true)).toBe('unknown')
  expect(accountOf([{ kind: 'five_hour', percentUsed: 20 }], true)).toBe('subscription')
  expect(accountOf([{ kind: 'seven_day', percentUsed: 100 }], true)).toBe('credits')
})

test('the meter uses the resolved TTL', () => {
  const list = [S(0, 10, 0)]
  const one = { ttl: '1h', kind: 'configured', source: 'x' } as const
  const five = { ttl: '5m', kind: 'configured', source: 'x' } as const
  const none = { ttl: null, kind: 'unknown', source: 'x' } as const
  expect(meter(list, 1 * MIN, one, true)).toMatchObject({ state: 'warm', remainingMs: 59 * MIN })
  expect(meter(list, 4.5 * MIN, five, true).state).toBe('expiring')
  expect(meter(list, 6 * MIN, five, true).state).toBe('keepalive')
  expect(meter(list, 6 * MIN, five, false).state).toBe('expired')
  expect(meter(list, 6 * MIN, none, true).state).toBe('unknown')
})
