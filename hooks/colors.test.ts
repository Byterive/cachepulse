import { expect, test } from 'claude-code/testing'

import { cacheColor, usageColor } from './style'

const MIN = 60_000

test('band bar colour follows the TTL left', () => {
  expect(cacheColor('warm', 40 * MIN, '1h')).toBe('#69cd72')
  expect(cacheColor('warm', 25 * MIN, '1h')).toBe('#eec047')
  expect(cacheColor('expiring', 10 * MIN, '1h')).toBe('#e8590c')
  expect(cacheColor('warm', 2 * MIN, '5m')).toBe('#eec047')
  expect(cacheColor('expiring', 0.5 * MIN, '5m')).toBe('#e8590c')
  expect(cacheColor('expired', null, '1h')).toBe('#e5534b')
  // Past the TTL the bar is red even while the label says it may be kept alive.
  expect(cacheColor('keepalive', null, '1h')).toBe('#e5534b')
  expect(cacheColor('unknown', null, null)).toBe('#69cd72')
})

test('usage bars: own colour, yellow from 80%, red from 95%', () => {
  expect(usageColor('five_hour', 10)).toBe('#5ed2ca')
  expect(usageColor('seven_day', 10)).toBe('#a78bfa')
  expect(usageColor('seven_day', 80)).toBe('#eec047')
  expect(usageColor('five_hour', 95)).toBe('#e5534b')
})
