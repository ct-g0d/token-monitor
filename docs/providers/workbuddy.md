---
summary: "WorkBuddy provider notes: transcript roots, app-owned and managed credential accounts, the encryption boundary, and billing and combined-total contracts."
ids: [workbuddy]
read_when:
  - Changing WorkBuddy session discovery, titles, turn status or Session Detail
  - Adding or changing WorkBuddy limits collection
  - Adding or changing WorkBuddy managed account login, refresh or collection
  - Changing how the WorkBuddy desktop session is read, validated, or reported
  - Debugging a WorkBuddy row that shows as signed out on a signed-in machine
  - Changing WorkBuddy credential handling or the app-session security boundary
  - Changing the WorkBuddy combined total or its eligibility rules
---

# WorkBuddy provider

WorkBuddy's usage, transcript enrichment and quota reads have independent sources. Keep them separate when changing or debugging the provider.

| Data plane | What it measures | Primary runtime | Inputs |
| --- | --- | --- | --- |
| Token/session activity | Local model-token activity attributed to WorkBuddy | Shared usage collector through `tokscale` | Local WorkBuddy conversation data |
| Session metadata and Detail | Titles, turn boundaries, prompts, tools and per-turn tokens | Shared local metadata and Session Detail readers | WorkBuddy JSONL transcripts |
| Limits/quota | Remaining WorkBuddy Credits | Shared limits runtime | The installed WorkBuddy desktop app's session, saved managed accounts, or an explicit billing token in the headless lane |

Local App quota monitoring runs in the Electron main process. The app-owned session is available on macOS and Windows only; on Linux the Widget reports that capability as unavailable rather than falling back to a token. Managed accounts collect on Linux, and the platform restriction does not apply to local transcript readers.

## Session transcripts

Session discovery checks `~/.workbuddy/projects/**/*.jsonl`, then `~/.workbuddy-ai/projects/**/*.jsonl`; the latter is the home used by WorkBuddy 5.5. Both remain supported because tokscale scans both, and the first matching transcript wins. `providers/workbuddy/sessionMetadata.js` binds the shared CodeBuddy metadata reader to these roots. Token totals continue to come from tokscale, independently of whether a local transcript can be resolved.

The shared resolver receives the client id in its context and keeps existing metadata under `workbuddy:<sessionId>`. Bare session ids can coincide with CodeBuddy ids; sharing a parser must not share cached titles, turn state or project identity across clients.

