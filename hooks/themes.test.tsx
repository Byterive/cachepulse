import { expect, test } from 'claude-code/testing'

import { THEMES } from './style'

// Selectable themes.

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
const BAND = {
  plugin: 'cachepulse',
  component: 'AbovePrompt',
  surface: 'vscode',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const
const PANE = {
  plugin: 'cachepulse',
  component: 'Pane',
  requestId: 'cachepulse',
  surface: 'vscode',
  props: { title: 'CachePulse', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

function wire(on: any, saved: string | undefined, kv = new Map<string, unknown>()) {
  if (saved !== undefined) kv.set('theme', saved)
  on('state.get', state)
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kv.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    kv.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('clock.now', () => ({ value: 60_000 }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.invalidate', () => ({ value: undefined }))
  return kv
}

test('the five themes exist and the meaning colours are not part of them', () => {
  expect(THEMES.map(t => t.key)).toEqual(['teal', 'slate', 'graphite', 'ink', 'warm'])
  for (const t of THEMES) expect(Object.keys(t)).not.toEqual(expect.arrayContaining(['good', 'warn', 'red']))
})

test('no saved choice gives Teal chips; a saved choice changes the band', async ($, on) => {
  wire(on, undefined)
  const teal = await $.ui.mount(BAND)
  expect((await teal.find({ key: 'band' }))?.props.backgroundColor).toBe('#222c2d')
  expect((await teal.find({ type: 'Text', text: /CachePulse/ }))?.props.backgroundColor).toBe('#314746')
  await teal.unmount()
})

test('Cocoa Slate: grey band, dark chip, dashed dividers, round frame', async ($, on) => {
  wire(on, 'slate')
  const band = await $.ui.mount(BAND)
  expect((await band.find({ key: 'band' }))?.props.backgroundColor).toBe('#333333')
  expect((await band.find({ key: 'band' }))?.props.borderColor).toBe('#7a868e')
  expect((await band.find({ key: 'band' }))?.props.borderStyle).toBe('round')
  expect((await band.find({ type: 'Text', text: /CachePulse/ }))?.props.backgroundColor).toBeUndefined()
  expect(await band.find({ type: 'Text', text: /^┄+$/ })).toBeTruthy()
})

test('Graphite: single frame, a divider in the band, darker second row', async ($, on) => {
  wire(on, 'graphite')
  const g = await $.ui.mount(BAND)
  expect((await g.find({ key: 'band' }))?.props.borderStyle).toBe('single')
  expect((await g.find({ key: 'row2' }))?.props.backgroundColor).toBe('#202326')
  expect(await g.find({ key: 'band-divider' })).toBeTruthy()
  expect(await g.find({ type: 'Text', text: /^╌+$/ })).toBeTruthy()
  await g.unmount()
})

test('Ink draws a double frame and Warm a pane with no frame', async ($, on) => {
  wire(on, 'ink')
  const ink = await $.ui.mount(BAND)
  expect((await ink.find({ key: 'band' }))?.props.borderStyle).toBe('double')
  await ink.unmount()
})

test('the pane frame follows the theme, and Warm has none', async ($, on) => {
  wire(on, 'warm')
  const pane = await $.ui.mount(PANE)
  expect((await pane.find({ key: 'pane-frame' }))?.props.borderStyle).toBeUndefined()
  // Dividers still use the theme's glyph.
  expect(await pane.find({ type: 'Text', text: /^┈+$/ })).toBeTruthy()
})

test('the pane lists all five themes with the current one marked', async ($, on) => {
  wire(on, 'ink')
  const pane = await $.ui.mount(PANE)
  expect((await pane.find({ key: 'theme-ink' }))?.props.label).toBe('● Ink')
  expect((await pane.find({ key: 'theme-teal' }))?.props.label).toBe('○ Teal chips')
  for (const t of THEMES) expect(await pane.find({ key: `theme-${t.key}` })).toBeTruthy()
})

test('pressing a theme saves it for the next start', async ($, on) => {
  const kv = wire(on, undefined)
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'theme-graphite' })
  expect(kv.get('theme')).toBe('graphite')
})

test('every theme draws the band divider, so the two button rows never touch; Ink uses a dashed one beside its double frame', async ($, on) => {
  for (const t of THEMES) expect(t.bandDivider).toBe(true)
  wire(on, 'ink')
  const ink = await $.ui.mount(BAND)
  expect(await ink.find({ type: 'Text', text: /^┄+$/ })).toBeTruthy()
  expect(await ink.find({ type: 'Text', text: /^─+$/ })).toBeFalsy()
  await ink.unmount()
})

test('Warm charcoal now has the band divider as well', async ($, on) => {
  wire(on, 'warm')
  const warm = await $.ui.mount(BAND)
  expect(await warm.find({ key: 'band-divider' })).toBeTruthy()
})
