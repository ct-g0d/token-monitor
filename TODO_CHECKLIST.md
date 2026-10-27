# Task Checklist & Execution Plan

## Orchestration Rules
1. **Review Subagents Stay in This Chat**:
   - Reviews are delegated strictly within this conversation/chat context using **GPT 6.1 Sol High (Fast Off)** (`codex` / `gpt-6.1-sol` with `reasoningEffort: "high"`, `serviceTier: "default"`).
   - If capacity is hit or response pauses, send `continue`.
   - Never launch independent threads for reviews.
2. **Worker Model Allocation**:
   - For carrying out work in implementation threads, average out/distribute across **AGY 1–5** (and DeepSeek V4.1 Flash Free Max on OpenCode where applicable).
3. **No Unauthorized Merges**:
   - Branches/PRs must NEVER merge on their own without explicit orchestrator inspection and approval.
4. **Flaw Handling & Revision**:
   - If a review deems a thread's changes flawed or incomplete, send it back with clear findings to continue and fix.
5. **Thread Concurrency & Branch Tracking**:
   - Maximum 3 parallel implementation threads at a time.
   - Do not link those threads to the orchestrator thread.
   - Set a background timer interval to monitor threads; never interrupt while they are working.
   - Track and mark branches that are completed/merged directly in this checklist.
   - Maintain a functional Windows `.exe` build and verify every checklist item before final handover.

---

## Task Hierarchy & Sizing
- `*` Small task
- `**` Medium task (requires subagent orchestration within thread)
- `***` Large task (requires agent team)

---

## Checklist of Bugs & Enhancements

- [x] **Task 1 (`**`)**: Make the app window an actual window, showing on the task bar / docker.
  - *Branch:* `feat/task-1-window-docker`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #26).
- [x] **Task 2 (`**`)**: Qoder and other registered providers: include and auto-detect in computer environment.
  - *Branch:* `feat/task-2-providers-autodetect`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #28).
- [x] **Task 3 (`*`)**: Fix active days metric.
  - *Branch:* `feat/task-3-active-days`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #27, commit `6d97f103`).
- [x] **Task 4 (`*`)**: Title bar: use icons for the providers (ref: `image_7a324ade-13b3-4898-9641-b21c387dd535`).
  - *Branch:* `feat/task-4-title-bar-icons-pr29-r2`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #30).
- [x] **Task 5 (`**`)**: When window shrinks, fix header wrapping / collision (ref: `image_2e0fef46-be16-48a8-95eb-f01aa32b8547`).
  - *Branch:* `feat/task-5-window-shrink-header-pr30`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #29).
- [x] **Task 6 (`***`)**: Fix model prices page crash; inspect T3 code source to build the interface (ref: `image_f5b6049d-b800-4f17-991b-58b88da1cc75`).
  - *Branch:* `t3/fix-model-prices-crash`
  - *Status:* Completed; audited and hardened Model prices dialog crash contract: guarded all environment, serverConfig, session, and capabilities accesses against partial or absent configurations, provided fallback workstation target so dialog opens and displays useful editable state, synchronized price overrides and model aliases with settings persistence.
