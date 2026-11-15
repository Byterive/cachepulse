import type { EngineInterface, RenderInput } from 'claude-code'

import { formatDuration, formatTokens, lastCacheActive, meter } from './meter'
import { dividerLine } from './chips'
import { cacheColor, COOL, GOOD, MUTED, WARN, theme } from './style'
import { formatClock, percent } from './timeline'
import { describeTtl, resolveTtl } from './ttl'
import type { Config, Sample } from '../types'

type Parts = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text' | 'Button'>
type Ev = RenderInput<'AbovePrompt'>

/**
 * The band before the first request: after /clear (or in a new session) it says so.
 * register.tsx hooks `ui.render` on AbovePrompt and draws this or bandView.
 */
export function bandEmpty({ Box, Text }: Pick<Parts, 'Box' | 'Text'>, kind: 'clear' | 'session') {
  return (
    <Box key="band" flexDirection="row" borderStyle={theme.borderStyle} borderColor={theme.outline} backgroundColor={theme.bandBg} paddingX={1} columnGap={1}>
      <Text bold color={COOL}>CachePulse</Text>
      <Text color={MUTED} wrap="truncate-end">{kind === 'clear' ? 'Cleared' : 'New session'} · no requests yet</Text>
    </Box>
  )
}

/**
 * Two-row strip above the prompt (terminal, Desktop and VS Code), from the values
 * register.tsx read: main-conversation samples (at least one), config, now, whether
 * the pane is open and whether the More summary is open; the buttons call back.
 */
