import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'cachepulse',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

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

test('the band shows read share and token counts on terminal and desktop', async ($, on) => {
  // The host stores a shaped value as { shape, value }.
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE] }
          : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))
  // Stands for the engine's own drawing beneath the plugin.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /99\.6%/ }))?.text).toContain('99.6%')
    expect(await ui.find({ type: 'Text', text: /477k/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /TTL unknown/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', text: /Open details/ })).toBeTruthy()
    await ui.unmount()
  }
})

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

test('the pane lists the request and totals on every surface', async ($, on) => {
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE] }
          : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Last 1 request/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /sonnet-5-5/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /99\.6%/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /TTL unknown/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', text: /1h/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('the pane labels a plan-based TTL as inferred', async ($, on) => {
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE] }
          : { shape: 'config-2', value: { ...CONFIG, account: 'subscription' } },
      version: 1,
    },
  }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /~1h TTL · inferred \(subscription default\)/ })).toBeTruthy()
  await ui.unmount()
})

test('the pane says so when nothing is recorded', async ($, on) => {
  on('state.get', () => ({ value: { value: { shape: 'samples-1', value: [] }, version: 1 } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /No requests recorded/ })).toBeTruthy()
  await ui.unmount()
})

test('a narrow pane drops the model column', async ($, on) => {
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE] }
          : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))

  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 }, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /477k/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /sonnet-5-5/ })).toBeFalsy()
  await ui.unmount()
})

test('a narrow band keeps two rows and a short button', async ($, on) => {
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE] }
          : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))

  const ui = await $.ui.mount({
    ...BAND,
    props: { ...BAND.props, bodyColumns: 38 },
    viewport: { columns: 60, rows: 24 },
    surface: 'terminal',
  })
  expect(await ui.find({ type: 'Text', text: /99\.6%/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /TTL unknown/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: /^Details/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', text: /Open details/ })).toBeFalsy()
  await ui.unmount()
})

test('after /clear the band says so until the first request; without a clear marker it stays hidden', async ($, on) => {
  let markers: unknown[] = [{ kind: 'clear', at: 1000 }]
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [] }
          : e.key === 'markers'
            ? { shape: 'markers-1', value: markers }
            : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))

  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Cleared · no requests yet/ })).toBeTruthy()
  await ui.unmount()

  markers = []
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Cleared/ })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeTruthy()
  await ui.unmount()
})

test('the pane lists markers between requests', async ($, on) => {
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE] }
          : e.key === 'markers'
            ? {
                shape: 'markers-1',
                value: [
                  { kind: 'compact', at: 1000, detail: 'auto' },
                  { kind: 'model', at: 2000, detail: 'sonnet-5-5 to opus-5-5' },
                ],
              }
            : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Conversation compacted \(auto\)/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Model changed: sonnet-5-5 to opus-5-5/ })).toBeTruthy()
  await ui.unmount()
})

test('a narrow pane drops the Share column so no row wraps', async ($, on) => {
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE] }
          : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))

  const narrow = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 38 }, surface: 'vscode' })
  expect(await narrow.find({ type: 'Text', text: /^Read %$/ })).toBeFalsy()
  expect(await narrow.find({ type: 'Text', text: /^Read$/ })).toBeTruthy()
  await narrow.unmount()

  const roomy = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 50 }, surface: 'vscode' })
  expect(await roomy.find({ type: 'Text', text: /^Read %$/ })).toBeTruthy()
  await roomy.unmount()
})

test('the band bar stretches into the free width so the button sits at the right edge', async ($, on) => {
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE] }
          : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))

  for (const columns of [38, 120]) {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: columns }, surface: 'vscode' })
    const bar = await ui.find({ key: 'bar' })
    expect(bar?.props.flexGrow).toBe(1)
    expect(bar?.props.minWidth).toBe(columns >= 100 ? 20 : 8)
    expect((await ui.find({ key: 'bar-fill' }))?.props.width).toBe('100%')
    expect(await ui.find({ key: 'details' })).toBeTruthy()
    await ui.unmount()
  }
})

test('a band of 60 to 99 columns uses the long labels', async ($, on) => {
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE] }
          : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))

  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 63 }, surface: 'vscode' })
  expect(await band.find({ type: 'Button', text: /Open details/ })).toBeTruthy()
  await band.unmount()

  const short = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 59 }, surface: 'vscode' })
  expect(await short.find({ type: 'Button', text: /^Details/ })).toBeTruthy()
  await short.unmount()
})

test('the band first row never wraps; the state text truncates; Share shows from 40 pane columns', async ($, on) => {
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [SAMPLE] }
          : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))

  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 63 }, surface: 'vscode' })
  expect((await band.find({ key: 'top' }))?.props.flexWrap).toBe('nowrap')
  expect((await band.find({ key: 'bar' }))?.props.flexShrink).toBe(1)
  expect((await band.find({ key: 'state' }))?.props.flexShrink).toBe(1)
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 }, surface: 'vscode' })
  expect(await pane.find({ type: 'Text', text: /^Read %$/ })).toBeTruthy()
  await pane.unmount()
})

test('band and pane colours and the More summary', async ($, on) => {
  let more = false
  let opened: Record<string, unknown> | undefined
  on('state.get', (_, e) => ({
    value: {
      value:
        e.key === 'samples'
          ? { shape: 'samples-1', value: [{ ...SAMPLE, read: 50, written: 50, uncached: 0, hitShare: 0.5 }] }
          : e.key === 'bandMore'
            ? { shape: 'bandMore-1', value: more }
            : { shape: 'config-2', value: CONFIG },
      version: 1,
    },
  }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', (_, e) => {
    opened = e as unknown as Record<string, unknown>
    return { value: { isPlaced: true } }
  })
  on('ui.invalidate', () => ({ value: undefined }))

  const TALL = { ...BAND, props: { ...BAND.props, maxRows: 9 } }
  let band = await $.ui.mount({ ...TALL, surface: 'vscode' })
  expect((await band.find({ key: 'band' }))?.props.backgroundColor).toBe('#222c2d')
  expect((await band.find({ key: 'bar-rest' }))?.props.backgroundColor).toBe('#3b5150')
  expect(await band.find({ type: 'Button', text: /More/ })).toBeTruthy()
  // One unbreakable label, so it never wraps onto two lines.
  expect(await band.find({ type: 'Text', text: 'cache read' })).toBeTruthy()
  // The top row shows the share once; the summary adds one per request.
  expect(await band.findAll({ type: 'Text', text: /^50\.0%$/ })).toHaveLength(1)
  await band.press({ key: 'details' })
  expect(opened?.backgroundColor).toBe('#263232')
  await band.unmount()

  more = true
  band = await $.ui.mount({ ...TALL, surface: 'vscode' })
  expect(await band.findAll({ type: 'Text', text: /^50\.0%$/ })).toHaveLength(2)
  expect(await band.find({ type: 'Button', text: /Less/ })).toBeTruthy()
  await band.unmount()
})
