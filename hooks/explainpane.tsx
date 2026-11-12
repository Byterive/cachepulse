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

/** The stored host report, or null when none or malformed. */
export async function readReported($: EngineInterface): Promise<Reported | null> {
  const v = (await $.store.get(REPORTED_KEY).catch(() => undefined)) as Partial<Reported> | undefined
  if (v === undefined || v === null || (v.ttl !== '5m' && v.ttl !== '1h') || typeof v.at !== 'number') return null
  return { ttl: v.ttl, at: v.at }
}

/** The subagent TTL line from its own variable and setting; read when shown, so no state shape changes. */
export async function readSubagentLine($: EngineInterface): Promise<string> {
  const none = () => undefined
  return subagentLine({
    force5m: isOn(await $.env.get('FORCE_PROMPT_CACHING_5M').catch(none)),
    env: asTtl(await $.env.get('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL').catch(none)),
    setting: asTtl(await $.settings.read({ key: 'subagentPromptCacheTtl' }).catch(none)),
    enable1h: isOn(await $.env.get('ENABLE_PROMPT_CACHING_1H').catch(none)),
  })
}

/** `/cachepulse config` text with the host report and the subagent TTL. */
export async function explainConfig($: EngineInterface, config: Config, samples: readonly Sample[]): Promise<string> {
  return explainText(config, samples, await readReported($), await readSubagentLine($))
}

/** Pane section for the settings explainer: every TTL source, winner marked, the host report, then the notes. */
export async function explainPane($: EngineInterface, { Box, Text }: Parts, config: Config, samples: readonly Sample[]) {
  const line = reportedLine(config, samples, await readReported($))
  const sub = await readSubagentLine($)
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
