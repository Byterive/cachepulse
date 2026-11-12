import { expect, test } from 'claude-code/testing'

// An in-memory stand-in for the host's state, honouring ifVersion.
function fakeState(on: (name: never, fn: never) => void) {
  const store = new Map<string, { value: unknown; version: number }>()
  const key = (e: { plugin: string; key: string }) => `${e.plugin}.${e.key}`
  ;(on as any)('state.get', (_: unknown, e: { plugin: string; key: string }) => {
    const held = store.get(key(e))
    return { value: { value: held?.value, version: held?.version ?? 0 } }
  })
  ;(on as any)(
    'state.set',
    (_: unknown, e: { plugin: string; key: string; value: unknown; ifVersion?: number }) => {
      const held = store.get(key(e))
      const version = held?.version ?? 0
      if (e.ifVersion !== undefined && e.ifVersion !== version) {
        return { value: { isSet: false, version } }
      }
      store.set(key(e), { value: e.value, version: version + 1 })
      return { value: { isSet: true, version: version + 1 } }
    },
  )
  return {
    /** A new session's empty state, as VS Code /clear gives with no session.start. */
    wipe: () => store.clear(),
    markers: () =>
      ((store.get('cachepulse.markers')?.value as { value: unknown[] } | undefined)?.value ??
        []) as Array<Record<string, unknown>>,
    config: () =>
      ((store.get('cachepulse.config')?.value as { value: unknown } | undefined)?.value ?? {}) as Record<string, unknown>,
    samples: () =>
      ((store.get('cachepulse.samples')?.value as { value: unknown[] } | undefined)?.value ??
        []) as Array<Record<string, unknown>>,
  }
}

type U = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  model: string
}
const usage = (read: number, written: number, fresh: number, model = 'claude-sonnet-5-5'): U => ({
  input_tokens: fresh,
  output_tokens: 7,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: written,
  model,
})

// Everything beneath the plugin is registered first, before any call on `$`.
// The test's own hooks stand for the engine; `current` is the usage the next
// step streams back.
function setup(on: any, storedModel?: string, stored: Record<string, unknown> = {}) {
  const state = fakeState(on)
  // `$.store` outlives a process; a test passes what an earlier process left there.
  const kv = new Map<string, unknown>(storedModel === undefined ? [] : [['lastModel', storedModel]])
  for (const [k, v] of Object.entries(stored)) kv.set(k, v)
  let limits: object[] = []
  let current: U | null = null
  let clock = 0
  let compacted: object = { messages: [MSG] }
  on('command.register', () => ({ value: { command: 'cachepulse' } }))
  on('settings.read', () => ({ value: {} }))
  on('env.get', () => ({ value: undefined }))
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kv.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    kv.set(e.key, e.value)
    return { value: undefined }
  })
  on('session.version', () => ({ value: { version: '2.1.310', base: '2.1.310' } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: limits } }))
  on('clock.every', () => ({ value: {} }))
  on('clock.now', () => ({ value: (clock += 1000) }))
  let redraws = 0
  on('ui.invalidate', () => {
    redraws += 1
    return { value: undefined }
  })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.end', (_: unknown, e: { sessionId: string }) => ({ sessionId: e.sessionId }))
  on('session.compact', () => compacted)
  on('session.measure', (_: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  on('turn.step', async function* (_: unknown, e: { turnId: string; index: number }) {
    const u = current
    yield { kind: 'stop', stopReason: 'end_turn', usage: u }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: u }
  })
  return {
    state,
    kv,
    limits: (l: object[]) => {
      limits = l
    },
    redraws: () => redraws,
    use: (u: U | null) => {
      current = u
    },
    compactWith: (result: object) => {
      compacted = result
    },
  }
}

async function step($: any, input: { turnId: string; index: number; agentId?: string }) {
  const stream = $.turn.step({ model: 'claude-sonnet-5-5', messageCount: 1, ...input })
  for await (const _ of stream) {
    // drain: the mod records on the stop chunk
  }
  await stream.result
}

const MSG = { role: 'user', text: 'summary', toolUses: [] }

const START = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('a stop chunk becomes one sample with the schema fields', async ($, on) => {
  const { state, use } = setup(on)
  use(usage(477000, 2100, 2))

  await $.session.start(START)
  await step($, { turnId: 't1', index: 0 })

  const [s] = state.samples()
  expect(state.samples().length).toBe(1)
  expect(s).toMatchObject({
    turnId: 't1',
    index: 0,
    model: 'claude-sonnet-5-5',
    read: 477000,
    written: 2100,
    uncached: 2,
    output: 7,
    state: 'data',
  })
  expect(Math.abs((s.hitShare as number) - 477000 / 479102)).toBeLessThan(1e-9)
  expect('agentId' in s).toBe(false)
})

