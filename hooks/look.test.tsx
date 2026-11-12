import { expect, test } from 'claude-code/testing'

// Teal chips look.

const CONFIG = {
  setting: null,
  env: { force5m: false, ttl: null, enable1h: false },
  account: 'unknown',
  pin: null,
  keepAliveHint: false,
}
const SAMPLE = {
  turnId: 't1', index: 0, model: 'claude-sonnet-5-5', at: 0, read: 477000, written: 2100, uncached: 2, output: 1000,
  hitShare: 477000 / (477000 + 2100 + 2), state: 'data',
}
const state = (_: unknown, e: { key: string }) => ({
  value: {
    value: e.key === 'samples' ? { shape: 'samples-1', value: [SAMPLE] } : { shape: 'config-2', value: CONFIG },
    version: 1,
  },
})

test('the band has the title chip, the state chip on the action block, a dotted divider and the teal frame', async ($, on) => {
  on('state.get', state)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))
  const band = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'AbovePrompt',
    surface: 'vscode',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  })
  expect((await band.find({ type: 'Text', text: /CachePulse/ }))?.props.backgroundColor).toBe('#314746')
  expect((await band.find({ type: 'Text', text: /Warm|Expiring|Expired|State unknown/ }))?.props.backgroundColor).toBe('#314746')
  expect((await band.find({ key: 'actions' }))?.props.backgroundColor).toBe('#2b3c3d')
  expect((await band.find({ key: 'band' }))?.props.borderColor).toBe('#6f9996')
  const dots = await band.find({ type: 'Text', text: /^┈+$/ })
  expect(dots?.props.color).toBe('#71928c')
  // a long run of dots, cut off by a full-width box that hides the overflow.
  expect((dots?.text ?? '').length).toBeGreaterThan(200)
  const box = await band.find({ key: 'band-divider' })
  expect(box?.props.width).toBe('100%')
  expect(box?.props.overflow).toBe('hidden')
})

test('the pane has a round teal frame and dotted dividers between its sections', async ($, on) => {
  on('state.get', state)
  const pane = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'Pane',
    requestId: 'cachepulse',
    surface: 'vscode',
    props: { title: 'CachePulse', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  const frame = await pane.find({ key: 'pane-frame' })
  expect(frame?.props.borderStyle).toBe('round')
  expect(frame?.props.borderColor).toBe('#6f9996')
  for (const k of ['d-where', 'd-totals', 'd-miss', 'd-trend']) expect(await pane.find({ key: k })).toBeTruthy()
})

test('the empty pane is framed too', async ($, on) => {
  on('state.get', (_, e) => ({
    value: { value: e.key === 'samples' ? { shape: 'samples-1', value: [] } : { shape: 'config-2', value: CONFIG }, version: 1 },
  }))
  const pane = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'Pane',
    requestId: 'cachepulse',
    surface: 'vscode',
    props: { title: 'CachePulse', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect((await pane.find({ key: 'pane-frame' }))?.props.borderStyle).toBe('round')
})

const panelProps = { title: 'CachePulse', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} } as const

test('side panel text styles: headings teal bold, the main line white bold, the rest dark grey not bold', async ($, on) => {
  on('state.get', state)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 16 }] } }))
  const pane = await $.ui.mount({ plugin: 'cachepulse', component: 'Pane', requestId: 'cachepulse', surface: 'vscode', props: panelProps })
  const head = await pane.find({ type: 'Text', text: 'Cache lifetime (TTL)' })
  expect(head?.props.bold).toBe(true)
  expect(head?.props.color).toBe('#5ed2ca')
  const main = await pane.find({ type: 'Text', text: /TTL · inferred|TTL unknown/ })
  expect(main?.props.bold).toBe(true)
  expect(main?.props.color).toBe('#e9edef')
  const dim = await pane.find({ type: 'Text', text: /^not set \(\d+\)$/ })
  expect(dim?.props.color).toBe('#9aa4aa')
  expect(dim?.props.bold).toBeFalsy()
  // Plan usage rows have no main line: dark grey.
  expect((await pane.find({ type: 'Text', text: /^16%/ }))?.props.color).toBe('#9aa4aa')
})

test('removed text is gone from the side panel', async ($, on) => {
  on('state.get', state)
  const pane = await $.ui.mount({ plugin: 'cachepulse', component: 'Pane', requestId: 'cachepulse', surface: 'vscode', props: panelProps })
  for (const gone of [/only what CachePulse shows/, /costs more to write/, /Read-only: CachePulse/, /Token counts are observed/, /cap 200/]) {
    expect(await pane.find({ type: 'Text', text: gone })).toBeFalsy()
  }
  // Kept: the cutoff (R26), the evidence line's home and the subagent TTL.
  expect(await pane.find({ type: 'Text', text: /Hit: read share 80% or more/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /Subagent TTL/ })).toBeTruthy()
})

test('plan usage sits right after Cost estimate and before Where the TTL comes from', async ($, on) => {
  on('state.get', state)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 16 }] } }))
  const pane = await $.ui.mount({ plugin: 'cachepulse', component: 'Pane', requestId: 'cachepulse', surface: 'vscode', props: panelProps })
  // findAll returns Text elements in drawing order.
  const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
  const at = (s: string) => texts.findIndex(t => t.includes(s))
  expect(at('Cost estimate')).toBeGreaterThan(-1)
  expect(at('Plan usage')).toBeGreaterThan(at('Cost estimate'))
  expect(at('Where the TTL comes from')).toBeGreaterThan(at('Plan usage'))
  expect(at('Latest miss')).toBeGreaterThan(at('Where the TTL comes from'))
})

