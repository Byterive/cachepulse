import type { EngineInterface, RenderInput, RenderNode } from 'claude-code'

import type { Marker, Sample, Ttl } from '../types'
import { dividerLine, labelChip } from './chips'
import { meter } from './meter'
import { COOL, NARROW_COLS, WARN, theme } from './style'
import { describeMarker, formatClock } from './timeline'
import { describeTtl } from './ttl'
import type { TtlResult } from './ttl'

type Parts = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text' | 'Button'>

/** Rows register.tsx builds from what it read, placed in this block's order. */
type Rows = { theme: RenderNode; modelSwitch: RenderNode; cost: RenderNode; plan: RenderNode | null; explain: RenderNode }

/**
 * The pane's frame: with no requests, a note and the markers above the TTL block;
 * else the TTL block, then the sections below it.
 */
export function paneFrame(
  { Box, Text }: Pick<Parts, 'Box' | 'Text'>,
  marks: readonly Marker[],
  ttlBlock: RenderNode,
  sections: RenderNode | null,
) {
  const border = theme.paneBorder === 'none' ? undefined : theme.paneBorder
  if (sections === null) {
    return (
      <Box key="pane-frame" flexDirection="column" borderStyle={border} borderColor={theme.outline} paddingX={1}>
        <Text color={theme.dim}>No requests recorded yet. Send a message first.</Text>
        {marks.map(m => (
          <Text color={WARN}>{`${formatClock(m.at)}  ${describeMarker(m)}`}</Text>
        ))}
        {ttlBlock}
      </Box>
    )
  }

  return (
    <Box key="pane-frame" flexDirection="column" borderStyle={border} borderColor={theme.outline} paddingX={1}>
      {ttlBlock}
      {sections}
    </Box>
  )
}

/**
 * The pane's top block: the TTL, its Show-as buttons, then the theme, toast,
 * model-switch and cost rows, plan usage and the TTL explainer. register.tsx
 * reads the values and passes the handlers, which hold `$`.
 */
export function ttlSection(
  { Box, Text, Button }: Parts,
  e: RenderInput<'Pane'>,
  list: readonly Sample[],
  now: number,
  resolved: TtlResult,
  keepAliveHint: boolean,
  pin: Ttl | null,
  toastIsOn: boolean,
  pick: (value: Ttl | null) => () => Promise<void>,
  flipToast: () => Promise<void>,
  rows: Rows,
) {
  const choice = (label: string, value: Ttl | null) => (
    <Button
      key={`ttl-${label}`}
      label={`${pin === value ? '●' : '○'} ${label}`}
      onPress={pick(value)}
    />
  )

  return (
    <Box flexDirection="column">
      <Text bold color={COOL}>Cache lifetime (TTL)</Text>
      <Text bold color={theme.text}>{describeTtl(resolved)}</Text>
      {meter(list, now, resolved, keepAliveHint).state === 'keepalive' ? (
        <Text color={theme.dim}>Claude Code (2.1.300 or later) can refresh the cache while idle, so it may not have expired.</Text>
      ) : null}
      {/* A blank line between each line of buttons. */}
      <Box key="buttons" flexDirection="column" rowGap={1}>
        <Box key="ttl-show" columnGap={1} rowGap={1} flexWrap={e.props.bodyColumns < NARROW_COLS ? 'wrap' : 'nowrap'}>
          {labelChip({ Text }, 'Show TTL as:')}
          {choice('Auto', null)}
          {choice('5m', '5m')}
          {choice('1h', '1h')}
        </Box>
        {rows.theme}
        <Box key="toast-group" flexDirection="column">
          <Box key="toast-row" gap={1}>
            {labelChip({ Text }, 'Expiry toast:')}
            <Button key="toast-switch" label={toastIsOn ? '● On' : '○ Off'} onPress={flipToast} />
          </Box>
          <Text color={theme.dim}>1 min before expiry (1h cache: also 10 min)</Text>
        </Box>
        {rows.modelSwitch}
        {rows.cost}
      </Box>
      {rows.plan}
      {dividerLine({ Box, Text }, e.props.bodyColumns, 'd-where')}
      {rows.explain}
    </Box>
  )
}
