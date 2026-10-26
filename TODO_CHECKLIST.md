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
- [ ] **Task 2 (`**`)**: Qoder and other registered providers: include and auto-detect in computer environment.
  - *Branch:* `feat/task-2-providers-autodetect`
  - *Status:* In progress in worktree.
- [x] **Task 3 (`*`)**: Fix active days metric.
  - *Branch:* `feat/task-3-active-days`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #27, commit `6d97f103`).
- [ ] **Task 4 (`*`)**: Title bar: use icons for the providers (ref: `image_7a324ade-13b3-4898-9641-b21c387dd535`).
- [ ] **Task 5 (`**`)**: When window shrinks, fix header wrapping / collision (ref: `image_2e0fef46-be16-48a8-95eb-f01aa32b8547`).
  - *Branch:* `feat/task-5-window-shrink-header-pr30`
  - *Status:* In review (PR #29 targeting `feat/t3-ui-ledger`).
- [ ] **Task 6 (`***`)**: Fix model prices page crash; inspect T3 code source to build the interface (ref: `image_f5b6049d-b800-4f17-991b-58b88da1cc75`).
  - *Branch:* `t3/fix-model-prices-crash`
  - *Status:* PR #31 opened targeting `feat/t3-ui-ledger`.
- [x] **Task 7 (`*`)*: When clicking limits, show loading first, then empty state if no limits exist, or transition directly from loading to limits.
  - *Branch:* `t3/limits-loading-empty-state-1`
  - *Status:* Completed; implemented loading skeleton on clicking limits and refreshing, empty state when no limits exist, and direct transition to limit pools when limits exist.
- [ ] **Task 8 (`***`)**: In limits page (and settings/globally), expand supported providers, and change unconfigured boxes into an "Add Provider" action.
- [ ] **Task 9 (`*`)**: Codex monthly, weekly, and session limits: expand to full width of the bar instead of half-and-half (ref: `image_af4c2e80-7068-487e-baa3-dba56aa88c57`).
- [ ] **Task 10 (`**`)**: Redesign arrangement for effective space utilization when window shrinks (ref: `image_ae57f434-ad0c-4afd-a216-435691072403`).
- [ ] **Task 11 (`*`)**: Align percentage number in the progress bar to be on the same line as the label text (ref: `image_d7258227-3749-4f9f-bf6b-d81d7d3f3f60`).
- [ ] **Task 12 (`**`)**: Redesign status page + integrate Tibo reset forecasts.
- [x] **Task 13 (`*`)**: Ensure language setting applies globally across the app.
  - *Branch:* `t3/global-language-setting`
  - *Status:* Completed; language setting is normalized, persisted, synchronized between main and renderer, and applied globally across the React UI, Electron shell, and document attributes.
- [x] **Task 14 (`*`)**: Remove automatic app updates UI and logic since this is a local project.
- [x] **Task 15 (`*`)**: Restrict currency options to CNY and USD only.
  - *Branch:* `t3/restrict-currency-options`
  - *Status:* Completed; restricted currency options to CNY and USD across React and HTML settings while ensuring robust default handling, stored settings migration, and backward compatibility.
- [ ] **Task 16 (`*`)**: Remove redundant color theme selector overlapping with the top theme control in settings.
- [ ] **Task 17 (`*`)**: Unify and clean up excessive options in the Theme & Glass Effects settings section.
- [ ] **Task 18 (`*`)**: Delete background image settings.
- [ ] **Task 19 (`*`)**: Unify interface fonts & display fonts settings and fix application so changes take effect.
- [x] **Task 20 (`*`)**: Delete app subscription settings and UI.
  - *Branch:* `t3/remove-subscription-settings-ui`
  - *Status:* Completed; removed subscription settings presentation and navigation wiring.
- [x] **Task 21 (`*`)**: Delete sync strategy settings.
  - *Branch:* `t3/remove-sync-strategy-settings`
  - *Status:* Merged into `feat/t3-ui-ledger` (PR #37).
- [x] **Task 22 (`*`)**: Make settings sidebar active highlight track scroll position (scrollspy) rather than remaining on general.
  - *Branch:* `t3/settings-sidebar-scrollspy`
  - *Status:* Completed; added viewport scrollspy and IntersectionObserver to track and highlight the visible section in settings sidebar.
- [x] **Task 23 (`***`)**: Add a dedicated settings panel for the hover bar.
  - *Branch:* `t3/hover-bar-settings-panel`
  - *Status:* Completed; added dedicated HoverBarSettings panel to React settings navigation with full edge dock configuration.
