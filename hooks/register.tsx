import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Config, Marker, Sample, Ttl } from '../types'
import { registerBand } from './band'
import { dividerLine, labelChip } from './chips'
import { formatTokens, isAtLeast2_1_300, meter } from './meter'
import { addMarker, modelChange } from './markers'
import { addSample, makeSample } from './samples'
import { accountOf, asAccount, asTtl, describeTtl, isOn, resolveTtl } from './ttl'
import { COOL, NARROW_COLS, PANE, PANE_TITLE, TEXT_ROWS, TICK_MS, WARN, theme } from './style'
import { explainConfig, explainPane } from './explainpane'
import { checkExpiry, costRow, costText, modelSwitchRow, registerModelSwitch } from './modelswitch'
import { whyText } from './why'
import { describeMarker, formatClock, textTimeline } from './timeline'
import { paneSections, planUsage } from './panesections'
import { loadTheme, themeCommand, themeRow } from './themes'

// hooks/band.tsx reads samples, config and markers with the same keys and tags.
// Change a tag when the stored shape changes: the host keeps state through a
// reload, and a different tag reads what an older version stored as empty.
const samples = atom({ plugin: 'cachepulse', key: 'samples' } as const, [] as Sample[], {
  shape: 'samples-1',
})
const config = atom(
  { plugin: 'cachepulse', key: 'config' } as const,
  {
    setting: null,
    env: { force5m: false, ttl: null, enable1h: false },
    account: 'unknown',
    pin: null,
    keepAliveHint: false,
  } as Config,
  { shape: 'config-2' },
)
const markers = atom({ plugin: 'cachepulse', key: 'markers' } as const, [] as Marker[], {
  shape: 'markers-1',
})
const lastModel = atom({ plugin: 'cachepulse', key: 'lastModel' } as const, null as string | null, {
  shape: 'lastModel-1',
})
/** False in a state the inputs were never loaded into: VS Code /clear starts one with no session.start. */
const loaded = atom({ plugin: 'cachepulse', key: 'loaded' } as const, false as boolean, { shape: 'loaded-1' })
/** Expiry toast switch: on unless the store says off. */
const toastOn = atom({ plugin: 'cachepulse', key: 'toastOn' } as const, true as boolean, { shape: 'toastOn-1' })
type Ctx = EngineInterface
const TOAST_KEY = 'toastOff'
const PIN_KEY = 'ttlPin'
/** Model of the last main-thread request, kept in the store so a new process can compare. */
const MODEL_KEY = 'lastModel'
/** Last plan account seen: windows can be missing from a response or a new process. */
const ACCOUNT_KEY = 'account'

/**
 * TTL inputs, account, pin and last model from settings, variables and the store,
 * plus the New session marker when a fresh state follows an earlier one.
 */