WorkBuddy shares the [CodeBuddy transcript format and readers](codebuddy.md#workbuddy-writes-the-same-family), with two compatibility rules: a non-empty `custom-title` takes priority over `ai-title`, and older records without `providerData.messageId` or cache details still produce turns from their usage-bearing records. WorkBuddy's `<user_query>` prompt is extracted from the surrounding context envelope. Token conversion follows the pinned Tencent Buddy parser, including usage-object precedence, conditional cache subtraction and additive reasoning/cache writes; live rows, history and Detail share the same total.

On-demand Session Detail uses the shared streaming line reader and CodeBuddy parser. It retains the 16 MiB per-record bound and explicit read-error results; Windows detail resolution follows the async native-to-WSL fallback contract. There is no CodeBuddy VS Code extension-store fallback for WorkBuddy, whose conversations use the transcript roots above.

The shared metadata scanner still skips records above 64 KiB, so oversized user or assistant records can leave turn status stale. This metadata limit is separate from Session Detail's record bound. The desktop credential-encryption boundary described below concerns quota access; it does not prevent reading local session transcripts.

## Limits and quota

`fetchWorkbuddyLimits()` in `src/shared/providers/workbuddy/limits.js` owns the request and the response mapping. Both billing paths post to `https://copilot.tencent.com` — `/v2/billing/meter/get-user-resource` for personal accounts and `/v2/billing/meter/get-enterprise-user-usage` when an enterprise id is present. The personal request mirrors the official client's package selection (`ProductCode: p_tcaca`, `Status: [0, 3]`) but aggregates only `Status 0` rows, because the `Status 3` history packages are not part of the spendable balance.

`parsePersonalUsage()` fails closed when any active package carries unusable quota data: a partial aggregate would look plausible while silently omitting a package. An account with no active package stays a configured row with zero resources instead of becoming an error.

### Source selection

The widget lane combines the app-owned session with saved managed accounts. `electronLimitsConfig()` passes `workbuddyDesktopSessionOnly: true`, and `limitsConfigFromSettings()` turns that into empty settings and env for the WorkBuddy lane, so a stale `.env` or legacy settings token cannot silently outrank either source. The saved accounts are passed separately as `workbuddyManagedAccounts`. The headless agent and CLI keep the `TOKEN_MONITOR_WORKBUDDY_*` fallback; those fields are not a widget setup path.

In the headless lane an explicit token wins; `useLocalApp` requires no token plus an enabled lane plus an injected `workbuddyFetch`. Keep that precedence: the local session is the default, not an override. Managed accounts are probed independently, and a managed identity suppresses the equivalent app-owned row even when that managed account is disabled or its stored credential is missing, so a stale local session cannot revive an account the user removed.

### Managed accounts

A managed account is a browser OAuth login for one realm, not a copy of the app-owned session. `cn` uses `https://www.codebuddy.cn` with platform `workbuddy`; `ai` uses `https://www.workbuddy.ai` with platform `workbuddy-ai`. `runWorkbuddyOAuthLogin()` obtains a state, opens the realm's `/login` URL only after its origin, path, state, platform and absent credentials/port/fragment have been validated, then polls for the token and account identity. The flow is bounded at 15 seconds per request, 120 seconds total and a 1-second poll.

The credential is written to Token Monitor's private `credentials.json` (atomic write, `0600` file and `0700` directory), not to settings or the wire, and never to logs. Refresh is single-flight per account and renews shortly before expiry; a billing 401 refreshes once and retries once. A refresh response must keep the same realm domain, user/enterprise identity and department, otherwise the account is invalidated as changed.

Identity hashes the realm plus user/enterprise. The CN hash keeps the exact legacy subscription hash; AI accounts add an `ai:` prefix, so the same person on both realms remains two rows. Removing an account deletes its credential and row, then rebuilds the discovery union because an independent app-owned session for that identity may now be the only source.

### Combined total

`workbuddyQuotaTotalEnabled` is off by default and changes renderer presentation only. It collapses the WorkBuddy rows into one Credits group only when at least two distinct account keys are present, every row is `ok` with no stale or action-required state, all rows belong to the same realm/region, and each has the same single finite `credits` window (currency, pool, period and reset shape), including finite used, remaining and limit. The group row sums those fields, uses the earliest `updatedAt`, and keeps `groupAccounts` so the individual accounts and their quotas remain available. If any condition fails, the rows stay separate. Toggling the preference never deletes account records or rewrites quotas.

## The app-owned session

`src/electron/providers/workbuddy/localAuth.js` reads the session the installed app writes. On Windows it prefers `%LOCALAPPDATA%` and falls back to `%APPDATA%`; on macOS it reads `~/Library/Application Support`. In both cases the path is `CodeBuddyExtension/Data/Public/auth/workbuddy-desktop.info`.

Non-obvious constraints that must survive refactors:

- **The first directory with canonical state decides.** Once the preferred location holds the file or a `.logged-out` marker, the reader does not fall back to a legacy directory, so a stale roaming copy cannot revive a session the user ended.
- **Only the canonical filename is trusted.** A sibling file is never read, even when it looks like a session.
- **Symlinks and oversized files are refused** through `readRegularFileNoFollow` and the 1 MB cap.
- **The app-owned session is never copied.** Its access token lives in memory for the duration of one billing request: it is never written to settings, logs, Token Monitor's own wire or the credential store, and it leaves the machine only inside the allowlisted HTTPS billing request described under [Request contract](#request-contract). This rule is specific to the app-owned session; a managed account deliberately stores its own OAuth credential in the private credential store.

### Credential encryption

WorkBuddy 5.6.0 and later seal individual credential fields with the at-rest key their own runtime holds, so `auth.accessToken` arrives as a `{$wbEncrypted: 1, envelope: …}` shell instead of a string. Token Monitor cannot open that envelope and must not try to: the key is loaded by the app's own native binding, and no supported surface exposes it.

The reader therefore reports *why* a session is unusable rather than collapsing every failure into "not signed in". `WORKBUDDY_SESSION_READ_REASONS` names the states — `absent`, `unsupported`, `malformed`, `incomplete`, `encrypted`, `expired` — and `getSessionInfo()` carries the non-empty one on a failed read. Only the encrypted case changes the limits outcome, through `WORKBUDDY_SESSION_REASON_ENCRYPTED` in the shared module (the one value both layers agree on) becoming `actionRequired: appSessionEncrypted`.

That distinction is the whole point: an encrypted credential is not a signed-out app, and telling the user to sign in again sends them to a screen that cannot change the outcome. Keep the two apart when adding read states:

| Read reason | Limits outcome | Renderer |
| --- | --- | --- |
| `encrypted` | `notConfigured` + `actionRequired: appSessionEncrypted` | "Encrypted by app" |
| `absent`, `incomplete`, `malformed` | `notConfigured` | "Sign in" |
| `expired` | `unauthorized` | "Sign in again" |

`expired` is the one state where the read and the request disagree, and it is worth knowing why: `getSessionInfo()` hides an expired session, so the enabled local lane proceeds to a request, and `request()` re-reads the same file and rejects it as `unauthorized`. That rejection is what produces the "Sign in again" prompt.

`normalizeStoredSession()` stays the session-or-null accessor for callers that only want a session; `inspectStoredSession()` returns the `{ session, reason }` pair. Both live in the Electron layer, so the shared limits module receives the reason as plain configuration rather than reaching back into the reader.

## Request contract

`createWorkbuddyLocalAuth().request()` injects authentication only after `isAllowedWorkbuddyApiUrl()` has matched the exact https host, path and method with no credentials, port, query or fragment. It sets `redirect: 'error'` so the token can never follow a redirect, strips caller-supplied authentication headers, and re-reads the session after the response to reject a mid-request account switch. Preserve all four when touching the transport: they are the reason the provider is allowed to handle an app-owned credential at all.

## Change map

| Concern | Primary files |
| --- | --- |
| Transcript metadata and roots | `src/shared/providers/workbuddy/sessionMetadata.js`, shared CodeBuddy transcript readers |
| Transcript discovery and streaming Detail | `src/shared/sessionFiles.js`, `src/shared/sessionDetail.js`, `src/shared/sessionDetailResolver.js` |
| App session reading, encryption detection, read reasons | `src/electron/providers/workbuddy/localAuth.js` |
| Managed account login, realms and credential refresh | `src/electron/providers/workbuddy/oauthLogin.js`, `src/electron/providers/workbuddy/managedAccounts.js`, `src/shared/providers/workbuddy/oauth.js` |
| Billing request and response mapping | `src/shared/providers/workbuddy/limits.js` |
| Widget lane configuration and reason plumbing | `src/electron/main.js`, `src/electron/runtimeConfig.js` |
| Combined total eligibility and rendering | `src/electron/renderer/limits/providerPresentation.js`, `src/electron/renderer/limits/windowsView.js` |
| Action hint bounds | `src/shared/limits/core.js`, generated `worker/src/shared/limits/core.js` |
| Status label and localized strings | `src/electron/renderer/limits/providerPresentation.js`, `src/electron/renderer/i18n.js` |
| Wire contract | `docs/API.md` |

## Verification checklist

- both transcript roots, custom-title precedence and older ungrouped usage records;
- streamed Session Detail, oversized-record errors and async WSL fallback;
- personal and enterprise billing mapping, including the unlimited enterprise plan;
- an empty active-package list staying visible as configured;
- a sealed credential reporting `encrypted` rather than a missing sign-in;
- the read reasons for absent, malformed, oversized, incomplete and expired sessions;
- the widget lane refusing a legacy `.env` or settings token while still collecting managed accounts and the app session;
- a managed login for each realm, including preserved CN identity and the distinct AI identity;
- a disabled or credential-less managed account suppressing the equivalent local session on every platform, with Linux managed collection intact;
- an explicit headless token outranking the local session;
- combined-total eligibility, ineligible fallback and preference changes preserving account records;
- the allowlisted endpoint, header stripping, and mid-request session switch rejection.

Run focused tests while iterating, then `npm run sync:worker` when `src/shared/limits/core.js` changed, `npm run verify`, and `git diff --check`.

For session changes, run `node --test tests/shared/workbuddySessionMetadata.test.js tests/shared/sessionDetail.codebuddy.test.js tests/shared/sessionDetailStreaming.test.js tests/shared/sessionDetailResolver.test.js`.
