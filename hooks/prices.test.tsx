import { expect, test } from 'claude-code/testing'

import { costLine } from './cost'
import { cacheSaved, formatUsd, priceFor, priceKey } from './prices'

const S = (model: string, read: number, written: number, uncached = 0, over: Record<string, unknown> = {}) =>
  ({ turnId: 't', index: 0, model, at: 0, read, written, uncached, output: 500, hitShare: 0.9, state: 'data', ...over }) as never

test('model ids map to the table: prefix, date and context suffix are dropped', () => {
  expect(priceKey('claude-opus-4-5-20251101[1m]')).toBe('opus-4-5')
  expect(priceFor(S('claude-sonnet-5-5', 1, 1))).toMatchObject({ input: 2, read: 0.1 })
  // opus-4 must not be taken for opus-4-5, nor the reverse.
  expect(priceFor(S('claude-opus-4', 1, 1))).toMatchObject({ input: 15 })
  expect(priceFor(S('claude-opus-4-5', 1, 1))).toMatchObject({ input: 5 })
  expect(priceFor(S('some-other-model', 1, 1))).toBeNull()
})

test('Haiku 5.5 picks its tier from the prompt size of each request', () => {
  expect(priceFor(S('claude-haiku-5-5', 50_000, 1000))).toMatchObject({ input: 0.1 })
  expect(priceFor(S('claude-haiku-5-5', 100_000, 1000))).toMatchObject({ input: 0.5 })
})

test('cache saved = read x (input - read price) - written x (write price - input); output drops out', () => {
  const list = [S('claude-sonnet-5-5', 1_000_000, 100_000)]
  // 1.0M x (2 - 0.1) = 1.90; 0.1M x (2.5 - 2) = 0.05 -> 1.85 at 5m; 0.1M x (4 - 2) = 0.20 -> 1.70 at 1h.
  expect(Math.abs(cacheSaved(list, '5m').usd - (1.85)) < 1e-9).toBe(true)
  expect(Math.abs(cacheSaved(list, '1h').usd - (1.7)) < 1e-9).toBe(true)
  // Subagent writes use the 5m price whatever the main TTL.
  expect(Math.abs(cacheSaved([S('claude-sonnet-5-5', 0, 100_000, 0, { agentId: 'a' })], '1h').usd - (-0.05)) < 1e-9).toBe(true)
})

test('an unknown model is left out and named; no-data requests are skipped', () => {
  const s = cacheSaved([S('mystery-1', 1_000_000, 0), S('claude-sonnet-5-5', 0, 0, 0, { state: 'nodata' })], '5m')
  expect(s.usd).toBe(0)
  expect(s.unpriced).toEqual(['mystery-1'])
  expect(s.n).toBe(0)
})

test('the line names both sources, says estimate, and adds the subscription note', () => {
  const list = [S('claude-sonnet-5-5', 1_000_000, 100_000)]
  const line = costLine(1.234, list, '5m', 'subscription')
  expect(line).toContain('Cost (estimate): $1.23 this session (Claude Code)')
  // the saved figure names its own span, unlike the host's whole-session total.
  expect(line).toContain('cache saved ≈ $1.85 over 1 request(s) since CachePulse loaded (list prices as of 2026-11-10, CachePulse table)')
  expect(line).toContain('List-price estimate only; it is not your bill.')
  expect(costLine(null, list, '5m', 'credits')).toContain('session total not given by Claude Code')
  expect(costLine(null, list, '5m', 'credits')).not.toContain('subscription')
  // E7: the same plain line on every account.
  expect(costLine(null, list, '5m', 'credits')).toContain('List-price estimate only; it is not your bill.')
  // Writes never read back cost more than they save.
  expect(costLine(0, [S('claude-sonnet-5-5', 0, 1_000_000)], '1h', 'unknown')).toContain('cache cost ≈ $2.00 more')
  expect(costLine(0, [S('mystery-1', 1, 1)], '5m', 'unknown')).toContain('No price for mystery-1; left out.')
})

test('dollars format to cents, small amounts to one significant digit', () => {
  expect(formatUsd(1.234)).toBe('$1.23')
  expect(formatUsd(0.0042)).toBe('$0.004')
  expect(formatUsd(-0.5)).toBe('-$0.50')
  expect(formatUsd(0)).toBe('$0.00')
})
