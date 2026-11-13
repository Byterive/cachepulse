---
title: cachepulse privacy policy
summary: What cachepulse reads, writes and sends, how long data is kept, and how to contact us.
keywords: [cachepulse, privacy, data, policy]
status: confirmed
updated: 2026-11-14
---

# cachepulse privacy

This page says what cachepulse does with your data. It applies to cachepulse version 0.1 and later releases of that line, until a newer version of this file replaces it. Date: 2026-11-14.

## What it reads
- Token counts, model names and timestamps from Claude Code's events.
- To show where the cache lifetime (TTL) comes from: the variables `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H` and `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL`, and the settings `promptCacheTtl` and `subagentPromptCacheTtl`.
- The session usage Claude Code reports: plan usage windows with percent used and reset time, and the session cost when Claude Code provides it. From the plan windows it infers whether the account looks like a subscription or usage credits, which sets the account default TTL.

## What it writes and where
It writes no files of its own. Claude Code's plugin store keeps a few small values between sessions: your theme, your TTL pick, your on or off choices for the expiry toast, the cost line and the model-switch warning, the last model name, the last TTL Claude Code reported, and the account kind. It does not change Claude Code's settings, files or variables.

## What it sends and to whom
Nothing. It makes no network requests and starts no processes.

## How long data is kept
Request data is kept in memory for the session, 200 requests at most. The values in Claude Code's plugin store stay until you change or remove them.

## Who it is for
We do not design cachepulse for people under 18, and we do not knowingly collect data from them.

## Other software
cachepulse runs inside Claude Code. Claude Code and the other tools it works with handle your data under their own terms. This page covers only cachepulse.

## Contact
Use the contact details on [byterive.com](https://byterive.com). We do not publish an email address for privacy questions yet.

*Independent project by Byterive. Not affiliated with or endorsed by Anthropic.* · [byterive.com](https://byterive.com)