test('a zero-token request is no data, a null usage makes no sample, a subagent is marked', async ($, on) => {
  const { state, use } = setup(on)
  await $.session.start(START)

  use(usage(0, 0, 0))
  await step($, { turnId: 't1', index: 0 })
  expect(state.samples()[0]).toMatchObject({ state: 'nodata', hitShare: null })

  use(null)
  await step($, { turnId: 't1', index: 1 })
  expect(state.samples().length).toBe(1)

  use(usage(10, 0, 5))
  await step($, { turnId: 't1', index: 2, agentId: 'sub1' })
  expect(state.samples()[1]).toMatchObject({ agentId: 'sub1', state: 'data' })
})

test('only the newest 200 samples are kept', async ($, on) => {
  const { state, use } = setup(on)
  use(usage(1, 0, 0))
  await $.session.start(START)

  for (let i = 0; i < 205; i++) await step($, { turnId: 't', index: i })

  expect(state.samples().length).toBe(200)
  expect(state.samples()[0]).toMatchObject({ index: 5 })
  expect(state.samples().at(-1)).toMatchObject({ index: 204 })
})

test('session end empties the list (this is how /clear shows up)', async ($, on) => {
  const { state, use } = setup(on)
  use(usage(1, 0, 0))
  await $.session.start(START)
  await step($, { turnId: 't', index: 0 })
  expect(state.samples().length).toBe(1)

  await $.session.end({ reason: 'clear', sessionId: 's1' })

  expect(state.samples().length).toBe(0)
})

test('a compaction that happened leaves one marker; precompute, skip and subagent leave none', async ($, on) => {
  const { state, compactWith } = setup(on)
  await $.session.start(START)

  await $.session.compact({ trigger: 'precompute', messages: [MSG] })
  compactWith({ skip: 'off' })
  await $.session.compact({ trigger: 'manual', messages: [MSG] })
  compactWith({ messages: [MSG] })
  await $.session.compact({ trigger: 'auto', messages: [MSG], agentId: 'sub1' })
  expect(state.markers().length).toBe(0)

  await $.session.compact({ trigger: 'manual', messages: [MSG] })
  expect(state.markers().length).toBe(1)
  expect(state.markers()[0]).toMatchObject({ kind: 'compact', detail: 'manual' })
})

test('a model change between main requests leaves a marker; a subagent does not', async ($, on) => {
  const { state, use } = setup(on)
  await $.session.start(START)

  use(usage(100, 0, 1, 'claude-sonnet-5-5'))
  await step($, { turnId: 't', index: 0 })
  use(usage(100, 0, 1, 'claude-opus-5-5'))
  await step($, { turnId: 't', index: 1, agentId: 'sub1' })
  expect(state.markers().length).toBe(0)

  await step($, { turnId: 't', index: 2 })
  expect(state.markers().length).toBe(1)
  expect(state.markers()[0]).toMatchObject({ kind: 'model', detail: 'sonnet-5-5 to opus-5-5' })
})

test('/clear leaves a clear marker; any other end leaves none', async ($, on) => {
  const { state, use } = setup(on)
  use(usage(1, 0, 0))
  await $.session.start(START)
  await step($, { turnId: 't', index: 0 })

  await $.session.end({ reason: 'clear', sessionId: 's1' })
  expect(state.samples().length).toBe(0)
  expect(state.markers()).toMatchObject([{ kind: 'clear' }])

  await $.session.end({ reason: 'other', sessionId: 's1' })
  expect(state.markers().length).toBe(0)
})

test('a model change across /clear still leaves a marker; any other end forgets the model', async ($, on) => {
  const { state, use } = setup(on)
  await $.session.start(START)

  use(usage(100, 0, 1, 'claude-sonnet-5-5'))
  await step($, { turnId: 't', index: 0 })
  await $.session.end({ reason: 'clear', sessionId: 's1' })
  use(usage(100, 0, 1, 'claude-opus-5-5'))
  await step($, { turnId: 't', index: 1 })
  expect(state.markers().map(m => m.kind)).toEqual(['clear', 'model'])
  expect(state.markers()[1]).toMatchObject({ detail: 'sonnet-5-5 to opus-5-5' })

  await $.session.end({ reason: 'other', sessionId: 's1' })
  use(usage(100, 0, 1, 'claude-sonnet-5-5'))
  await step($, { turnId: 't', index: 2 })
  expect(state.markers().length).toBe(0)
})

