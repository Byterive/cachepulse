import { expect, test } from 'claude-code/testing'

// Subagent split (p5-s1).

const CONFIG = {
  setting: null,
  env: { force5m: false, ttl: null, enable1h: false },
  account: 'unknown',
  pin: null,
  keepAliveHint: false,
}
const MAIN = {
  turnId: 't1',
  index: 0,
  model: 'claude-sonnet-5-5',
  at: 0,
  read: 477000,
  written: 2100,
  uncached: 2,
  output: 1000,
  hitShare: 477000 / (477000 + 2100 + 2),
  state: 'data',
}
// A later subagent request with nothing read: it must not show in the band.
const SUB = { ...MAIN, turnId: 't2', at: 1000, agentId: 'a1', read: 0, written: 30_000, hitShare: 0 }

const state = (_: unknown, e: { key: string }) => ({
  value: {
    value: e.key === 'samples' ? { shape: 'samples-1', value: [MAIN, SUB] } : { shape: 'config-2', value: CONFIG },
    version: 1,
  },
})

test('the band follows the main conversation only, even when a subagent request came last', async ($, on) => {
  on('state.get', state)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))
  const ui = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'AbovePrompt',
    surface: 'vscode',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: /99\.6%/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /0\.0%/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /subagent/ })).toBeFalsy()
})

test('the pane totals list main and subagents apart, each with its own share', async ($, on) => {
  on('state.get', state)
  const pane = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'Pane',
    requestId: 'cachepulse',
    surface: 'vscode',
    props: { title: 'CachePulse', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect(await pane.find({ type: 'Text', text: /^Main \(1\).*477k.*99\.6%/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^Subagents \(1\).*30k.*0\.0%/ })).toBeTruthy()
})

import { modelGroups, textTimeline } from './timeline'

const OPUS = { ...MAIN, turnId: 't3', at: 2000, model: 'claude-opus-5-5', read: 1000, written: 0, uncached: 0, hitShare: 1 }
const HAIKU_SUB = { ...SUB, turnId: 't4', at: 3000, model: 'claude-haiku-5-5' }

test('by model: nothing with one model; with several, one line per model and side, newest first', () => {
  expect(modelGroups([MAIN, SUB] as never)).toEqual([])
  const g = modelGroups([MAIN, SUB, OPUS, HAIKU_SUB] as never)
  expect(g.map(x => x.label)).toEqual(['haiku-5-5 sub', 'opus-5-5 main', 'sonnet-5-5 sub', 'sonnet-5-5 main'])
  // Main and subagent requests of the same model are never summed together.
  expect(g.find(x => x.label === 'sonnet-5-5 main')?.n).toBe(1)
  expect(g.find(x => x.label === 'sonnet-5-5 sub')?.written).toBe(30_000)
})

test('the text output carries the same by-model lines under the same rule', () => {
  expect(textTimeline([MAIN, SUB] as never, 10)).not.toContain('sonnet-5-5 main:')
  const t = textTimeline([MAIN, OPUS] as never, 10)
  expect(t).toContain('opus-5-5 main: 1 request(s), read 1.0k')
  expect(t).toContain('sonnet-5-5 main: 1 request(s), read 477k')
})

test('the pane shows a By model section only with more than one model', async ($, on) => {
  const two = (_: unknown, e: { key: string }) => ({
    value: {
      value: e.key === 'samples' ? { shape: 'samples-1', value: [MAIN, OPUS] } : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  })
  on('state.get', two)
  const pane = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'Pane',
    requestId: 'cachepulse',
    surface: 'vscode',
    props: { title: 'CachePulse', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect(await pane.find({ type: 'Text', text: 'By model' })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^opus-5-5 main \(1\)/ })).toBeTruthy()
})

test('the pane has no By model section with a single model', async ($, on) => {
  on('state.get', state)
  const pane = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'Pane',
    requestId: 'cachepulse',
    surface: 'vscode',
    props: { title: 'CachePulse', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect(await pane.find({ type: 'Text', text: 'By model' })).toBeFalsy()
})

test('the cost estimate is off by default: a switch, and no dollar line', async ($, on) => {
  on('state.get', state)
  on('store.get', () => ({ value: undefined }))
  const pane = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'Pane',
    requestId: 'cachepulse',
    surface: 'vscode',
    props: { title: 'CachePulse', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect((await pane.find({ key: 'cost-switch' }))?.props.label).toBe('○ Off')
  expect(await pane.find({ type: 'Text', text: /Cost \(estimate\)/ })).toBeFalsy()
})

test('switched on, the pane shows the cost line with the host total', async ($, on) => {
  on('state.get', state)
  on('store.get', (_: unknown, e: { key: string }) => ({ value: e.key === 'costOn' ? true : undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 0.42 } } }))
  const pane = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'Pane',
    requestId: 'cachepulse',
    surface: 'vscode',
    props: { title: 'CachePulse', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect((await pane.find({ key: 'cost-switch' }))?.props.label).toBe('● On')
  expect(await pane.find({ type: 'Text', text: /Cost \(estimate\):/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^\$0\.42 this session \(Claude Code\)/ })).toBeTruthy()
})
