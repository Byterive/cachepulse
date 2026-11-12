import { expect, test } from 'claude-code/testing'

import { SWITCH_TOAST_MS, switchToast } from './modelswitch'

const SW = {
  from_model: 'claude-sonnet-5-5',
  to_model: 'claude-opus-5-5',
  context_tokens: 120_000,
  prompt_cache_warm: true,
  cache_ttl: '5m' as const,
}

test('warm cache: the text names both models, the tokens and the TTL as reported by the host; no dollars', () => {
  const t = switchToast(SW)
  expect(t).toBe('Switching sonnet-5-5 to opus-5-5 rewrites the cache (~120k tokens). The cache was warm (5m TTL, reported by Claude Code).')
  expect(t).not.toContain('$')
})

test('cold cache or the same model: no warning', () => {
  expect(switchToast({ ...SW, prompt_cache_warm: false })).toBeNull()
  expect(switchToast({ ...SW, to_model: SW.from_model })).toBeNull()
})

test('the toast is short, 15 s', () => {
  expect(SWITCH_TOAST_MS).toBe(15_000)
})

function wire(on: any, kv: Map<string, unknown>) {
  on('classic.PreModelSwitch', () => ({}))
  const toasts: { text: string; options?: { timeoutMs?: number } }[] = []
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kv.get(e.key) }))
  on('ui.toast', (_: unknown, e: { text: string; options?: { timeoutMs?: number } }) => {
    toasts.push(e)
    return { value: undefined }
  })
  return toasts
}

test('a model switch event shows the toast for 15 s and passes on unblocked, (D8 a)', async ($, on) => {
  const toasts = wire(on, new Map())
  const result = await $.classic.PreModelSwitch({
    ...SW,
    requested_model: 'opus',
    source: 'sdk',
    estimated_cache_write_usd: 0.4,
    pricing: 'catalog',
  })
  expect(toasts.length).toBe(1)
  expect(toasts[0]?.text).toContain('Switching sonnet-5-5 to opus-5-5')
  expect(JSON.stringify(toasts[0])).toContain('15000')
  expect(JSON.stringify(result)).not.toContain('block')
})

test('the switch-warning toast stays silent when its own switch is off', async ($, on) => {
  const toasts = wire(on, new Map([['switchToastOff', true]]))
  await $.classic.PreModelSwitch({
    ...SW,
    requested_model: 'opus',
    source: 'command',
    estimated_cache_write_usd: 0.4,
    pricing: 'catalog',
  })
  expect(toasts.length).toBe(0)
})

test('a switch keeps the TTL Claude Code reported, with the time, for the explainer', async ($, on) => {
  const kv = new Map<string, unknown>()
  wire(on, kv)
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    kv.set(e.key, e.value)
    return { value: undefined }
  })
  on('clock.now', () => ({ value: 5000 }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('classic.PostModelSwitch', () => ({}))
  await $.classic.PostModelSwitch({ ...SW, cache_ttl: '1h', requested_model: null, source: 'auto', estimated_cache_write_usd: 0, pricing: 'catalog' })
  expect(kv.get('hostTtl')).toEqual({ ttl: '1h', at: 5000 })
})
