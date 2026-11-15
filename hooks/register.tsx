import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Account, Config, Marker, Sample, Ttl } from '../types'
import { bandEmpty, bandView } from './band'
import { isAtLeast2_1_300 } from './meter'
import { addMarker, modelChange } from './markers'
import { addSample, makeSample } from './samples'
import { accountOf, asAccount, asTtl, isOn, resolveTtl } from './ttl'
import { NARROW_COLS, PANE, PANE_TITLE, TEXT_ROWS, TICK_MS, applyTheme, theme } from './style'
import { REPORTED_KEY, asReported, asSubagentLine, explainConfig, explainPane } from './explainpane'
import { SWITCH_OFF_KEY, SWITCH_TOAST_MS, modelSwitchRow, switchToast } from './modelswitch'
import { COST_KEY, costRow, costText } from './cost'
import { TOAST_MS, dueToast, type Warned } from './toast'
import { whyText } from './why'
import { textTimeline } from './timeline'
import { paneSections, planUsage } from './panesections'
import { paneFrame, ttlSection } from './panettl'
import { THEME_KEY, themeCommand, themeRow } from './themes'

// Every hook and every `$` call lives in this file; the other files get plain values.
// Change a tag when the stored shape changes: the host keeps state through a
// reload, and a different tag reads what an older version stored as empty.
const samples = atom({ plugin: 'cachepulse', key: 'samples' } as const, [] as Sample[], { shape: 'samples-1' })
const config = atom({ plugin: 'cachepulse', key: 'config' } as const, {
  setting: null, env: { force5m: false, ttl: null, enable1h: false }, account: 'unknown', pin: null, keepAliveHint: false,
} as Config, { shape: 'config-2' })
const markers = atom({ plugin: 'cachepulse', key: 'markers' } as const, [] as Marker[], { shape: 'markers-1' })
const lastModel = atom({ plugin: 'cachepulse', key: 'lastModel' } as const, null as string | null, { shape: 'lastModel-1' })
/** False in a state the inputs were never loaded into: VS Code /clear starts one with no session.start. */
const loaded = atom({ plugin: 'cachepulse', key: 'loaded' } as const, false as boolean, { shape: 'loaded-1' })
/** Expiry toast switch: on unless the store says off. */
const toastOn = atom({ plugin: 'cachepulse', key: 'toastOn' } as const, true as boolean, { shape: 'toastOn-1' })
/** The idle gap and lead already toasted, so each toast shows once. */
const warnedFor = atom({ plugin: 'cachepulse', key: 'warnedFor' } as const, null as Warned, { shape: 'warnedFor-2' })
/** The band's own: whether the More summary is open. */
const bandMore = atom({ plugin: 'cachepulse', key: 'bandMore' } as const, false, { shape: 'bandMore-1' })
type Ctx = EngineInterface
const TOAST_KEY = 'toastOff'
const PIN_KEY = 'ttlPin'
/** Model of the last main-thread request, kept in the store so a new process can compare. */
const MODEL_KEY = 'lastModel'
/** Last plan account seen: windows can be missing from a response or a new process. */
const ACCOUNT_KEY = 'account'
const none = () => undefined

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

/** Timer step: toasts per idle gap before the TTL runs out. */
async function checkExpiry($: Ctx): Promise<void> {
  const list = await read($, samples)
  const due = dueToast(list, await $.clock.now(), await read($, config), await read($, toastOn), await read($, warnedFor))
  if (due === null) return
  await update($, warnedFor, () => ({ at: due.anchor, lead: due.lead }))
  $.ui.toast(due.text, { timeoutMs: TOAST_MS })
}

/** Loads the saved theme into `theme`; every render calls this first. A failed read keeps the default. */
async function loadTheme($: Ctx): Promise<void> {
  applyTheme(await $.store.get(THEME_KEY).catch(none))
}

