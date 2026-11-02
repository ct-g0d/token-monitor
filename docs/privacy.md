# Privacy Policy

Token Monitor is local-first. It processes AI-tool usage logs on the device and does not send analytics or telemetry to the project maintainer. The project does not operate a hosted data-collection service.

## Network features

Token Monitor makes network requests only for documented or user-enabled features:

- Packaged builds check GitHub Releases for updates.
- Exchange-rate and service-status views fetch their public data sources.
- Enabled AI Tool Limits integrations contact the corresponding provider. Credentials are sent only to that provider.
- The optional Codex reset forecast fetches codex-resets.com, a third-party source that is not OpenAI.
- Discord Rich Presence sends the selected activity details to Discord when explicitly enabled.

These requests are processed under the privacy policy of the service receiving them, including the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) for update checks and the [Discord Privacy Policy](https://discord.com/privacy) for Rich Presence. Review the applicable provider's privacy policy before enabling a provider-backed integration.

## Multi-device sync

Multi-device sync is optional and has no Token Monitor-operated default server. The operator chooses and controls the destination hub, whether it runs in the app, on a self-hosted Node server, or on Cloudflare Workers.

When enabled, sync can send device identifiers and metadata; aggregate token and cost totals; client, model, session, and project attribution; retained usage history; and normalized provider-limit status. Project attribution can include an opaque project identifier and workspace-folder label, but never an absolute workspace path. Provider limits can include a hashed account identifier, account email, and plan label so the authenticated hub can distinguish accounts.

Sync also carries manually recorded subscription metadata when any exists: the plan name, amount, currency, billing cadence, dates you entered, and the account each record is bound to. These are values you typed in, never read from a provider, and they are stored once per hub rather than per device. The Worker public stats endpoints never expose them; Node Hub stats require authentication when a secret is configured.

Optional content sync on Node Hubs and Workers can additionally share session titles, model aliases/grouping, and custom model prices. Each option defaults off on every device. Title sharing requires separate server permission and device consent; the desktop confirmation identifies the destination and warns that titles may reveal project, client or work information. The server administrator and devices with shared access can read them. Changing the saved destination, credential or device ID clears those selections. Displaying titles locally does not authorize sharing them.

Turning title sharing off immediately stops this device's title sends and requests removal of its stored server titles. Failed cleanup is shown as pending and retried. Disabling title reception on the server also scrubs records from offline devices. These operations cannot remove exports, downloads or backup copies already held elsewhere. Public Worker stats exclude titles and shared settings even when these options are enabled.

Sync does not send raw AI logs, message bodies or previews, source code, OAuth credentials, access or refresh tokens, provider cookies, API keys, or raw provider responses. See the [API documentation](API.md) for the current wire format and public-endpoint redactions.

Data retention and access on a synchronized deployment are controlled by the operator of that hub and its infrastructure provider.
