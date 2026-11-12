// State contract for CachePulse (schema 0.1).
// In-memory only; the host keeps it for the session. Cap: 200 samples.

export type Label = 'observed' | 'derived' | 'inferred' | 'unknown'

export type Sample = {
  turnId: string
  index: number
  /** Absent for the main thread. */
  agentId?: string
  model: string
  /** `$.clock.now()` at stop-chunk arrival, ms. */
  at: number
  read: number
  written: number
  uncached: number
  output: number
  /** read / (read + written + uncached); null when the denominator is 0. */
  hitShare: number | null
  state: 'data' | 'nodata'
}

/** Something that changes what the next request can read from cache. */
export type Marker = {
  kind: 'compact' | 'clear' | 'model' | 'session'
  /** `$.clock.now()` when it was seen, ms. */
  at: number
  /** compact: the trigger (manual, auto, plugin); model: "from -> to". */
  detail?: string
}

export type Ttl = '5m' | '1h'

/** Guess from the plan windows of the last response (see hooks/ttl.ts). */
export type Account = 'subscription' | 'credits' | 'other' | 'unknown'

export type Config = {
  /** promptCacheTtl from Claude Code's settings; null when unset or not 5m/1h. */
  setting: Ttl | null
  /** Variables the host documents for the TTL, read at session start. */
  env: { force5m: boolean; ttl: Ttl | null; enable1h: boolean }
  account: Account
  /** The user's display-only pick in the details pane; null = automatic. */
  pin: Ttl | null
  /** D6: release is 2.1.300 or later, so a keepalive may hold the cache. */
  keepAliveHint: boolean
}

declare module 'claude-code' {
  interface PluginState {
    cachepulse: {
      samples: Shaped<Sample[]>
      config: Shaped<Config>
      markers: Shaped<Marker[]>
      /** Model of the last main-thread request; kept across /clear, null when unknown. */
      lastModel: Shaped<string | null>
      /** Inputs loaded into this state; false in a fresh one after VS Code /clear. */
      loaded: Shaped<boolean>
      /** Band More summary open. */
      bandMore: Shaped<boolean>
      /** TTL expiry toast switch; true unless the user turned it off. */
      toastOn: Shaped<boolean>
      /** The request (`at`) the toast warned about and the tightest lead shown. */
      warnedFor: Shaped<{ at: number; lead: number } | null>
    }
  }
}