/** A theme choice: saves it, and re-opens an open pane so its background follows (the host sets it at open). */
function themeChooser($: Ctx) {
  return async (key: string): Promise<void> => {
    await $.store.set(THEME_KEY, key)
    applyTheme(key)
    if ((await $.ui.panes().catch(() => [])).some(p => p.id === PANE)) {
      await $.ui.close({ id: PANE })
      await $.ui.open({ id: PANE, title: PANE_TITLE, backgroundColor: theme.paneBg })
    }
    $.ui.invalidate('ui.render')
  }
}

/** A pane switch kept as a store key set to true: a press deletes the key when set, else sets it. */
function storeFlip($: Ctx) {
  return (key: string, isSet: boolean) => async (): Promise<void> => {
    if (isSet) await $.store.delete(key)
    else await $.store.set(key, true)
    $.ui.invalidate('ui.render')
  }
}

/** Keeps the TTL Claude Code reported at a model switch, with when: observed, as of that moment. */
function reportKeeper($: Ctx) {
  return async (ttl: '5m' | '1h'): Promise<void> => {
    // A failure here must never stop the warning or the switch.
    try {
      await $.store.set(REPORTED_KEY, { ttl, at: await $.clock.now() })
      $.ui.invalidate('ui.render')
    } catch {
      // nothing kept
    }
  }
}

/** The band's button and `/cachepulse`: a second press closes the pane. True when it opened. */
async function togglePane($: Ctx): Promise<boolean> {
  const wasOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (wasOpen) await $.ui.close({ id: PANE })
  else await $.ui.open({ id: PANE, title: PANE_TITLE, backgroundColor: theme.paneBg })
  $.ui.invalidate('ui.render')

  return !wasOpen
}

/** Keeps a plan account seen in a response or a measure, in the state and the store. */
function accountKeeper($: Ctx) {
  return async (account: Account): Promise<void> => {
    await update($, config, c => (c.account === account ? c : { ...c, account }))
    await $.store.set(ACCOUNT_KEY, account)
  }
}

/** The TTL Claude Code reported at the last model switch, or null. */
async function readReported($: Ctx) {
  return asReported(await $.store.get(REPORTED_KEY).catch(none))
}

/** The subagent TTL line from its own variable and setting; read when shown, so no state shape changes. */
async function readSubagentLine($: Ctx): Promise<string> {
  return asSubagentLine(
    await $.env.get('FORCE_PROMPT_CACHING_5M').catch(none),
    await $.env.get('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL').catch(none),
    await $.settings.read({ key: 'subagentPromptCacheTtl' }).catch(none),
    await $.env.get('ENABLE_PROMPT_CACHING_1H').catch(none),
  )
}

/** A store key that is true: the cost switch (off by default) and the switch-warning Off. */
function storeFlag($: Ctx) {
  return async (key: string): Promise<boolean> => (await $.store.get(key).catch(none)) === true
}

