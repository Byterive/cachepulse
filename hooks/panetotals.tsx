import type { EngineInterface } from 'claude-code'

import type { Sample } from '../types'
import { formatTokens } from './meter'
import { labelChip } from './chips'
import { COOL, GOOD, WARN, theme } from './style'
import { modelGroups, percent, splitTotals, totalShare } from './timeline'
import type { Totals } from './timeline'

type Parts = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text'>

/** Pane totals, main conversation and subagents on their own lines (one combined subagent line). */
export function totalsPane({ Box, Text }: Parts, samples: readonly Sample[]) {
  const split = splitTotals(samples)
  const groups = modelGroups(samples)
  // The Main line is the main line under the heading: white and bold. Others are dark grey, numbers keep their colour.
  const row = (label: string, t: Totals & { n: number }, main = false) =>
    t.n === 0 ? (
      <Box key={`tot-${label}`} flexDirection="row" columnGap={1}>
        {labelChip({ Text }, `${label}:`)}
        <Text color={theme.dim}>none seen</Text>
      </Box>
    ) : (
      <Text key={`tot-${label}`} color={main ? theme.text : theme.dim}>
        <Text bold={main} color={main ? theme.text : theme.dim}>{label}</Text>{` (${t.n})  `}
        <Text bold={main} color={GOOD}>{formatTokens(t.read)}</Text> read{'  '}
        <Text bold={main} color={WARN}>{formatTokens(t.written)}</Text> wrote{'  '}
        <Text bold={main} color={COOL}>{formatTokens(t.uncached)}</Text> new{'  '}
        <Text bold={main}>{formatTokens(t.output)}</Text> out{'  '}
        <Text bold={main}>{percent(totalShare(t))}</Text>
      </Text>
    )
  return (
    <Box flexDirection="column">
      {row('Main', split.main, true)}
      {row('Subagents', split.sub)}
      {groups.length === 0 ? null : <Text bold color={COOL}>By model</Text>}
      {groups.map(g => row(g.label, g))}
    </Box>
  )
}
