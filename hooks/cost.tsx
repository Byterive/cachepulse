import type { EngineInterface } from 'claude-code'

import type { Account, Config, Sample, Ttl } from '../types'
import { PRICES_AS_OF, cacheSaved, formatUsd } from './prices'
import { labelChip, labelledLine, splitLabel } from './chips'
import { theme } from './style'
import { resolveTtl } from './ttl'

type Parts = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text' | 'Button'>

/** Store key: true when the user switched the cost estimate on (off by default). */
export const COST_KEY = 'costOn'

/**
 * The cost line: Claude Code's own session total, then what the
 * cache saved at list price from CachePulse's table. Always labelled an estimate.
 */
export function costLine(hostUsd: number | null, samples: readonly Sample[], ttl: Ttl | null, _account: Account): string {
  const parts: string[] = []
  parts.push(hostUsd === null ? 'session total not given by Claude Code' : `${formatUsd(hostUsd)} this session (Claude Code)`)
  const saved = cacheSaved(samples, ttl)
  const verb = saved.usd < 0 ? `cache cost ≈ ${formatUsd(-saved.usd)} more` : `cache saved ≈ ${formatUsd(saved.usd)}`
  parts.push(`${verb} over ${saved.n} request(s) since CachePulse loaded (list prices as of ${PRICES_AS_OF}, CachePulse table)`)
  const missing = saved.unpriced.length === 0 ? '' : ` No price for ${saved.unpriced.join(', ')}; left out.`
  return `Cost (estimate): ${parts.join(' · ')}.${missing} List-price estimate only; it is not your bill.`
}

/** The cost line in the pane: its label "Cost (estimate):" as a chip. */
function costPaneLine({ Box, Text }: Pick<Parts, 'Box' | 'Text'>, line: string) {
  const parts = splitLabel(line)
  return parts === null ? <Text color={theme.dim}>{line}</Text> : labelledLine({ Box, Text }, parts.label, parts.rest, theme.dim, 'cost-line')
}

/** For `/cachepulse` text when the estimate is switched on: a leading newline and the line. */
export function costText(hostUsd: number | null, samples: readonly Sample[], config: Config): string {
  return `\n${costLine(hostUsd, samples, resolveTtl(config, samples).ttl, config.account)}`
}

/** Pane row: the switch, and the line when on. register.tsx reads the switch and the total, and flips it. */
export function costRow(
  { Box, Text, Button }: Parts,
  on: boolean,
  hostUsd: number | null,
  samples: readonly Sample[],
  ttl: Ttl | null,
  account: Account,
  flip: () => Promise<void>,
) {
  return (
    <Box flexDirection="column">
      <Box key="cost-row" gap={1}>
        {labelChip({ Text }, 'Cost estimate:')}
        <Button key="cost-switch" label={on ? '● On' : '○ Off'} onPress={flip} />
      </Box>
      {on ? costPaneLine({ Box, Text }, costLine(hostUsd, samples, ttl, account)) : null}
    </Box>
  )
}
