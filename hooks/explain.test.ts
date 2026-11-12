import { expect, test } from 'claude-code/testing'

import { explainText, reportedLine, rowText, sourceRows, subagentLine } from './explain'
import { resolveTtl } from './ttl'

const CFG = {
  setting: null,
  env: { force5m: false, ttl: null, enable1h: false },
  account: 'unknown' as const,
  pin: null,
  keepAliveHint: false,
}
const MIN = 60_000
const S = (at: number, read: number, written: number) => ({
  turnId: `t${at}`, index: 0, model: 'm', at, read, written, uncached: 1, output: 1,
  hitShare: read / (read + written + 1), state: 'data' as const,
})

test('nothing set: no winner, every row says not set, the shown TTL is unknown', () => {
  const rows = sourceRows(CFG, [])
  expect(rows.length).toBe(8)
  expect(rows.every(r => r.value === null && !r.win)).toBe(true)
  expect(rowText(rows[2]!)).toBe('  FORCE_PROMPT_CACHING_5M: not set')
  expect(explainText(CFG, [])).toContain('Shown: TTL unknown.')
})

test('the winner is always the source resolveTtl shows', () => {
  const cases = [
    { ...CFG, pin: '5m' as const, setting: '1h' as const },
    { ...CFG, env: { force5m: true, ttl: '1h' as const, enable1h: true } },
    { ...CFG, env: { force5m: false, ttl: '1h' as const, enable1h: false }, setting: '5m' as const },
    { ...CFG, setting: '1h' as const },
    { ...CFG, env: { force5m: false, ttl: null, enable1h: true } },
    { ...CFG, account: 'subscription' as const },
    { ...CFG, account: 'credits' as const },
  ]
  for (const c of cases) {
    const rows = sourceRows(c, [])
    const win = rows.filter(r => r.win)
    expect(win.length).toBe(1)
    expect(win[0]?.value).toBe(resolveTtl(c, []).ttl)
  }
  const win = sourceRows({ ...CFG, setting: '1h' }, []).find(r => r.win)
  expect(rowText(win!)).toBe('→ promptCacheTtl setting: 1h (configured)')
})

test('timing proof of 1h outranks a configured 5m, as in resolveTtl', () => {
  const list = [S(0, 0, 50_000), S(6 * MIN, 50_000, 100)]
  const rows = sourceRows({ ...CFG, env: { force5m: true, ttl: null, enable1h: false } }, list)
  expect(rows.find(r => r.win)?.name).toBe('Timing proof of 1h')
})

test('the text says what is real, the subagent TTL, and that it is read-only', () => {
  const t = explainText(CFG, [], null, subagentLine({ force5m: false, env: null, setting: null, enable1h: false }))
  expect(t).toContain('Read from Claude Code: the settings and the variables')
  expect(t).toContain("Subagent TTL: ~5m (inferred, default); a subagent's own cacheTtl may differ.")
  expect(t).toContain('1h costs more to write')
  expect(t).toContain('does not change Claude Code')
  expect(t).not.toMatch(/\$|saves? \d/)
})

test('the host report shows as observed and is flagged when it differs from what CachePulse shows', () => {
  const pick5 = { ...CFG, pin: '5m' as const }
  const differs = reportedLine(pick5, [], { ttl: '1h', at: 0 })
  expect(differs?.differs).toBe(true)
  expect(differs?.text).toContain(': 1h (observed). CachePulse shows 5m; the real cache may differ from the band.')
  expect(reportedLine({ ...CFG, pin: '1h' }, [], { ttl: '1h', at: 0 })?.differs).toBe(false)
  expect(reportedLine(pick5, [], null)).toBeNull()
  expect(explainText(pick5, [], { ttl: '1h', at: 0 })).toContain('Reported by Claude Code at the last model switch')
  expect(explainText(pick5, [])).not.toContain('Reported by Claude Code')
})

test('subagent TTL follows its own order and is configured or inferred, never unknown', () => {
  const none = { force5m: false, env: null, setting: null, enable1h: false }
  expect(subagentLine({ ...none, force5m: true, env: '1h' })).toContain('5m (configured, FORCE_PROMPT_CACHING_5M)')
  expect(subagentLine({ ...none, env: '1h', setting: '5m' })).toContain('1h (configured, CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL)')
  expect(subagentLine({ ...none, setting: '1h', enable1h: false })).toContain('1h (configured, subagentPromptCacheTtl setting)')
  expect(subagentLine({ ...none, enable1h: true })).toContain('1h (configured, ENABLE_PROMPT_CACHING_1H)')
  expect(subagentLine(none)).toContain('~5m (inferred, default)')
})
