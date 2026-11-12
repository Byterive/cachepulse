import { expect, test } from 'claude-code/testing'

// Pane extras, split from band.test.tsx for the line budget.

const CONFIG = {
  setting: null,
  env: { force5m: false, ttl: null, enable1h: false },
  account: 'unknown',
  pin: null,
  keepAliveHint: false,
}

const SAMPLE = {
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

const PANE = {
  plugin: 'cachepulse',
  component: 'Pane',
  requestId: 'cachepulse',
  props: {
    title: 'CachePulse',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the pane shows a trend (Svg off the terminal, text on it), usage bars and the savings hint', async ($, on) => {
  const many = [0, 1, 2].map(i => ({ ...SAMPLE, turnId: `t${i}`, at: i * 1000, read: 30_000 + i * 60_000 }))
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: many }
          : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 23.5 }, { kind: 'seven_day', percentUsed: 41 }] },
  }))

  const pane = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await pane.find({ type: 'Svg' })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /5-hour/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /24%|23\.5%/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /\/clear could cut about/ })).toBeTruthy()
  const five = await pane.find({ key: 'use-five_hour' })
  expect(five?.props.borderStyle).toBe('single')
  expect(five?.props.borderColor).toBe('#5ed2ca')
  expect(five?.props.width).toBe(22)
  expect((await pane.find({ key: 'use-seven_day' }))?.props.borderColor).toBe('#a78bfa')
  await pane.unmount()

  const narrow = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 25 }, surface: 'vscode' })
  expect((await narrow.find({ key: 'use-five_hour' }))?.props.width).toBe(10)
  await narrow.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Svg' })).toBeFalsy()
  expect(await term.find({ type: 'Text', text: /^Share trend/ })).toBeTruthy()
  await term.unmount()
})

test('the pane shows the Latest miss card with cause, evidence and cutoff', async ($, on) => {
  const list = [
    { ...SAMPLE, turnId: 'a', at: 1000 },
    { ...SAMPLE, turnId: 'b', at: 2000, read: 0, written: 60_000, hitShare: 0 },
  ]
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: list }
          : e.key === 'markers'
            ? { shape: 'markers-1', value: [{ kind: 'compact', at: 1500, detail: 'manual' }] }
            : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))
  const pane = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await pane.find({ type: 'Text', text: 'Latest miss' })).toBeTruthy()
  // "Cause:" is a label chip; its text sits beside it.
  expect(await pane.find({ type: 'Text', text: /Cause:/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: 'conversation compacted (observed)' })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /Hit: read share 80% or more/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: 'never present' })).toBeFalsy()
  await pane.unmount()
})

const toastPane = (toast: boolean) => (_: unknown, e: { key: string }) => ({
  value: {
    value:
      e.key === 'samples'
        ? { shape: 'samples-1', value: [SAMPLE] }
        : e.key === 'toastOn'
          ? { shape: 'toastOn-1', value: toast }
          : { shape: 'config-2', value: CONFIG },
    version: 1,
  },
})

test('the expiry-toast switch reads On when the state says on', async ($, on) => {
  on('state.get', toastPane(true))
  const pane = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await pane.find({ key: 'toast-switch' }))?.props.label).toBe('● On')
})

test('the expiry-toast switch reads Off when the state says off', async ($, on) => {
  on('state.get', toastPane(false))
  const pane = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect((await pane.find({ key: 'toast-switch' }))?.props.label).toBe('○ Off')
})

test('the pane lists every TTL source with the winner marked', async ($, on) => {
  on('state.get', toastPane(true))
  const pane = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await pane.find({ type: 'Text', text: 'Where the TTL comes from' })).toBeTruthy()
  // only the winner and set sources show; the rest is one line.
  expect(await pane.find({ type: 'Text', text: /FORCE_PROMPT_CACHING_5M/ })).toBeFalsy()
  expect(await pane.find({ type: 'Text', text: /Others:/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^not set \(\d+\)$/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /Subagent TTL:/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^~5m \(inferred, default\)/ })).toBeTruthy()
})

test('the Show row stays on one line at a normal width', async ($, on) => {
  on('state.get', toastPane(true))
  const pane = await $.ui.mount({ ...PANE, surface: 'vscode', props: { ...PANE.props, bodyColumns: 60 } })
  expect((await pane.find({ key: 'ttl-show' }))?.props.flexWrap).toBe('nowrap')
  expect(await pane.find({ type: 'Text', text: /Show TTL as:/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /Expiry toast:/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: '1 min before expiry (1h cache: also 10 min)' })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: 'Model-switch warning:' })).toBeTruthy()
})

test('a very narrow pane lets the Show row wrap and shortens the switch labels', async ($, on) => {
  on('state.get', toastPane(true))
  const pane = await $.ui.mount({ ...PANE, surface: 'vscode', props: { ...PANE.props, bodyColumns: 30 } })
  expect((await pane.find({ key: 'ttl-show' }))?.props.flexWrap).toBe('wrap')
  expect((await pane.find({ key: 'ttl-show' }))?.props.columnGap).toBe(1)
  // wrapped lines of buttons get a blank line between them.
  expect((await pane.find({ key: 'ttl-show' }))?.props.rowGap).toBe(1)
  expect(await pane.find({ type: 'Text', text: 'Expiry toast:' })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: 'Switch warning:' })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: 'Model-switch warning:' })).toBeFalsy()
})
