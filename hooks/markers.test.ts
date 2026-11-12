import { expect, test } from 'claude-code/testing'

import { MARKER_CAP, addMarker, mergeItems, modelChange } from './markers'

const S = (at: number, model = 'claude-sonnet-5-5', over: object = {}) => ({
  turnId: 't',
  index: 0,
  model,
  at,
  read: 1,
  written: 0,
  uncached: 0,
  output: 1,
  hitShare: 1,
  state: 'data' as const,
  ...over,
})

test('model change compares main-thread requests only', () => {
  expect(modelChange(undefined, S(1))).toBeNull()
  expect(modelChange(null, S(1))).toBeNull()
  expect(modelChange('claude-sonnet-5-5', S(2))).toBeNull()
  expect(modelChange('claude-sonnet-5-5', S(2, 'claude-opus-5-5'))).toMatchObject({ kind: 'model', at: 2, detail: 'sonnet-5-5 to opus-5-5' })
  expect(modelChange('claude-sonnet-5-5', S(2, 'claude-opus-5-5', { agentId: 'a' }))).toBeNull()
})

test('markers are capped and merge with samples newest first, marker before the next request', () => {
  let list: ReturnType<typeof addMarker> = []
  for (let i = 0; i < MARKER_CAP + 5; i++) list = addMarker(list, { kind: 'compact', at: i })
  expect(list.length).toBe(MARKER_CAP)
  expect(list[0].at).toBe(5)

  const items = mergeItems([S(10), S(20)], [{ kind: 'clear', at: 20 }, { kind: 'compact', at: 15 }])
  expect(items.map(i => `${i.kind}@${i.at}`)).toEqual(['sample@20', 'marker@20', 'marker@15', 'sample@10'])
})
