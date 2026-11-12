import type { EngineInterface } from 'claude-code'

import { theme } from './style'

type Ui = ReturnType<EngineInterface['ui']['resolve']>

/**
 * A dotted divider line: a run of dots longer than any room, cut off by the
 * box, with no ellipsis marker at its end. The column count the host reports is smaller than what VS Code draws
 * (seen live 2026-11-12: the line stopped short), so the width is not sized from it.
 */
export function dividerLine({ Box, Text }: Pick<Ui, 'Box' | 'Text'>, _columns: number, key: string) {
  return (
    <Box key={key} height={1} width="100%" overflow="hidden">
      <Text color={theme.divider}>{theme.glyph.repeat(DOTS)}</Text>
    </Box>
  )
}

/**
 * A line led by a label chip: the chip, then the rest of the line beside it, wrapping
 * under itself rather than under the chip.
 */
export function labelledLine({ Box, Text }: Pick<Ui, 'Box' | 'Text'>, label: string, rest: string, color: string, key: string) {
  return (
    <Box key={key} flexDirection="row" columnGap={1} alignItems="flex-start">
      <Box flexShrink={0}>{labelChip({ Text }, label)}</Box>
      <Box flexShrink={1} minWidth={0}>
        <Text color={color}>{rest}</Text>
      </Box>
    </Box>
  )
}

/** Splits "Label: rest" at the first colon-space; null when the line has no such label. */
export function splitLabel(line: string): { label: string; rest: string } | null {
  const at = line.indexOf(': ')
  return at < 1 ? null : { label: line.slice(0, at + 1), rest: line.slice(at + 2) }
}

/**
 * A label as a chip: bold text in the theme's label colour on its own background,
 * one non-breaking space either side (HTML collapses plain spaces).
 */
export function labelChip({ Text }: Pick<Ui, 'Text'>, text: string, key?: string) {
  return (
    <Text key={key} bold color={theme.labelText} backgroundColor={theme.labelBg}>
      {` ${text} `}
    </Text>
  )
}

/** Longer than any pane or band is wide. */
export const DOTS = 300
