import type { EngineInterface } from 'claude-code'

import { labelChip } from './chips'
import { DEFAULT_THEME, PANE, PANE_TITLE, THEMES, applyTheme, theme } from './style'

type Ctx = EngineInterface
type Parts = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text' | 'Button'>

/** Store key: the chosen theme's key. */
export const THEME_KEY = 'theme'

/** Loads the saved choice into `theme`; every render calls this first. A failed read keeps the default. */
export async function loadTheme($: Ctx): Promise<void> {
  applyTheme(await $.store.get(THEME_KEY).catch(() => undefined))
}

/** Saves the choice, and re-opens an open pane so its background follows (the host sets it at open). */
async function choose($: Ctx, key: string): Promise<void> {
  await $.store.set(THEME_KEY, key)
  applyTheme(key)
  if ((await $.ui.panes().catch(() => [])).some(p => p.id === PANE)) {
    await $.ui.close({ id: PANE })
    await $.ui.open({ id: PANE, title: PANE_TITLE, backgroundColor: theme.paneBg })
  }
  $.ui.invalidate('ui.render')
}

/** Pane row: "Theme:" and one button per look, the current one marked. Five buttons never fit one line, so it always wraps. */
export function themeRow($: Ctx, { Box, Text, Button }: Parts) {
  return (
    <Box key="theme-row" columnGap={1} rowGap={1} flexWrap="wrap">
      {labelChip({ Text }, 'Theme:')}
      {THEMES.map(t => (
        <Button key={`theme-${t.key}`} label={`${theme.key === t.key ? '●' : '○'} ${t.label}`} onPress={() => choose($, t.key)} />
      ))}
    </Box>
  )
}

/** `/cachepulse theme [name]`: lists the looks, or switches to one. */
export async function themeCommand($: Ctx, arg: string): Promise<string> {
  const name = arg.replace(/^theme\s*/i, '').trim().toLowerCase()
  // One list, one order, the same names as the pane buttons (E2); a name or its short key works.
  const list = THEMES.map(t => (t.key === theme.key ? `${t.label} (current)` : t.label)).join(', ')
  if (name === '') return `Themes: ${list}. Use /cachepulse theme <name>. Default: ${THEMES.find(t => t.key === DEFAULT_THEME)?.label ?? DEFAULT_THEME}.`
  const found = THEMES.find(t => t.key === name || t.label.toLowerCase() === name || t.label.toLowerCase().startsWith(name))
  if (found === undefined) return `No theme called "${name}". Themes: ${list}.`
  await choose($, found.key)
  return `Theme set to ${found.label}.`
}