- [x] **Task 7 (`*`)**: When clicking limits, show loading first, then empty state if no limits exist, or transition directly from loading to limits.
  - *Branch:* `t3/limits-loading-empty-state-1`
  - *Status:* Completed; implemented loading skeleton on clicking limits and refreshing, empty state when no limits exist, and direct transition to limit pools when limits exist (PR #40).
- [x] **Task 8 (`***`)**: In limits page (and settings/globally), expand supported providers, and change unconfigured boxes into an "Add Provider" action.
  - *Branch:* `t3/expand-provider-settings`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #33).
- [x] **Task 9 (`*`)**: Codex monthly, weekly, and session limits: expand to full width of the bar instead of half-and-half (ref: `image_af4c2e80-7068-487e-baa3-dba56aa88c57`).
  - *Branch:* `t3/codex-limit-bars-full-width`
  - *Status:* Completed; filtered null-window limit members to expand Codex limit bars to full 100% width across multi-account pools (PR #39, PR #52).
- [x] **Task 10 (`**`)**: Redesign arrangement for effective space utilization when window shrinks (ref: `image_ae57f434-ad0c-4afd-a216-435691072403`).
  - *Branch:* `t3/responsive-layout-arrangement`
  - *Status:* Completed; redesigned shell and page arrangement with responsive sidebar rail (w-16 to w-216), fluid typography on Totals, responsive activity stats, container query optimizations on limits, and compact padding when window shrinks down to 640x450 (PR #45).
- [x] **Task 11 (`*`)**: Align percentage number in the progress bar to be on the same line as its label text (ref: `image_d7258227-3749-4f9f-bf6b-d81d7d3f3f60`).
  - *Branch:* `t3/align-limit-bar-percentages`
  - *Status:* Completed; aligned progress bar percentage values on the same line as window label text with baseline alignment across responsive views while preserving container query thresholds and provider-specific layouts (PR #47, PR #52).
- [x] **Task 12 (`**`)**: Redesign status page + integrate Tibo reset forecasts.
  - *Branch:* `t3/status-page-reset-forecasts`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #35).
- [x] **Task 13 (`*`)**: Ensure language setting applies globally across the app.
  - *Branch:* `t3/global-language-setting`
  - *Status:* Completed; language setting is normalized, persisted, synchronized between main and renderer, and applied globally across the React UI, Electron shell, and document attributes (PR #41).
- [x] **Task 14 (`*`)**: Remove automatic app updates UI and logic since this is a local project.
  - *Branch:* `t3/remove-auto-updates`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #34).
- [x] **Task 15 (`*`)**: Restrict currency options to CNY and USD only.
  - *Branch:* `t3/restrict-currency-options`
  - *Status:* Completed; restricted currency options to CNY and USD across React and HTML settings while ensuring robust default handling, stored settings migration, and backward compatibility (PR #36).
- [x] **Task 16 (`*`)**: Remove redundant color theme selector overlapping with the top theme control in settings.
  - *Branch:* `t3/remove-redundant-theme-selector-1`
  - *Status:* Completed; removed redundant Color Theme dropdown and direct hook wiring from Appearance settings, preserving top-level Theme control under General settings (PR #43).
- [x] **Task 17 (`*`)**: Unify and clean up excessive options in the Theme & Glass Effects settings section.
  - *Branch:* `t3/unify-theme-glass-options`
  - *Status:* Completed; streamlined Theme & Glass Effects options by platform-gating backdrop material selectors to the host operating system, conditionally concealing inactive backdrop controls when native system glass is disabled, adding reset-to-default shortcuts with canonical backend defaults (68% opacity, 32% blur, 100% zoom), and preserving canonical theme and Edge Dock settings (PR #44).
- [x] **Task 18 (`*`)**: Delete background image settings.
  - *Branch:* `t3/remove-background-image-settings`
  - *Status:* Completed; deleted background image settings and their UI across React and HTML presentation, removed dead presentation wiring, and updated settings parity expectations while preserving glass, theme, and backend compatibility (PR #46).
- [x] **Task 19 (`*`)**: Unify interface fonts & display fonts settings and fix application so changes take effect.
  - *Branch:* `t3/unify-font-settings`
  - *Status:* Completed; consolidated separate interface and display font family controls into a unified Font Family setting with presets (App Default, System UI, Monospace, Custom), reset shortcut, and live CSS property application (--font-sans, --ui-font, --display-font, --tm-display, --font-mono, and text scaling) across the app, preserving persisted settings compatibility and existing renderer contracts (PR #48).
- [x] **Task 20 (`*`)**: Delete app subscription settings and UI.
  - *Branch:* `t3/remove-subscription-settings-ui`
  - *Status:* Completed; removed subscription settings presentation and navigation wiring (PR #32).
- [x] **Task 21 (`*`)**: Delete sync strategy settings.
  - *Branch:* `t3/remove-sync-strategy-settings`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #37).
- [x] **Task 22 (`*`)**: Make settings sidebar active highlight track scroll position (scrollspy) rather than remaining on general.
  - *Branch:* `t3/settings-sidebar-scrollspy`
  - *Status:* Completed; added viewport scrollspy and IntersectionObserver to track and highlight the visible section in settings sidebar (PR #38).
- [x] **Task 23 (`***`)**: Add a dedicated settings panel for the hover bar.
  - *Branch:* `t3/hover-bar-settings-panel`
  - *Status:* Completed; added dedicated HoverBarSettings panel to React settings navigation with full edge dock configuration (PR #42).
