import type { EngineInterface, Register } from 'claude-code'

import { REPORTED_KEY } from './explainpane'
import { formatTokens } from './meter'
import { labelChip } from './chips'
import { shortModel } from './timeline'

export { checkExpiry } from './toast'
export { costRow, costText } from './cost'

type Ctx = EngineInterface
type On = Parameters<Register>[0]
type Parts = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text' | 'Button'>

/** Store key: set to true when the user turned the switch-warning toast off. */
const OFF_KEY = 'switchToastOff'
/** Shorter than the expiry toast. */
export const SWITCH_TOAST_MS = 15_000

type Switch = {
  from_model: string
  to_model: string
  context_tokens: number
  prompt_cache_warm: boolean
  cache_ttl: '5m' | '1h'
}

/**
 * The warning for a model switch, or null: only when the host says the
 * cache is likely warm; host fields only, no dollar figure, any source.
 */
export function switchToast(e: Switch): string | null {
  if (!e.prompt_cache_warm || e.from_model === e.to_model) return null
  return (
    `Switching ${shortModel(e.from_model)} to ${shortModel(e.to_model)} rewrites the cache ` +
    `(~${formatTokens(e.context_tokens)} tokens). The cache was warm (${e.cache_ttl} TTL, reported by Claude Code).`
  )
}

/** Warns before the switch; never blocks (D8 a): the event is passed on unchanged. */
export function registerModelSwitch(on: On): void {
  on('classic.PreModelSwitch', async ($, e, next) => {
    await keepReported($, e.cache_ttl)
    const text = switchToast(e)
    if (text !== null && (await $.store.get(OFF_KEY).catch(() => undefined)) !== true) $.ui.toast(text, { timeoutMs: SWITCH_TOAST_MS })

    return next(e)
  })
  // After any switch, auto and resume included: keep the TTL only, no toast.
  on('classic.PostModelSwitch', async ($, e, next) => {
    await keepReported($, e.cache_ttl)

    return next(e)
  })
}

/** Keeps the TTL Claude Code reported, with when: observed, as of that moment. */
async function keepReported($: Ctx, ttl: '5m' | '1h'): Promise<void> {
  // A failure here must never stop the warning or the switch.
  try {
    await $.store.set(REPORTED_KEY, { ttl, at: await $.clock.now() })
    $.ui.invalidate('ui.render')
  } catch {
    // nothing kept
  }
}

/** Pane row with this toast's own on/off button. */
export async function modelSwitchRow($: Ctx, { Box, Text, Button }: Parts, narrow = false) {
  const off = (await $.store.get(OFF_KEY).catch(() => undefined)) === true
  const flip = async () => {
    if (off) await $.store.delete(OFF_KEY)
    else await $.store.set(OFF_KEY, true)
    $.ui.invalidate('ui.render')
  }
  return (
    <Box key="switch-row" gap={1}>
      {labelChip({ Text }, narrow ? 'Switch warning:' : 'Model-switch warning:')}
      <Button key="switch-toast" label={off ? '○ Off' : '● On'} onPress={flip} />
    </Box>
  )
}