test('a fresh process (no session.end seen) shows a new-session marker and a model change from the store', async ($, on) => {
  const { state, use } = setup(on, 'claude-opus-5-5')
  use(usage(100, 0, 1, 'claude-sonnet-5-5'))
  await $.session.start(START)
  expect(state.markers()).toMatchObject([{ kind: 'session' }])

  await step($, { turnId: 't', index: 0 })
  expect(state.markers().map(m => m.kind)).toEqual(['session', 'model'])
  expect(state.markers()[1]).toMatchObject({ detail: 'opus-5-5 to sonnet-5-5' })
})

test('a first ever load with nothing stored leaves no marker', async ($, on) => {
  const { state, use } = setup(on)
  use(usage(100, 0, 1, 'claude-sonnet-5-5'))
  await $.session.start(START)
  await step($, { turnId: 't', index: 0 })
  expect(state.markers().length).toBe(0)
})

test('/clear redraws the band so old numbers go', async ($, on) => {
  const { redraws, use } = setup(on)
  use(usage(1, 0, 0))
  await $.session.start(START)
  const before = redraws()

  await $.session.end({ reason: 'clear', sessionId: 's1' })
  expect(redraws()).toBe(before + 1)
})

test('a response without plan windows keeps the known account; a plan account is kept in the store', async ($, on) => {
  const { state, kv, limits, use } = setup(on)
  use(usage(100, 0, 1))
  await $.session.start(START)
  limits([{ kind: 'five_hour', percentUsed: 20 }])
  await step($, { turnId: 't', index: 0 })
  expect(state.config().account).toBe('subscription')
  expect(kv.get('account')).toBe('subscription')

  limits([])
  await step($, { turnId: 't', index: 1 })
  expect(state.config().account).toBe('subscription')
})

test('a new process starts with the account an earlier one stored', async ($, on) => {
  const { state } = setup(on, undefined, { account: 'subscription' })
  await $.session.start(START)
  expect(state.config().account).toBe('subscription')
})

test('plan windows that arrive after the response (session.measure) set and store the account', async ($, on) => {
  const { state, kv } = setup(on)
  await $.session.start(START)
  expect(state.config().account).toBe('unknown')
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 10 }],
    changed: ['rateLimits'],
  })
  expect(state.config().account).toBe('subscription')
  expect(kv.get('account')).toBe('subscription')
})

test('an empty state with no session.start (VS Code /clear) is refilled: pin, account, New session marker', async ($, on) => {
  const { state, use } = setup(on, undefined, { ttlPin: '1h', account: 'subscription' })
  use(usage(100, 0, 1, 'claude-opus-5-5'))
  await $.session.start(START)
  await step($, { turnId: 't', index: 0 })
  expect(state.config()).toMatchObject({ pin: '1h', account: 'subscription' })

  state.wipe()
  use(usage(31000, 19000, 2, 'claude-opus-5-5'))
  await step($, { turnId: 'u', index: 0 })
  expect(state.config()).toMatchObject({ pin: '1h', account: 'subscription' })
  expect(state.markers().map(m => m.kind)).toEqual(['session'])
  const { text } = await $.command.run({ command: 'cachepulse', args: 'why' })
  expect(text).toContain('Cause: new session (a /clear or a restart) (likely)')
})

test('/cachepulse why answers in text with the latest miss and its cause', async ($, on) => {
  const { use } = setup(on)
  use(usage(0, 60000, 2))
  await $.session.start(START)
  await step($, { turnId: 't', index: 0 })
  const { text } = await $.command.run({ command: 'cachepulse', args: 'why' })
  expect(text).toContain('Latest miss')
  expect(text).toContain('Cause: first request seen since CachePulse loaded (likely)')
  expect(text).toContain('80%')
})

test('/cachepulse theme lists, switches and rejects an unknown name', async ($, on) => {
  const { kv } = setup(on)
  await $.session.start(START)
  const run = async (args: string) => (await $.command.run({ command: 'cachepulse', args } as never)).text
  expect(await run('theme')).toContain('Teal chips (current)')
  expect(await run('theme ink')).toBe('Theme set to Ink.')
  expect(kv.get('theme')).toBe('ink')
  expect(await run('theme nope')).toContain('No theme called "nope"')
  expect(await run('theme')).toContain('Ink (current)')
})

test('/cachepulse theme takes the short word or the printed name and lists in one order (E2)', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const run = async (args: string) => (await $.command.run({ command: 'cachepulse', args } as never)).text
  expect(await run('theme')).toContain('Themes: Teal chips (current), Cocoa Slate, Graphite, Ink, Warm charcoal.')
  expect(await run('theme warm')).toBe('Theme set to Warm charcoal.')
  expect(await run('theme Cocoa Slate')).toBe('Theme set to Cocoa Slate.')
  expect(await run('theme cocoa')).toBe('Theme set to Cocoa Slate.')
})
