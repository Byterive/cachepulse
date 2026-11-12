
// Design tokens.
export const GOOD = '#69cd72'
export const WARN = '#eec047'
export const COOL = '#5ed2ca'
export const MUTED = '#9ca5aa'
export const ORANGE = '#e8590c'
export const RED = '#e5534b'
export const PURPLE = '#a78bfa'
/** Borders the host names (how each draws on VS Code and Desktop is checked live). */
export type Frame = 'round' | 'single' | 'double' | 'bold'

/**
 * A look. Status colours (GOOD, WARN, COOL, ORANGE, RED, PURPLE and MUTED)
 * are not here: they keep their meaning in every theme. `chip`, `action` and `lastBg`
 * are null where a theme has none; `paneBorder` is 'none' for a pane with no frame.
 */
export type Theme = {
  key: string
  label: string
  bandBg: string
  lastBg: string | null
  chip: string | null
  action: string | null
  paneBg: string
  track: string
  outline: string
  borderStyle: Frame
  paneBorder: Frame | 'none'
  divider: string
  glyph: string
  bandDivider: boolean
  /** Main line under a heading (white, bold) and everything else (dark grey); values to be set by the owner. */
  text: string
  dim: string
  /** Label chips: background and text colour (the text is bold). */
  labelBg: string
  labelText: string
}

export const THEMES: readonly Theme[] = [
  { key: 'teal', label: 'Teal chips', bandBg: '#222c2d', lastBg: null, chip: '#314746', action: '#2b3c3d', paneBg: '#263232', track: '#3b5150', outline: '#6f9996', borderStyle: 'round', paneBorder: 'round', divider: '#71928c', glyph: '┈', bandDivider: true, text: '#e9edef', dim: '#9aa4aa', labelBg: '#4a4037', labelText: '#f0d9bd' },
  { key: 'slate', label: 'Cocoa Slate', bandBg: '#333333', lastBg: null, chip: null, action: null, paneBg: '#333333', track: '#4a4a4a', outline: '#7a868e', borderStyle: 'round', paneBorder: 'round', divider: '#79838a', glyph: '┄', bandDivider: true, text: '#e9edef', dim: '#9aa4aa', labelBg: '#4a4037', labelText: '#f0d9bd' },
  { key: 'graphite', label: 'Graphite', bandBg: '#2a2d30', lastBg: '#202326', chip: null, action: null, paneBg: '#282b2e', track: '#42484c', outline: '#7a838a', borderStyle: 'single', paneBorder: 'single', divider: '#788187', glyph: '╌', bandDivider: true, text: '#e9edef', dim: '#9aa4aa', labelBg: '#444b52', labelText: '#e9edef' },
  { key: 'ink', label: 'Ink', bandBg: '#101010', lastBg: null, chip: null, action: null, paneBg: '#101010', track: '#4a4a4a', outline: '#a0a0a0', borderStyle: 'double', paneBorder: 'double', divider: '#ffffff', glyph: '┄', bandDivider: true, text: '#e0e0e0', dim: '#a0a0a0', labelBg: '#3a5258', labelText: '#8fe3d6' },
  { key: 'warm', label: 'Warm charcoal', bandBg: '#302b27', lastBg: null, chip: null, action: null, paneBg: '#2c2825', track: '#50463d', outline: '#8c7968', borderStyle: 'bold', paneBorder: 'none', divider: '#938274', glyph: '┈', bandDivider: true, text: '#e9edef', dim: '#9aa4aa', labelBg: '#4a4037', labelText: '#f0d9bd' },
]

/** Default look. */
export const DEFAULT_THEME = 'teal'

/**
 * The look in use. Every render loads the saved choice into this object first
 * (hooks/themes.tsx), then reads it, so a change shows at the next redraw.
 */
export const theme: Theme = { ...THEMES.find(t => t.key === DEFAULT_THEME)! }

/** Switches `theme` to the named look; an unknown name leaves the default. */
export function applyTheme(key: unknown): void {
  Object.assign(theme, THEMES.find(t => t.key === key) ?? THEMES.find(t => t.key === DEFAULT_THEME)!)
}

export const PANE = 'cachepulse'
export const PANE_TITLE = 'CachePulse'
/** Rows of the text fallback. */
export const TEXT_ROWS = 10
/** How often the band redraws so the countdown moves, ms. */
export const TICK_MS = 30_000
/** Below this many pane columns the Show row may wrap and switch labels shorten. */
export const NARROW_COLS = 40

/**
 * Band bar colour from the TTL left: green over half, yellow to a fifth,
 * orange under that, red once the TTL has passed (also while it may be kept alive); green
 * when no TTL is known (no countdown to colour).
 */
export function cacheColor(
  state: 'warm' | 'expiring' | 'expired' | 'keepalive' | 'unknown',
  remainingMs: number | null,
  ttl: '5m' | '1h' | null,
): string {
  // Past the TTL the bar is red, also while the label says it may be kept alive.
  if (state === 'expired' || state === 'keepalive') return RED
  if (remainingMs === null || ttl === null) return GOOD
  const left = remainingMs / (ttl === '1h' ? 3_600_000 : 300_000)
  if (left > 0.5) return GOOD
  if (left >= 0.2) return WARN

  return ORANGE
}

/** Usage bar colour: 5-hour teal, 7-day purple; yellow from 80% used, red from 95%. */
export function usageColor(kind: string, percentUsed: number): string {
  if (percentUsed >= 95) return RED
  if (percentUsed >= 80) return WARN

  return kind === 'seven_day' ? PURPLE : COOL
}