test("every label is a chip: bold, the theme label colour on its label background", async ($, on) => {
  on('state.get', state)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 16 }, { kind: 'seven_day', percentUsed: 30 }] } }))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: e.key === 'costOn' ? true : undefined }))
  const pane = await $.ui.mount({ plugin: 'cachepulse', component: 'Pane', requestId: 'cachepulse', surface: 'vscode', props: panelProps })
  for (const label of [/Show TTL as:/, /Theme:/, /Expiry toast/, /Model-switch warning:/, /Cost estimate:/, /5-hour/, /7-day/]) {
    const chip = await pane.find({ type: 'Text', text: label })
    expect(chip?.props.bold).toBe(true)
    expect(chip?.props.color).toBe('#f0d9bd')
    expect(chip?.props.backgroundColor).toBe('#4a4037')
  }
})

test('the transcript section is gone', async ($, on) => {
  on('state.get', state)
  const pane = await $.ui.mount({ plugin: 'cachepulse', component: 'Pane', requestId: 'cachepulse', surface: 'vscode', props: panelProps })
  expect(await pane.find({ type: 'Text', text: /ranscript/ })).toBeFalsy()
  expect(await pane.find({ type: 'Text', text: /Last cache write/ })).toBeFalsy()
})

test('the dotted line has no ellipsis wrap and is clipped by its box', async ($, on) => {
  on('state.get', state)
  const pane = await $.ui.mount({ plugin: 'cachepulse', component: 'Pane', requestId: 'cachepulse', surface: 'vscode', props: panelProps })
  const dots = await pane.find({ type: 'Text', text: /^┈+$/ })
  expect(dots?.props.wrap).toBeUndefined()
  const box = await pane.find({ key: 'd-where' })
  expect(box?.props.overflow).toBe('hidden')
})

test('the band has no extra padding: only the frame has side padding', async ($, on) => {
  on('state.get', state)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))
  const band = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'AbovePrompt',
    surface: 'vscode',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  })
  const frame = await band.find({ key: 'band' })
  expect(frame?.props.paddingX).toBe(1)
  expect(frame?.props.paddingY).toBeUndefined()
  expect((await band.find({ key: 'top' }))?.props.paddingX).toBeUndefined()
  expect((await band.find({ key: 'row2' }))?.props.paddingX).toBeUndefined()
})

const KEEP = (_: unknown, e: { key: string }) => ({
  value: {
    value:
      e.key === 'samples'
        ? { shape: 'samples-1', value: [SAMPLE] }
        : { shape: 'config-2', value: { ...CONFIG, pin: '5m', keepAliveHint: true } },
    version: 1,
  },
})

test('past the TTL on a release that can refresh the cache: the band says "May have been refreshed" and the pane says why (E3)', async ($, on) => {
  on('state.get', KEEP)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 10 * 60_000 }))
  on('ui.panes', () => ({ value: [] }))
  const band = await $.ui.mount({
    plugin: 'cachepulse',
    component: 'AbovePrompt',
    surface: 'vscode',
    props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 9, bodyColumns: 100, scroll: { offset: 0, bodyRows: 9 }, view: {} },
  })
  expect(await band.find({ type: 'Text', text: /May have been refreshed/ })).toBeTruthy()
  expect(await band.find({ type: 'Text', text: /May be kept alive/ })).toBeFalsy()
})

test('the pane explains the refreshed state in one dim line (E3)', async ($, on) => {
  on('state.get', KEEP)
  on('clock.now', () => ({ value: 10 * 60_000 }))
  const pane = await $.ui.mount({ plugin: 'cachepulse', component: 'Pane', requestId: 'cachepulse', surface: 'vscode', props: panelProps })
  expect(await pane.find({ type: 'Text', text: /can refresh the cache while idle/ })).toBeTruthy()
})

test('totals come with a key and the share column is "Read %" (E4)', async ($, on) => {
  on('state.get', state)
  const pane = await $.ui.mount({ plugin: 'cachepulse', component: 'Pane', requestId: 'cachepulse', surface: 'vscode', props: { ...panelProps, bodyColumns: 90 } })
  expect(await pane.find({ type: 'Text', text: /^read = from cache · wrote = written to cache · new = not cached · out = output · Read % = share of input read from cache$/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^Read %$/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^Share$/ })).toBeFalsy()
})

test('the trend heading names the lines, not their colours, since colours change with the theme (E9)', async ($, on) => {
  on('state.get', (_: unknown, e: { key: string }) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE, { ...SAMPLE, turnId: 't2', at: 1000 }] }
          : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))
  const pane = await $.ui.mount({ plugin: 'cachepulse', component: 'Pane', requestId: 'cachepulse', surface: 'vscode', props: panelProps })
  expect(await pane.find({ type: 'Text', text: 'Trend: read share 80-100% (solid line), context size (dashed line)' })).toBeTruthy()
})

test('the button rows are spaced by a blank line, and the other labels are chips too', async ($, on) => {
  on('state.get', state)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 1 } } }))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: e.key === 'costOn' ? true : undefined }))
  const pane = await $.ui.mount({ plugin: 'cachepulse', component: 'Pane', requestId: 'cachepulse', surface: 'vscode', props: panelProps })
  expect((await pane.find({ key: 'buttons' }))?.props.rowGap).toBe(1)
  for (const label of [/Cost \(estimate\):/, /Others:/, /Subagent TTL:/]) {
    const chip = await pane.find({ type: 'Text', text: label })
    expect(chip?.props.bold).toBe(true)
    expect(chip?.props.backgroundColor).toBe('#4a4037')
  }
})