export function bandView(
  { Box, Button, Text }: Parts,
  e: Ev,
  list: readonly Sample[],
  cfg: Config,
  now: number,
  isOpen: boolean,
  open: boolean,
  onToggle: () => Promise<unknown>,
  onMore: () => Promise<void>,
) {
  const last = list[list.length - 1] as Sample
  const resolved = resolveTtl(cfg, list)
  const m = meter(list, now, resolved, cfg.keepAliveHint)

  const share = last.hitShare
  const ttlNote = describeTtl(resolved)
  const approx =
    m.remainingMs === null
      ? ''
      : ` · ~${formatDuration(m.remainingMs)} left${resolved.kind === 'inferred' ? ' (inferred)' : ''}`
  const states: Record<typeof m.state, [string, string]> = {
    warm: ['Warm', GOOD],
    expiring: ['Expiring', WARN],
    expired: ['Expired', WARN],
    keepalive: ['May have been refreshed', MUTED],
    unknown: ['State unknown', MUTED],
  }
  const [stateText, stateColor] = states[m.state]
  const idle =
    m.idleMs === null || m.state === 'warm' || m.state === 'expiring'
      ? ''
      : ` · last cache use ${formatDuration(m.idleMs)} ago`
  const noCacheUse = lastCacheActive(list) === null ? ' · no cache use yet' : ''

  // Cells for the band; a docked pane or a narrow panel gives fewer. One layout
  // for every width (two rows), with only labels shortened, so nothing wraps
  // into a tall block. The bar takes the free width (at least barCells),
  // which puts the button at the right edge. It is made of filled Boxes, not
  // block characters, so Desktop and VS Code draw no seams between cells.
  const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 100
  // VS Code reports far fewer columns than it draws (70 full screen, 63 half), so long labels start at 60.
  const wide = columns >= 60
  const barCells = columns >= 80 ? 20 : wide ? 10 : 8
  const nb = ' ' // HTML collapses plain spaces
  const stateLine = wide
    ? `${stateText}${approx}${idle}`
    : `${stateText}${approx === '' ? '' : ` ${approx.slice(3)}`}`
  const toggle = (
    <Button
      key="details"
      label={isOpen ? (wide ? 'Hide details ‹' : 'Hide ‹') : wide ? 'Open details ›' : 'Details ›'}
      onPress={onToggle}
    />
  )
  // Whole percent: the surfaces refuse a fractional percentage width.
  // Length is the read share; colour is the TTL left.
  const barColor = cacheColor(m.state, m.remainingMs, resolved.ttl)
  const fill = share === null ? 0 : Math.round(share * 100)
  const bar = (
    <Box key="bar" flexDirection="row" height={1} flexGrow={1} flexShrink={1} minWidth={barCells}>
      {fill > 0 ? (
        <Box key="bar-fill" width={`${fill}%`} height={1} flexShrink={0} backgroundColor={barColor} />
      ) : null}
      {fill < 100 ? <Box key="bar-rest" height={1} flexGrow={1} backgroundColor={theme.track} /> : null}
    </Box>
  )
  const lastLabel = last.agentId === undefined ? 'Last' : 'Last (subagent)'
  // More summary: the last requests, newest first, as many as the band's rows allow.
  const room = Math.max(0, Math.min(3, (e.props.maxRows ?? 6) - 4))
  const summary = list.slice(-room).reverse()
  const moreButton = room === 0 ? null : (
    <Button
      key="more"
      label={open ? 'Less ▴' : 'More ▾'}
      onPress={onMore}
    />
  )
  const ttlLine = wide ? `${ttlNote}${noCacheUse}` : ttlNote

  return (
    <Box key="band" flexDirection="column" borderStyle={theme.borderStyle} borderColor={theme.outline} backgroundColor={theme.bandBg} paddingX={1}>
      {/* Never wraps: the bar shrinks to barCells, then the state text truncates. */}
      <Box key="top" flexDirection="row" flexWrap="nowrap" columnGap={1}>
        <Box key="title" flexShrink={0}>
          <Text bold color={COOL} backgroundColor={(theme.chip ?? undefined)} wrap="truncate-end">
            {`${nb}CachePulse${nb}`}
          </Text>
        </Box>
        {share === null ? (
          <Text color={MUTED}>No data</Text>
        ) : (
          <Box key="pct" flexShrink={0}>
            <Text bold color={GOOD} wrap="truncate-end">
              {`${(share * 100).toFixed(1)}%`}
            </Text>
          </Box>
        )}
        {share !== null && wide ? (
          <Box key="cr" flexShrink={0}>
            <Text wrap="truncate-end">{`cache${nb}read`}</Text>
          </Box>
        ) : null}
        {share === null ? <Box flexGrow={1} /> : bar}
        <Box key="actions" flexShrink={1} minWidth={0} columnGap={1} backgroundColor={(theme.action ?? undefined)} paddingX={1}>
          <Box key="state" flexShrink={1} minWidth={0}>
            <Text color={stateColor} backgroundColor={(theme.chip ?? undefined)} wrap="truncate-end">
              {`${nb}${stateLine}${nb}`}
            </Text>
          </Box>
          <Box key="toggle" flexShrink={0}>{toggle}</Box>
        </Box>
      </Box>
      {theme.bandDivider ? dividerLine({ Box, Text }, columns, 'band-divider') : null}
      <Box key="row2" flexDirection="row" flexWrap="nowrap" columnGap={1} backgroundColor={theme.lastBg ?? undefined}>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">
            <Text color={MUTED}>{`${lastLabel}${nb}`}</Text>
            <Text bold color={GOOD}>{formatTokens(last.read)}</Text>
            <Text>{`${nb}read${nb}${nb}`}</Text>
            <Text bold color={WARN}>{formatTokens(last.written)}</Text>
            <Text>{`${nb}wrote${nb}${nb}`}</Text>
            <Text bold color={COOL}>{formatTokens(last.uncached)}</Text>
            <Text>{`${nb}new${nb}${nb}`}</Text>
            <Text color={MUTED}>{ttlLine}</Text>
          </Text>
        </Box>
        {moreButton}
      </Box>
      {open
        ? summary.map((sample, i) => (
            <Text key={`sum-${i}`} wrap="truncate-end">
              <Text color={MUTED}>{`${formatClock(sample.at)}${nb}${nb}`}</Text>
              <Text color={GOOD}>{formatTokens(sample.read)}</Text>
              <Text>{`${nb}read${nb}${nb}`}</Text>
              <Text color={WARN}>{formatTokens(sample.written)}</Text>
              <Text>{`${nb}wrote${nb}${nb}`}</Text>
              <Text>{percent(sample.hitShare)}</Text>
              <Text color={MUTED}>{sample.agentId === undefined ? '' : `${nb}sub`}</Text>
            </Text>
          ))
        : null}
    </Box>
  )
}
