import type { EngineInterface, RenderInput } from 'claude-code'

import type { Marker, Sample, Ttl } from '../types'
import { dividerLine, labelChip, labelledLine, splitLabel } from './chips'
import { savingsText, textTrend, trendSvg } from './extras'
import { formatTokens } from './meter'
import { mergeItems } from './markers'
import { isPlanWindow } from './ttl'
import { COOL, GOOD, usageColor, WARN, theme } from './style'
import { describeMarker, formatClock, percent, shortModel } from './timeline'
import { totalsPane } from './panetotals'
import { whyLines } from './why'

/** The pane's render event. */
type Ev = RenderInput<'Pane'>

/**
 * Plan usage section (right after Cost estimate), or null when the host reports
 * no plan windows. Everything but the bars and their colours is the dark grey style.
 */
export async function planUsage($: EngineInterface, e: Ev) {
  const { Box, Text } = $.ui.resolve(e)
  const limits = ((await $.session.usage().catch(() => undefined))?.rateLimits ?? []).filter(isPlanWindow)
  if (limits.length === 0) return null
  const usageRow = (w: { kind: string; percentUsed: number; resetsAt?: string }) => {
    const pct = Math.min(100, Math.max(0, Math.round(w.percentUsed)))
    const resets = w.resetsAt === undefined ? '' : ` · resets ${formatClock(Date.parse(w.resetsAt))}`
    const color = usageColor(w.kind, w.percentUsed)
    // Bordered, own colour; shorter in a narrow pane so the figure stays on the line.
    const barW = e.props.bodyColumns >= 40 ? 20 : 8
    return (
      <Box flexDirection="row" columnGap={1} alignItems="center">
        <Box width={9} flexShrink={0}>
          {labelChip({ Text }, w.kind === 'five_hour' ? '5-hour' : '7-day')}
        </Box>
        <Box key={`use-${w.kind}`} flexDirection="row" width={barW + 2} flexShrink={0} borderStyle="single" borderColor={color}>
          {pct > 0 ? <Box width={`${pct}%`} height={1} backgroundColor={color} /> : null}
          {pct < 100 ? <Box flexGrow={1} height={1} backgroundColor={theme.track} /> : null}
        </Box>
        <Text color={theme.dim}>{`${w.percentUsed}%${resets}`}</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      {dividerLine({ Box, Text }, e.props.bodyColumns, 'd-usage')}
      <Text bold color={COOL}>Plan usage (observed)</Text>
      {limits.map(usageRow)}
    </Box>
  )
}

/**
 * Everything in the pane below the TTL and plan-usage blocks (moved out of register.tsx):
 * totals, latest miss, trend and timeline, each after a dotted divider.
 */
export async function paneSections(
  $: EngineInterface,
  e: Ev,
  list: readonly Sample[],
  marks: readonly Marker[],
  ttl: Ttl | null,
) {
  const { Box, Text } = $.ui.resolve(e)
  const room = Math.max(1, (e.viewport?.rows ?? 24) - 8)
  const rows = mergeItems(list, marks).slice(0, room)
  // Narrow panes drop Model and Who below 76 cells, and Share below 40.
  const wide = e.props.bodyColumns >= 76
  const showShare = e.props.bodyColumns >= 40
  const cell = (width: number, text: string, color?: string) => (
    <Box width={width}>
      <Text color={color}>{text}</Text>
    </Box>
  )
  // Trend: Svg on Desktop and VS Code, block characters in the terminal.
  const svg = trendSvg(list)
  let graph = null
  if (svg !== null && e.surface !== 'terminal') {
    const { Svg } = $.ui.resolve(e)
    graph = <Svg source={svg} alt="Read share and context size over the last requests" />
  } else if (svg !== null) {
    const tt = textTrend(list)
    graph = <Text color={theme.dim}>{`Share trend (80-100%) ${tt.share}   Context ${tt.context}`}</Text>
  }
  const hint = savingsText(list)
  // Latest miss card (p3-s4): heading, the first line white and bold, the cause amber, the rest dark grey.
  const [whyHead, firstLine, ...whyRest] = whyLines(list, marks, ttl)
  // "Cause:" and "Based on:" lead with a label chip; the legend line stays plain.
  const led = (line: string, color: string, key: string) => {
    const parts = line.startsWith('Cause:') || line.startsWith('Based on:') ? splitLabel(line) : null
    return parts === null ? <Text color={color}>{line}</Text> : labelledLine({ Box, Text }, parts.label, parts.rest, color, key)
  }
  const whyCard = (
    <Box flexDirection="column">
      <Text bold color={COOL}>{whyHead}</Text>
      {firstLine === undefined ? null : firstLine.startsWith('Cause:') ? (
        led(firstLine, WARN, 'why-0')
      ) : (
        <Text bold color={theme.text}>{firstLine}</Text>
      )}
      {whyRest.map((line, i) => led(line, line.startsWith('Cause:') ? WARN : theme.dim, `why-${i + 1}`))}
    </Box>
  )
  const div = (k: string) => dividerLine({ Box, Text }, e.props.bodyColumns, k)

  return (
    <Box flexDirection="column">
      {div('d-totals')}
      <Text bold color={COOL}>{`Last ${list.length} request(s)`}</Text>
      {totalsPane({ Box, Text }, list)}
      <Text color={theme.dim}>read = from cache · wrote = written to cache · new = not cached · out = output · Read % = share of input read from cache</Text>
      {div('d-miss')}
      {whyCard}
      {hint === null ? null : <Text color={WARN}>{hint}</Text>}
      {div('d-trend')}
      {graph === null ? null : <Text bold color={COOL}>Trend: read share 80-100% (solid line), context size (dashed line)</Text>}
      {graph}
      <Box gap={1}>
        {cell(9, 'Time', theme.dim)}
        {wide && cell(20, 'Model', theme.dim)}
        {wide && cell(6, 'Who', theme.dim)}
        {cell(7, 'Read', theme.dim)}
        {cell(7, 'Wrote', theme.dim)}
        {cell(6, 'New', theme.dim)}
        {showShare && cell(8, 'Read %', theme.dim)}
      </Box>
      {rows.map(item =>
        item.kind === 'marker' ? (
          <Text color={WARN}>{`${formatClock(item.at)}  ${describeMarker(item.marker)}`}</Text>
        ) : (
          <Box gap={1}>
            {cell(9, formatClock(item.at), theme.dim)}
            {wide && cell(20, shortModel(item.sample.model), theme.dim)}
            {wide && cell(6, item.sample.agentId === undefined ? 'main' : 'sub', theme.dim)}
            {cell(7, formatTokens(item.sample.read), GOOD)}
            {cell(7, formatTokens(item.sample.written), WARN)}
            {cell(6, formatTokens(item.sample.uncached), COOL)}
            {showShare && cell(8, percent(item.sample.hitShare), theme.dim)}
          </Box>
        ),
      )}
    </Box>
  )
}