/** Claude Code's own session total, or null. */
async function hostUsd($: Ctx): Promise<number | null> {
  const usd = (await $.session.usage().catch(none))?.cost?.usd
  return typeof usd === 'number' ? usd : null
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
      void checkExpiry($).catch(none)
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
      await accountKeeper($)(account)
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
          const usage = await $.session.usage().catch(none)
          const account = accountOf(usage?.rateLimits ?? [], true)
          // A response without windows says nothing: keep what is known.
          if (account !== 'unknown') await accountKeeper($)(account)
          $.ui.invalidate('ui.render')
        }
      }
      yield chunk
    }
  })

  // Warns before the switch; never blocks (D8 a): the event is passed on unchanged.
  on('classic.PreModelSwitch', async ($, e, next) => {
    await reportKeeper($)(e.cache_ttl)
    const text = switchToast(e)
    if (text !== null && !(await storeFlag($)(SWITCH_OFF_KEY))) $.ui.toast(text, { timeoutMs: SWITCH_TOAST_MS })

    return next(e)
  })

  // After any switch, auto and resume included: keep the TTL only, no toast.
  on('classic.PostModelSwitch', async ($, e, next) => {
    await reportKeeper($)(e.cache_ttl)

    return next(e)
  })

  on('command.run', { command: 'cachepulse' }, async ($, e) => {
    await ensureLoaded($)
    const list = await read($, samples)
    // `/cachepulse why` (latest miss) and `config` (TTL sources): text on every surface.
    const arg = e.args.trim().toLowerCase()
    if (arg.startsWith('theme')) return { text: await themeCommand(arg, themeChooser($)) }
    if (arg === 'config') return { text: explainConfig(await read($, config), list, await readReported($), await readSubagentLine($)) }
    if (arg === 'why') return { text: whyText(list, await read($, markers), resolveTtl(await read($, config), list).ttl) }
    const surfaces = await $.session.surfaces()
    // With a surface, toggle the pane like the band's button; with none, answer in text.
    if (surfaces.length > 0) {
      const opened = await togglePane($)

      return { text: opened ? `CachePulse details opened (${list.length} request(s) recorded).` : 'CachePulse details closed.' }
    }
    const timeline = textTimeline(list, TEXT_ROWS, await read($, markers))
    const cfg = await read($, config)

    return { text: timeline + ((await storeFlag($)(COST_KEY)) ? costText(await hostUsd($), list, cfg) : '') }
  })

  // Two-row band above the prompt; it follows the main conversation only (subagents are in the pane's totals).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await loadTheme($)
    const list = (await read($, samples)).filter(s => s.agentId === undefined)
    if (e.props.hasSurvey) return next(e)
    if (list.length === 0) {
      // After /clear, say so until the first request; with nothing else to show, stay hidden.
      const fresh = (await read($, markers)).find(m => m.kind === 'clear' || m.kind === 'session')
      if (fresh === undefined) return next(e)

      return bandEmpty($.ui.resolve(e), fresh.kind === 'clear' ? 'clear' : 'session')
    }
    const cfg = await read($, config)
    const now = await $.clock.now()
    const ui = $.ui.resolve(e)
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    const open = await read($, bandMore)
    const more = async () => {
      await update($, bandMore, v => !v)
      $.ui.invalidate('ui.render')
    }

    return bandView(ui, e, list, cfg, now, isOpen, open, () => togglePane($), more)
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
    const now = (await $.clock.now().catch(none)) ?? 0
    const toastIsOn = await read($, toastOn)
    const flipToast = async () => {
      if (toastIsOn) await $.store.set(TOAST_KEY, true)
      else await $.store.delete(TOAST_KEY)
      await update($, toastOn, () => !toastIsOn)
      $.ui.invalidate('ui.render')
    }
    const flip = storeFlip($)
    const switchOff = await storeFlag($)(SWITCH_OFF_KEY)
    const costOn = await storeFlag($)(COST_KEY)
    const usd = costOn ? await hostUsd($) : null
    const limits = (await $.session.usage().catch(none))?.rateLimits ?? []
    const reported = await readReported($)
    const sub = await readSubagentLine($)
    const ttlBlock = ttlSection({ Box, Text, Button }, e, list, now, resolved, cfg.keepAliveHint, cfg.pin, toastIsOn, pick, flipToast, {
      theme: themeRow({ Box, Text, Button }, themeChooser($)),
      modelSwitch: modelSwitchRow({ Box, Text, Button }, switchOff, flip(SWITCH_OFF_KEY, switchOff), e.props.bodyColumns < NARROW_COLS),
      cost: costRow({ Box, Text, Button }, costOn, usd, list, resolved.ttl, cfg.account, flip(COST_KEY, costOn)),
      plan: planUsage({ Box, Text }, e, limits),
      explain: explainPane({ Box, Text }, cfg, list, reported, sub),
    })
    if (list.length === 0) return paneFrame({ Box, Text }, marks, ttlBlock, null)
    // Trend: Svg on Desktop and VS Code, block characters in the terminal.
    const table = e.surface === 'terminal' ? null : $.ui.resolve(e)
    const Svg = table === null ? null : table.Svg

    return paneFrame({ Box, Text }, marks, ttlBlock, paneSections({ Box, Text }, Svg, e, list, marks, resolved.ttl))
  })
}
