---
summary: "Cursor provider notes: managed accounts, tokscale self-sync, cache-backed session repair, unified-plan and dashboard limits."
ids: [cursor]
read_when:
  - Changing Cursor account discovery, login/logout/sync or local credential storage
  - Changing Cursor tokscale self-sync, cache events or legacy-session replacement
  - Changing Cursor plan-type detection, Included usage, prepaid balance, Grok Bot, team pool or on-demand limits mapping
---

# Cursor

Cursor has one Token Monitor-managed account list used by both tokscale self-sync and dashboard limits. Limits identity and local token history still remain separate outputs.

## Accounts and lifecycle

The credential store tracks multiple Cursor accounts and one active account. Desktop discovery can import the local access token without triggering a usage sync. Manually added session tokens and local access-token JWTs are normalized into the canonical form before storage.

Login, logout and sync share one lifecycle lane. This prevents an explicit account operation from racing the collector's background sync. Aborted queued work leaves promptly; a failed operation does not poison the lane. Tokscale subprocess timeouts and aborts request termination and wait for the shared close/forced-termination barrier.

Only accounts added manually by Token Monitor may be removed from its UI. Desktop discovery remains ambient ownership.

## Self-sync and sessions

Cursor is self-synced: the collector supplies its one `SelfSyncThrottle` and tokscale resolver to `createCursorSelfSync()`. A credential change forces one targeted Cursor usage sync but does not restart the usage runtime.

Cursor's old CSV usage names Auto as `auto`; its JSON usage events name the same mode `default`. Token Monitor groups both under `cursor-auto` in usage, History graph, old device periods, and archived session/client/day replay. Keep this mapping scoped to Cursor because other clients may use `default` for a different model. A persisted Cursor collector anchor from before this mapping must be rescanned once so its broader periods cannot mix old and new model keys.

The desktop `User/globalStorage` directory is watched only for direct `state.vscdb` and `state.vscdb-wal` changes. In real-time mode, these events request a targeted Cursor cloud sync before the `--today` cache scan, using the shared ten-second source-event floor instead of the idle five-minute cadence. Smart mode consumes the signals at its next activity-gated interval tick; interval mode retains periodic sync. An event inside the floor retains a targeted catch-up; failures use the existing five-minute backoff. SHM changes are discarded because our own read-only credential/title queries can rewrite the wal-index. Other extension data is pruned. No hooks are installed, and desktop state is a refresh signal, not a token ledger: usage still depends on Cursor's cloud records becoming available.

The generated tokscale Cursor cache is not watched because Token Monitor's own sync writes it. `usageEvents.js` indexes live and archived cache events by account and conversation, invalidating only changed files. `sessionGuard.js` uses that index to retire legacy synthetic event ids when a canonical session supersedes them; ambiguous events do not guess.

The usage events carry conversation ids but no names. Session titles come from the local Cursor desktop `composerHeaders` table, joined by conversation id; releases predating that table are read through the legacy `composer.composerHeaders` key instead. The reader opens the database read-only, queries only the requested ids, and refreshes its title cache when the database or WAL changes. Sessions without a local header retain the normal client/model fallback.

The desktop Sessions list groups Cursor bot conversations into one Grok Bot entry, sorted among other sessions by its latest activity. A nonempty `sand-subagent-` id or positive `grok-bot-*` model usage identifies a bot conversation. All models in that conversation stay together, including Claude; an ordinary Cursor Claude or Grok conversation without either signal remains separate. Classification survives display model aliases and uses matching conversation ids across the available period snapshots. Each Electron stats snapshot includes a compact bot-id projection for current DAY/MONTH conversations, checked by direct lookup in its captured local history without completing or transferring the all-time session list. This evidence refreshes with stats even if TOTAL has never been opened; immutable source maps reuse cached identity results. Without source evidence, a UUID-only Claude conversation remains independent. Grouping is an Electron presentation projection: period totals and original session identities are retained, and the group lists each run's title, model, time, calls, id, tokens and cost in newest-first order. The displayed count is activity records (one per distinct source session id in the selected period), not Grok chat rooms or individual billable calls. The source exposes no parent-chat mapping, so no parent conversation is inferred, and Cursor runs have no transcript-detail action.

For known usage conversations, the same read joins `cursorDiskKV`'s `composerData:<id>` by a matching embedded `composerId` and extracts only turn-state scalars. Modern headers outside the running window skip the larger composer payload unless usage is still recent; a resumed header's DB/WAL change admits it again. Cursor serializes local `generating` as `aborted` with `unfinishedRunAt`; that combination keeps the turn open, while `completed` or `aborted` without the marker stops the running indicator on the next collection. Definitive unknown/malformed reads clear earlier boundaries; transient read failures retain the last confirmed boundary in the existing per-database cache across collections and remain retryable even when a new title was read successfully. Partial Today passes retain other periods' boundaries; only a complete Today/Month/All Time set prunes sessions absent from usage. A missing or unknown result in an earlier candidate database cannot mask a later candidate’s valid boundary. Future editor timestamps do not extend activity recency. The existing time window still bounds an unfinished marker left after an editor crash. This does not discover zero-token conversations, install hooks, or change token/cost accounting; no additional watcher or timer is needed.

## Limits

Every enabled saved account is probed independently. Stable identity prefers the canonical API subject; opaque local fallback ids remain distinct rather than merging unrelated accounts. API email is presentation metadata, not the only identity key.

The dashboard mapping preserves separate official model pools, legacy request plans, enterprise/team pooled usage, optional Grok Bot allowance and on-demand spend. Never synthesize an overall total by summing model pools. Grok Bot is best effort and must not fail the main account row. A zero uncapped spend is hidden; positive uncapped spend remains visible.

### Plan shape

`planInfo.isMerged` is authoritative when the plan-info dashboard RPC answers; the sand status's `isUnified` is only the fallback. If both responses are absent the plan is `unknown` rather than guessed. The X Subscription (Plus, Premium, Super, unified Ultra) replaces the separate model pools with one included pool shared with Grok and Grok Bot, so a unified row suppresses the separate Grok Bot allowance and never adds an on-demand window. Team-pooled usage and a unified prepaid balance can still appear alongside it. Legacy plans retain their Requests or model-pool windows, optional Grok Bot allowance and on-demand spend.

For a unified plan the Included usage percentage prefers `GetCurrentPeriodUsage`, including an explicit zero, then the unified sand percentage, then the usage-summary plan percentage only when the plan explicitly declares a monthly included period. Weekly is the default; only an explicit monthly period uses the billing reset. A missing weekly reset stays unknown. Both the current-period RPC and plan info are best effort: the RPC needs a usable session JWT access token, is bounded to five seconds, and must not fail the row.

Prepaid balance is a unified-plan-only `credits` window from `/api/dashboard/get-user-prepaid-billing`; it is hidden at zero and a failure leaves the quota row intact. When the plan is unknown, the row carries `invalidateCachedWindowLabels` for `Requests`, `Cursor Models`, `Other Models` and `Overall`. The limits runtime consumes that list to drop those cached windows for the account while retaining other windows, and the field never enters the published wire shape.

Account-scoped enable/disable affects limits collection only. The active tokscale account and self-synced history are managed by the explicit Cursor lifecycle operations.

## Verification

Run the Cursor account, self-sync, cache-event and limits tests when changing this note's scope:

```bash
node --test tests/shared/cursor*.test.js tests/electron/cursorSettingsLayout.test.js
```
