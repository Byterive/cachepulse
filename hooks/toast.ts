import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Config, Sample } from '../types'
import { resolveTtl } from './ttl'
import { TOAST_MS, expiryToast } from './warn'

// Same keys and shape tags as hooks/register.tsx: a hook reads only atoms declared in its own file.
const samples = atom({ plugin: 'cachepulse', key: 'samples' } as const, [] as Sample[], {
  shape: 'samples-1',
})
const config = atom(
  { plugin: 'cachepulse', key: 'config' } as const,
  {
    setting: null,
    env: { force5m: false, ttl: null, enable1h: false },
    account: 'unknown',
    pin: null,
    keepAliveHint: false,
  } as Config,
  { shape: 'config-2' },
)
const toastOn = atom({ plugin: 'cachepulse', key: 'toastOn' } as const, true as boolean, { shape: 'toastOn-1' })
const warnedFor = atom({ plugin: 'cachepulse', key: 'warnedFor' } as const, null as { at: number; lead: number } | null, {
  shape: 'warnedFor-2',
})

/** Timer step: toasts per idle gap before the TTL runs out. */
export async function checkExpiry($: EngineInterface): Promise<void> {
  const list = await read($, samples)
  const due = expiryToast(
    list,
    await $.clock.now(),
    resolveTtl(await read($, config), list),
    await read($, toastOn),
    await read($, warnedFor),
  )
  if (due === null) return
  await update($, warnedFor, () => ({ at: due.anchor, lead: due.lead }))
  $.ui.toast(due.text, { timeoutMs: TOAST_MS })
}
