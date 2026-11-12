import type { EngineInterface } from 'claude-code'

import type { Account, Config, Sample, Ttl } from '../types'
import { PRICES_AS_OF, cacheSaved, formatUsd } from './prices'
import { labelChip, labelledLine, splitLabel } from './chips'
import { theme } from './style'
import { resolveTtl } from './ttl'

type Ctx = EngineInterface
type Parts = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text' | 'Button'>

/** Store key: true when the user switched the cost estimate on (off by default). */
const ON_KEY = 'costOn'

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

async function isOn($: Ctx): Promise<boolean> {
  return (await $.store.get(ON_KEY).catch(() => undefined)) === true
}

async function hostUsd($: Ctx): Promise<number | null> {
  const usd = (await $.session.usage().catch(() => undefined))?.cost?.usd
  return typeof usd === 'number' ? usd : null
}

/** The cost line in the pane: its label "Cost (estimate):" as a chip. */
function costPaneLine({ Box, Text }: Pick<Parts, 'Box' | 'Text'>, line: string) {
  const parts = splitLabel(line)
  return parts === null ? <Text color={theme.dim}>{line}</Text> : labelledLine({ Box, Text }, parts.label, parts.rest, theme.dim, 'cost-line')
}

/** For `/cachepulse` text: a leading newline and the line when switched on, else nothing. */
export async function costText($: Ctx, samples: readonly Sample[], config: Config): Promise<string> {
  if (!(await isOn($))) return ''
  return `\n${costLine(await hostUsd($), samples, resolveTtl(config, samples).ttl, config.account)}`
}

/** Pane row: the switch, and the line when on. */
export async function costRow($: Ctx, { Box, Text, Button }: Parts, samples: readonly Sample[], ttl: Ttl | null, account: Account) {
  const on = await isOn($)
  const flip = async () => {
    if (on) await $.store.delete(ON_KEY)
    else await $.store.set(ON_KEY, true)
    $.ui.invalidate('ui.render')
  }
  return (
    <Box flexDirection="column">
      <Box key="cost-row" gap={1}>
        {labelChip({ Text }, 'Cost estimate:')}
        <Button key="cost-switch" label={on ? '● On' : '○ Off'} onPress={flip} />
      </Box>
      {on ? costPaneLine({ Box, Text }, costLine(await hostUsd($), samples, ttl, account)) : null}
    </Box>
  )
}
