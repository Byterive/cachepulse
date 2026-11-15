import type { EngineInterface } from 'claude-code'

import type { Config, Sample } from '../types'
import { labelledLine, splitLabel } from './chips'
import { explainText, reportedLine, rowText, sourceRows, subagentLine } from './explain'
import type { Reported } from './explain'
import { COOL, WARN, theme } from './style'
import { asTtl, isOn } from './ttl'

type Parts = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text'>

/** Short form of the "what is real" note for the pane; `/cachepulse config` keeps the long notes. */
export const PANE_NOTE = 'Real: settings and variables. Inferred: timing, account default. Display-only: your pick.'

/** Store key for the TTL Claude Code reported at the last model switch. */
export const REPORTED_KEY = 'hostTtl'

/** The stored host report (register.tsx reads the store), or null when none or malformed. */
export function asReported(stored: unknown): Reported | null {
  const v = stored as Partial<Reported> | undefined | null
  if (v === undefined || v === null || (v.ttl !== '5m' && v.ttl !== '1h') || typeof v.at !== 'number') return null
  return { ttl: v.ttl, at: v.at }
}

/** The subagent TTL line from the raw values register.tsx read; read when shown, so no state shape changes. */
export function asSubagentLine(force5m: string | undefined, env: unknown, setting: unknown, enable1h: string | undefined): string {
  return subagentLine({ force5m: isOn(force5m), env: asTtl(env), setting: asTtl(setting), enable1h: isOn(enable1h) })
}

/** `/cachepulse config` text with the host report and the subagent TTL. */
export function explainConfig(config: Config, samples: readonly Sample[], reported: Reported | null, sub: string): string {
  return explainText(config, samples, reported, sub)
}

/** Pane section for the settings explainer: every TTL source, winner marked, the host report, then the notes. */
export function explainPane({ Box, Text }: Parts, config: Config, samples: readonly Sample[], reported: Reported | null, sub: string) {
  const line = reportedLine(config, samples, reported)
  const rows = sourceRows(config, samples)
  const shown = rows.filter(r => r.win || r.value !== null)
  const others = rows.length - shown.length
  const chipped = (line: string, key: string) => {
    const parts = splitLabel(line)
    return parts === null ? <Text color={theme.dim}>{line}</Text> : labelledLine({ Box, Text }, parts.label, parts.rest, theme.dim, key)
  }
  return (
    <Box flexDirection="column">
      <Text bold color={COOL}>Where the TTL comes from</Text>
      {/* The winner (main line, white bold), the sources that are set, and one line for the rest. */}
      {shown.map(r =>
        r.win ? (
          <Text key={r.name} bold color={theme.text}>{rowText(r)}</Text>
        ) : (
          <Text key={r.name} color={theme.dim}>{rowText(r)}</Text>
        ),
      )}
      {others === 0 ? null : labelledLine({ Box, Text }, 'Others:', `not set (${others})`, theme.dim, 'others')}
      {line === null ? null : <Text color={line.differs ? WARN : theme.dim}>{line.text}</Text>}
      {chipped(sub, 'sub-ttl')}
      <Text color={theme.dim}>{PANE_NOTE}</Text>
    </Box>
  )
}
