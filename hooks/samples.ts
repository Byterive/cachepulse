import type { Sample } from '../types'

/** Most samples kept (owner answer 2, 2026-11-11); the oldest are dropped. */
export const CAP = 200

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  model: string
}

type Step = { turnId: string; index: number; agentId?: string }

/** read / (read + written + uncached); null when the sum is 0 (no data, not 0%). */
export function hitShare(
  read: number,
  written: number,
  uncached: number,
): number | null {
  const total = read + written + uncached
  return total === 0 ? null : read / total
}

/** One sample from a turn.step stop chunk's usage; null when the host gave none. */
export function makeSample(step: Step, usage: Usage | null, at: number): Sample | null {
  if (usage === null) return null
  const read = usage.cache_read_input_tokens
  const written = usage.cache_creation_input_tokens
  const uncached = usage.input_tokens
  const share = hitShare(read, written, uncached)
  const sample: Sample = {
    turnId: step.turnId,
    index: step.index,
    model: usage.model,
    at,
    read,
    written,
    uncached,
    output: usage.output_tokens,
    hitShare: share,
    state: share === null ? 'nodata' : 'data',
  }
  if (step.agentId !== undefined) sample.agentId = step.agentId
  return sample
}

/** Appends and keeps the newest CAP samples. */
export function addSample(list: readonly Sample[], sample: Sample): Sample[] {
  return [...list, sample].slice(-CAP)
}
