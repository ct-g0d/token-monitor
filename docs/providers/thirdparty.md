---
summary: "Third-party balance profiles: New API account/token, Sub2API and custom adapters, quota conversion, and New API spend enrichment."
ids: [thirdparty]
read_when:
  - Adding or changing a third-party balance adapter, profile field or endpoint
  - Debugging New API spend enrichment, quota conversion or custom balance parsing
---

# Third-party balances

`thirdparty` is a limits-only provider, not a tracked token client. Each named profile is one balance account, passed as `thirdPartyProfiles`; the single environment account is named `environment` and reserves that name. Disabled profiles and duplicate identities are skipped. New API and Sub2API normalize a terminal `/v1`; the custom adapter keeps its configured path.

## Adapters and quota units

| Adapter | Credential and source |
| --- | --- |
| `newapi-account` | Access token plus optional user ID; `/api/user/self`, with `/api/status` required and `/api/data/self` enrichment |
| `newapi-token` | API key; `/api/usage/token/` |
| `sub2api` | Access token plus refresh token; `/api/v1/auth/me`, usage statistics and dashboard statistics |
| `custom` | API key; configured path (default `/user/balance`) with configured JSON paths |

New API quota values are divided by `quota_per_unit` from `/api/status`, defaulting to 500,000 only when the field is absent or invalid. A missing required status response makes the row unavailable rather than assuming the default. Account mode reports remaining, used and all-time spend from the account row; token mode reports only that token's independently configured quota.

Sub2API access tokens can be renewed with a single-use refresh token. Renewal happens only when the caller can persist the replacement pair, and the new credentials must be durably accepted before the retried request is used; a failed persistence makes the row unavailable instead of leaving an unrecoverable token behind.

The custom adapter divides the configured remaining/used/total JSON values by `divisor` (default 1), labels the currency from configuration (default `USD`), and authenticates with either `Authorization: Bearer` or `x-api-key`. Endpoint paths and JSON paths are validated; prototype keys, queries, fragments, traversal segments and malformed paths are rejected at profile normalization.

## New API spend enrichment

Only `newapi-account` reads `/api/data/self`. It runs alongside the account and status requests, not after them, and requests three local periods with `start_timestamp`, `end_timestamp` and `default_time=day`: today, a rolling seven-day week (today plus the previous six days), and the local calendar month. Each request has its own 3-second deadline and settles independently, so one slow or failing period leaves the other periods and the balance untouched.

New API buckets these rows by UTC hour even when asked for daily data. A local period start that is not exactly on an hour boundary cannot be reconstructed: rounding down includes the previous period, and rounding up loses spend. Such a period is not queried and its spend stays unknown rather than being silently misbucketed. Empty data is a real zero; a malformed row or payload leaves that period's spend absent.

A status response explicitly setting `enable_data_export` to `false` disables the period figures, because a readable but stale/empty export must not claim zero spend. A missing flag still allows enrichment for compatible forks. All-time spend always comes from the account row and is not replaced by these figures.

## Invariants and known gaps

- `/api/status` is required for New API account mode. Its absence is unavailable, not a default quota unit.
- Enrichment failures never fail the row and never erase a known balance or all-time spend.
- The custom endpoint, currency and divisor come from the profile; do not infer a currency from the number.
- These are user-configured third-party services. Token Monitor does not discover profiles or verify that a fork's reported quota is authoritative.

## Verification

Run `node --test tests/shared/thirdPartyLimits.test.js tests/electron/thirdPartySettings.test.js` for profile normalization, quota conversion, spend enrichment, renewal and the settings form. `npm run verify` remains the final gate.