async function loadInputs($: Ctx): Promise<void> {
  await update($, loaded, () => true)
  const toastOff = (await $.store.get(TOAST_KEY)) === true
  await update($, toastOn, () => !toastOff)
  // TTL inputs: settings and variables are configured sources; the pin is the
  // user's own display choice from an earlier session.
  const setting = asTtl(await $.settings.read({ key: 'promptCacheTtl' }))
  const none = () => undefined
  const env = {
    force5m: isOn(await $.env.get('FORCE_PROMPT_CACHING_5M').catch(none)),
    ttl: asTtl(await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL').catch(none)),
    enable1h: isOn(await $.env.get('ENABLE_PROMPT_CACHING_1H').catch(none)),
  }
  const pin = asTtl(await $.store.get(PIN_KEY))
  // Fresh load, empty state (VS Code /clear never fires session.end): seed the model from the store.
  const storedModel = await $.store.get(MODEL_KEY)
  const earlier = typeof storedModel === 'string' && storedModel !== '' ? storedModel : null
  if (
    earlier !== null &&
    (await read($, samples)).length === 0 &&
    (await read($, markers)).length === 0 &&
    (await read($, lastModel)) === null
  ) {
    await update($, lastModel, m => m ?? earlier)
    const at = await $.clock.now()
    await update($, markers, list => (list.length === 0 ? [{ kind: 'session' as const, at }] : list))
  }
  const { base } = await $.session.version()
  const stored = asAccount(await $.store.get(ACCOUNT_KEY))
  await update($, config, c => ({
    setting,
    env,
    // An account already seen in this state is newer than the stored one.
    account: c.account !== 'unknown' ? c.account : stored,
    pin,
    keepAliveHint: isAtLeast2_1_300(base),
  }))
  $.ui.invalidate('ui.render')
}

/**
 * Hooks call this first: a state with nothing loaded is refilled. The
 * redraw timer needs nothing here: it belongs to the module, which /clear keeps.
 */
async function ensureLoaded($: Ctx): Promise<void> {
  if (!(await read($, loaded))) await loadInputs($)
}

export const register: Register = on => {
  let tick: Timer | null = null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cachepulse',
      description: 'Show prompt-cache usage for this session; "why" explains the latest miss, "config" the TTL sources',
    })
    // No reset: session.start fires once per load (never on /clear); state survives a reload.
    await loadInputs($)

    // `$.clock.every` returns a Timer ({ cancel }); tests answer plain data, so cancel is optional.
    tick?.cancel?.()
    tick = $.clock.every(TICK_MS, () => {
      $.ui.invalidate('ui.render')
      void checkExpiry($).catch(() => undefined)
    })

    return next(e)
  })

  // /clear ends the session without a session.start for the new one.
  on('session.end', async ($, e, next) => {
    // /clear is followed by no session.start, so the countdown timer must keep running.
    if (e.reason !== 'clear') {
      tick?.cancel?.()
      tick = null
    }
    await update($, samples, () => [])
    if (e.reason !== 'clear') await update($, lastModel, () => null)
    // After /clear the list restarts with one marker saying so; at any other end it is dropped.
    const at = await $.clock.now()
    await update($, markers, () => (e.reason === 'clear' ? [{ kind: 'clear', at }] : []))
    // Redraw now so the band drops its old numbers (it shows nothing without samples).
    $.ui.invalidate('ui.render')

    return next(e)
  })

  // The pane's own close mark: redraw so the band's button says Open again.
  // Not reachable from the test kit (it cannot raise ui.close); checked live.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const result = await next(e)
    $.ui.invalidate('ui.render')

    return result
  })

  // Plan windows often arrive after the response (seen live 2026-11-11), so the
  // account is also set here, whenever the host measures new windows.
  on('session.measure', async ($, e, next) => {
    await ensureLoaded($)
    const account = accountOf(e.rateLimits, true)
    if (account !== 'unknown') {
      await update($, config, c => (c.account === account ? c : { ...c, account }))
      await $.store.set(ACCOUNT_KEY, account)
      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  // A compaction rewrites the prefix, so the next request is expected to write
  // cache. Recorded only once the compaction happened: not for a precompute
  // (installs nothing), not for a skip, not for a subagent's own transcript.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    // Before the marker, so a fresh state still gets its New session marker first.
    await ensureLoaded($)
    if (e.agentId === undefined && e.trigger !== 'precompute' && !('skip' in result)) {
      const at = await $.clock.now()
      await update($, markers, list => addMarker(list, { kind: 'compact', at, detail: e.trigger }))
      $.ui.invalidate('ui.render')
    }

    return result
  })

  // Main and subagent requests are both kept; agentId tells them apart.
  on('turn.step', async function* ($, e, next) {
    for await (const chunk of next(e)) {
      if (chunk.kind === 'stop') {
        await ensureLoaded($)
        const at = await $.clock.now()
        const sample = makeSample(e, chunk.usage, at)
        if (sample !== null) {
          const change = modelChange(await read($, lastModel), sample)
          if (sample.agentId === undefined) {
            await update($, lastModel, () => sample.model)
            await $.store.set(MODEL_KEY, sample.model)
          }
          await update($, samples, list => addSample(list, sample))
          if (change !== null) await update($, markers, list => addMarker(list, change))
          // The plan windows of the response just received tell the account.
          const usage = await $.session.usage().catch(() => undefined)
          const account = accountOf(usage?.rateLimits ?? [], true)
          // A response without windows says nothing: keep what is known.
          if (account !== 'unknown') {
            await update($, config, c => (c.account === account ? c : { ...c, account }))
            await $.store.set(ACCOUNT_KEY, account)
          }
          $.ui.invalidate('ui.render')
        }
      }
      yield chunk
    }
  })

  on('command.run', { command: 'cachepulse' }, async ($, e) => {
    await ensureLoaded($)
    const list = await read($, samples)
    // `/cachepulse why` (latest miss) and `config` (TTL sources): text on every surface.
    const arg = e.args.trim().toLowerCase()
    if (arg.startsWith('theme')) return { text: await themeCommand($, arg) }
    if (arg === 'config') return { text: await explainConfig($, await read($, config), list) }
    if (arg === 'why') return { text: whyText(list, await read($, markers), resolveTtl(await read($, config), list).ttl) }
    const surfaces = await $.session.surfaces()
    // With a surface, open the pane; with none, answer in text.
    if (surfaces.length > 0) {
      // Toggle, like the band's button: a second run closes the pane.
      if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
        await $.ui.close({ id: PANE })
        $.ui.invalidate('ui.render')

        return { text: 'CachePulse details closed.' }
      }
      await $.ui.open({ id: PANE, title: PANE_TITLE, backgroundColor: theme.paneBg })
      $.ui.invalidate('ui.render')

      return { text: `CachePulse details opened (${list.length} request(s) recorded).` }
    }

    return { text: textTimeline(list, TEXT_ROWS, await read($, markers)) + (await costText($, list, await read($, config))) }
  })

  // Details pane: totals and a bounded timeline, newest first.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await loadTheme($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, samples)
    const marks = await read($, markers)
    const cfg = await read($, config)
    const resolved = resolveTtl(cfg, list)
    const pick = (value: Ttl | null) => async () => {
      if (value === null) await $.store.delete(PIN_KEY)
      else await $.store.set(PIN_KEY, value)
      await update($, config, c => ({ ...c, pin: value }))
      $.ui.invalidate('ui.render')
    }
    const choice = (label: string, value: Ttl | null) => (
      <Button
        key={`ttl-${label}`}
        label={`${cfg.pin === value ? '●' : '○'} ${label}`}
        onPress={pick(value)}
      />
    )
    const now = (await $.clock.now().catch(() => undefined)) ?? 0
    const toastIsOn = await read($, toastOn)
    const flipToast = async () => {
      if (toastIsOn) await $.store.set(TOAST_KEY, true)
      else await $.store.delete(TOAST_KEY)
      await update($, toastOn, () => !toastIsOn)
      $.ui.invalidate('ui.render')
    }
    const ttlBlock = (
      <Box flexDirection="column">
        <Text bold color={COOL}>Cache lifetime (TTL)</Text>
        <Text bold color={theme.text}>{describeTtl(resolved)}</Text>
        {meter(list, now, resolved, cfg.keepAliveHint).state === 'keepalive' ? (
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
          {themeRow($, { Box, Text, Button })}
          <Box key="toast-group" flexDirection="column">
            <Box key="toast-row" gap={1}>
              {labelChip({ Text }, 'Expiry toast:')}
              <Button key="toast-switch" label={toastIsOn ? '● On' : '○ Off'} onPress={flipToast} />
            </Box>
            <Text color={theme.dim}>1 min before expiry (1h cache: also 10 min)</Text>
          </Box>
          {await modelSwitchRow($, { Box, Text, Button }, e.props.bodyColumns < NARROW_COLS)}
          {await costRow($, { Box, Text, Button }, list, resolved.ttl, cfg.account)}
        </Box>
        {await planUsage($, e)}
        {dividerLine({ Box, Text }, e.props.bodyColumns, 'd-where')}
        {await explainPane($, { Box, Text }, cfg, list)}
      </Box>
    )
    if (list.length === 0) {
      return (
        <Box key="pane-frame" flexDirection="column" borderStyle={theme.paneBorder === 'none' ? undefined : theme.paneBorder} borderColor={theme.outline} paddingX={1}>
          <Text color={theme.dim}>No requests recorded yet. Send a message first.</Text>
          {marks.map(m => (
            <Text color={WARN}>{`${formatClock(m.at)}  ${describeMarker(m)}`}</Text>
          ))}
          {ttlBlock}
        </Box>
      )
    }
    const sections = await paneSections($, e, list, marks, resolved.ttl)

    return (
      <Box key="pane-frame" flexDirection="column" borderStyle={theme.paneBorder === 'none' ? undefined : theme.paneBorder} borderColor={theme.outline} paddingX={1}>
        {ttlBlock}
        {sections}
      </Box>
    )
  })

  registerBand(on)
  registerModelSwitch(on)
}
