import type { Config, Sample } from '../types'
import { resolveTtl } from './ttl'
import { expiryToast } from './warn'

export { TOAST_MS } from './warn'

/** What register.tsx keeps in its warnedFor atom: the gap and lead already toasted. */
export type Warned = { at: number; lead: number } | null

/**
 * Timer step: the toast due for this idle gap before the TTL runs out, or null.
 * register.tsx reads the values, shows the toast and records it.
 */
export function dueToast(list: readonly Sample[], now: number, config: Config, on: boolean, warned: Warned) {
  return expiryToast(list, now, resolveTtl(config, list), on, warned)
}
