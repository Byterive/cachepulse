import type { EngineInterface } from 'claude-code'

import { formatTokens } from './meter'
import { labelChip } from './chips'
import { shortModel } from './timeline'

type Parts = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text' | 'Button'>

/** Store key: set to true when the user turned the switch-warning toast off. */
export const SWITCH_OFF_KEY = 'switchToastOff'
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
 * register.tsx hooks the switch events and shows it.
 */
export function switchToast(e: Switch): string | null {
  if (!e.prompt_cache_warm || e.from_model === e.to_model) return null
  return (
    `Switching ${shortModel(e.from_model)} to ${shortModel(e.to_model)} rewrites the cache ` +
    `(~${formatTokens(e.context_tokens)} tokens). The cache was warm (${e.cache_ttl} TTL, reported by Claude Code).`
  )
}

/** Pane row with this toast's own on/off button; register.tsx reads the switch and flips it. */
export function modelSwitchRow({ Box, Text, Button }: Parts, off: boolean, flip: () => Promise<void>, narrow = false) {
  return (
    <Box key="switch-row" gap={1}>
      {labelChip({ Text }, narrow ? 'Switch warning:' : 'Model-switch warning:')}
      <Button key="switch-toast" label={off ? '○ Off' : '● On'} onPress={flip} />
    </Box>
  )
}
