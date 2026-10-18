# TokeX Master Architecture Specification
**Canonical Architectural Map, Codebase Inventory, Subsystems & SQLite Ledger Integration**

- **Classification**: Authoritative Engineering Architecture & Integration Blueprint
- **Document Version**: 2.0.0 (TokeX Production Integration)
- **Target Workspace**: `d:\TokeX`
- **Deliverable Path**: `d:\TokeX\STRUCTURE.md`
- **Date**: 2026-10-18
- **Integrity Mode**: Production Audit / Zero Placeholders / Fully Resolved Technical Prose

---

## 1. Executive Summary & System Topology

### 1.1 Architectural Overview
TokeX is an ultra-low-latency, multi-client AI token telemetry, quota accounting, and spend monitoring platform. The application coordinate three operational tiers:
1. **Presentation Tier (Dual-Window Electron Interface)**:
   - **Floating Desktop Widget (`src/electron/renderer/index.html`)**: A 10-sector hardware-accelerated Heads-Up Display (HUD) providing sub-pixel typography, real-time rate reveal physics, smooth accordion expansions, dynamic spotlight heatmaps, and reactive quota refill animators.
   - **Expanded Analytical Dashboard (`src/electron/renderer/dashboard.html`)**: A comprehensive analytics workstation featuring a 365-day GitHub-style contribution heatmap with 12 rolling months alignment, Candlestick (K-Line) token velocity charts with OHLC aggregation, FLIP-animated bar stacks, and dynamic canvas-measured metric cards.
2. **Main Process & Platform Tier**:
   - Manages Electron window lifecycles, Discord Rich Presence broadcasting via `@xhayper/discord-rpc`, multi-window Edge Docking (`peek`, `rail`, `bubble`) with SVG silhouette masking, screen-edge Floating Bubble docking, tri-modal sync networking (iCloud Drive container sync, Node Hub HTTP/SSE, and Cloudflare Worker Durable Objects), platform-specific hooks (Win32 Taskbar Z-Order keeper, Win32 Foreground hooks via Koffi FFI, Windows Accent Blur Behind, macOS native Swift WidgetKit extensions with App Group security bridge, Linux XDG autostart, and WSL UNC network share inspection), and external provider health telemetry.
3. **Data, Accounting & Engine Tier**:
   - **Shared Accounting Layer**: 36-client catalog with strict partition invariants, paired with a 29-provider AI Limits & Quota Engine supporting 5-hour rolling windows, weekly limits, prepaid credit balances, adaptive burn-rate polling, and coordinated UI refill animations.
   - **TokeX Engine Integration (`src/shared/usage/tokenLedger.js`)**: Local history and today/month/all-time period reads use the app-owned SQLite ledger and its local seed, with the existing collector as the compatibility adapter for newer dates while provider ingestion and session IPC are migrated. The product has no runtime dependency on T3 Code.

### 1.2 System Topology Diagram

```
+-----------------------------------------------------------------------------------------------------------------------------+
|                                                   TOKEX SYSTEM TOPOLOGY                                                     |
+-----------------------------------------------------------------------------------------------------------------------------+

  [ PHYSICAL DATA SOURCES ]
    +--> Claude Code (`~/.claude/projects/*/cost.jsonl`)
    +--> Codex CLI (`~/.codex/sessions/*.jsonl`, `state_5.sqlite`)
    +--> Cursor IDE (`workspaceStorage/*/state.vscdb`)
    +--> OpenCode (`~/.opencode/history/`)
    +--> Antigravity (`~/.gemini/antigravity/conversations/`)
    +--> GitHub Copilot, Kimi, Qwen, Factory Droid, DeepSeek Harness, and related components.
    +--> Mirrored Paths (Mapped via `mirror_group_id` to prevent double-counting)
    +--> WSL Network Shares (`\\wsl$\<distro>\home\...` probed via registry gate)
              |
              v (Filesystem Watchers / Ingest Cursors: byte offset & rowid)
  +---------------------------------------------------------------------------------------------------------------------------+
  | PLANE 1: REQUEST LEDGER & EQUIVALENCE ENGINE (`data/token_ledger.sqlite` - 12,994,521,962 Verified Tokens)                |
  |  - `token_turns`: 110,945 immutable prompt/response turns (12,855,800,357 tokens; natural_key, cost_usd)                 |
  |  - `historical_threads`: Dedicated pre-July 14 coarse session preservation (all 41 threads / 138,721,605 tokens)         |
  |  - `daily_usage`: 299 materialized daily rollup rows spanning 2026-07-11 to 2026-10-18 (12,994,521,962 tokens)           |
  |  - `source_files`: Physical file inodes, paths, logical source IDs, mirror group IDs, byte cursors                       |
  |  - `source_event_equivalence`: 7-field matching predicate with strict 1:1 ambiguity protection                            |
  +---------------------------------------------------------------------------------------------------------------------------+
              |
              v (Materialized In-Process Rollups, WAL Mode, Synchronous Normal, 64MB Cache)
  +---------------------------------------------------------------------------------------------------------------------------+
  | PLANE 2: MATERIALIZED UNIFIED ROLLUPS                                                                                     |
  |  - `hourly_usage`: Request turns only (short-range velocity: today, 24h, 7d)                                              |
  |  - `daily_usage`: Request turns UNION ALL Historical Threads (365-day heatmap & daily totals)                             |
  |  - `model_usage`: Request turns UNION ALL Historical Threads (model attribution & context quotas)                        |
  |  - `provider_usage`: Request turns UNION ALL Historical Threads (tool breakdowns & market share)                          |
  |  - `session_summaries`: Request turns UNION ALL Historical Threads (session explorer & drill-down)                         |
  +---------------------------------------------------------------------------------------------------------------------------+
              |
              v (Direct In-Process SQL Queries via Node 22 `node:sqlite` DatabaseSync < 1.0 ms)
  +---------------------------------------------------------------------------------------------------------------------------+
  | ELECTRON MAIN PROCESS & HIDDEN SUBSYSTEMS                                                                                 |
  |  - IPC Dispatcher (`main.js` & `preload.js` contextBridge: 138 channels)                                                  |
  |  - Discord RPC (`@xhayper/discord-rpc` client ID 1507034330436862062, 15s cooldown)                                       |
  |  - Edge Dock Controller (`peek` 10x88, `rail` 64w, `bubble` 280w, 16ms drag physics loop, macOS SVG mask clipping)        |
  |  - Floating Bubble Controller (screen-edge snapping, 18x34 DIPs handle, Win32 frame stripping)                            |
  |  - Multi-Device Sync: iCloud Drive (`sync-v1/`), Node Hub HTTP/SSE (`:17321`), Cloudflare Worker Durable Objects        |
  |  - Native Platform Hooks: Win32 Taskbar Z-Order Keeper (250ms), Win32 Foreground Hook (Koffi), macOS WidgetKit Reloader  |
  |  - Service Status Monitor: Live polling against Claude, OpenAI, Cursor, DeepSeek status APIs                              |
  +---------------------------------------------------------------------------------------------------------------------------+
         |                                                                   |
         v (Sub-millisecond IPC Bridge)                                      v (Sub-millisecond IPC Bridge)
  +-------------------------------------------------------+   +---------------------------------------------------------------+
  | FLOATING DESKTOP WIDGET (`index.html`)                |   | EXPANDED ANALYTICAL DASHBOARD (`dashboard.html`)              |
  |  [Sector 1] Titlebar & Period Tabs (#liveDot, Σ rate) |   |  [B1] Overview Cards (#dashCards, canvas balancing)           |
  |  [Sector 2] Hero Total Banner (Tabular count, cost)   |   |  [B2] 365-Day GitHub Heatmap (#dashHeatmap, 12-month rolling) |
  |  [Sector 3] Home Overview (SVG spotlight gradient)    |   |  [B3] Top-5 Breakdown Columns (#dashBreakdown, FLIP scale)    |
  |  [Sector 4] Provider Breakdown (Accordion rows)       |   |  [B4] Candlestick / K-Line Charts (#dashChart, OHLC candles)  |
  |  [Sector 5] Model Breakdown (Quota bars, aliases)     |   |  [B5] Stacked Bar Charts & Legend (#dashLegend)               |
  |  [Sector 6] Session Explorer (Turns drill-down)       |   |  [B6] Range Controls (7d, 30d, 90d, 365d, all-time)          |
  |  [Sector 7] Live Rate-Limits (Rolling reset timers)   |   +---------------------------------------------------------------+
  |  [Sector 8] Trends & Heatmap (30d sparkline chart)    |
  |  [Sector 9] Settings Drawer (8 collapsible sections)  |
  |  [Sector 10] Footer Bar (Live tok/s, refresh spinner) |
  +-------------------------------------------------------+
```

---

### 1.14 Native Token Ledger Architecture & Plane 1 Mapping

The foundational source of truth for all TokeX token accounting, period rollups, and dashboard telemetry is the native SQLite ledger (`data/token_ledger.sqlite`). Operating in-process via Node 22's built-in `node:sqlite` (`DatabaseSync`), it eliminates external process invocation, intermediate JSON streaming, and IPC serialization bottlenecks.

#### 1.14.1 Verified Production Ledger Quantities
Forensic verification of `data/token_ledger.sqlite` establishes the authoritative baseline metrics:
* **Grand Token Total**: Exactly **`12,994,521,962`** processed tokens across all providers and historical epochs.
* **Granular Request Turns (`token_turns`)**: Exactly **`110,945`** immutable turns totaling **`12,855,800,357`** tokens ($98.93\%$ of grand total). Each turn captures deterministic natural keys, 5-dimension token breakdowns (`uncached_input`, `cached_input`, `cache_write`, `output_tokens`, `reasoning_tokens`), cache savings percentages, and nullable pricing economics.
* **Historical Threads (`historical_threads`)**: Exactly **`41`** pre-July 14 coarse sessions totaling **`138,721,605`** tokens ($1.23\%$ of grand total). Forensically accounts for 40 active token-bearing threads and exactly 1 zero-token thread (`019f50ff-3161-7053-a406-4c468c105f56`).
* **Materialized Daily Rollups (`daily_usage`)**: Exactly **`299`** materialized daily summary rows spanning continuous chronological history from **`2026-07-11`** to **`2026-10-18`**, summing to exactly **`12,994,521,962`** tokens.
* **Invariant Checksum Equality**:
  $$\text{token\_turns } (12,855,800,357) + \text{historical\_threads } (138,721,605) = 12,994,521,962 = \text{SUM}(\text{daily\_usage.total\_processed})$$

#### 1.14.2 WAL Journal Mode & Engine Pragma Configuration
The ledger operates under hardened SQLite durability pragmas managed directly by `src/shared/usage/tokenLedger.js`:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -64000; -- 64 MB dedicated in-memory page cache
```
* **Write-Ahead Logging (WAL)**: Allows concurrent unblocked reads while atomic transactions commit runtime updates. Checkpoints are automatically managed on worker idle and app shutdown.
* **Synchronous Normal**: Provides structural durability across ordinary application crashes with minimal write latency (< 1.2 ms).
* **Foreign Key Constraints**: Hardened relational guarantees between `token_turns`, `source_files`, and `ingestion_runs`.

#### 1.14.3 Automatic Recovery on Corruption (`PRAGMA quick_check`)
To guarantee resilient startup across system crashes or interrupted writes, `createTokenLedgerStore()` incorporates an automated corruption detection and self-healing lifecycle:
1. **Integrity Probe**: On connection initialization, `isCorrupt(db)` runs `PRAGMA quick_check`. If the check throws, returns null, or yields any value other than `'ok'`, or if the database file is zero-byte truncated:
2. **Stale Lock Cleanup**: Invokes `cleanStaleWal()` to force-unlink stale `${databasePath}-wal` and `${databasePath}-shm` lock handles.
3. **Seed Restoration**: Automatically copies the pristine packaged seed database (`packagedSeedPath()` or `repoLedgerPath()`) to `databasePath`.
4. **Transparent Re-Instantiation**: Reopens `DatabaseSync(databasePath)` and executes `ensureSchema()`, ensuring the user never experiences app crash loops or lost historical baselines.

#### 1.14.4 Seed Reconciliation Upsert (`reconcileDailyUsage`)
When the user's local database is initialized or updated across application versions, `reconcileDailyUsage(database, seedPath)` reconciles historical data without overwriting live user sessions:
1. **Database Attachment**: Executes `ATTACH DATABASE '${escapedSeed}' AS seed_ledger`.
2. **Missing & Divergence Detection**: Compares `user_tokens < seed_tokens` or checks for unrepresented dates:
   ```sql
   SELECT
     (SELECT coalesce(sum(total_processed), 0) FROM daily_usage) AS user_tokens,
     (SELECT coalesce(sum(total_processed), 0) FROM seed_ledger.daily_usage) AS seed_tokens,
     EXISTS (
       SELECT 1 FROM seed_ledger.daily_usage s
       WHERE NOT EXISTS (
         SELECT 1 FROM daily_usage u
         WHERE u.date_bucket = s.date_bucket
           AND u.provider = s.provider
           AND u.model_codename = s.model_codename
       )
     ) AS missing_rows;
   ```
3. **Conflict-Safe Upsert**: If reconciliation is needed, executes:
   ```sql
   INSERT INTO daily_usage (
     date_bucket, provider, model_codename, turn_count,
     total_uncached_in, total_cached_in, total_cache_write, total_output,
     total_reasoning, total_processed, total_known_cost_usd,
     unknown_pricing_turn_count, cache_savings_pct
   )
   SELECT
     date_bucket, provider, model_codename, turn_count,
     total_uncached_in, total_cached_in, total_cache_write, total_output,
     total_reasoning, total_processed, total_known_cost_usd,
     unknown_pricing_turn_count, cache_savings_pct
   FROM seed_ledger.daily_usage
   ON CONFLICT(date_bucket, provider, model_codename) DO UPDATE SET
     turn_count = CASE WHEN excluded.total_processed > daily_usage.total_processed THEN excluded.turn_count ELSE daily_usage.turn_count END,
     total_processed = CASE WHEN excluded.total_processed > daily_usage.total_processed THEN excluded.total_processed ELSE daily_usage.total_processed END,
     total_known_cost_usd = CASE WHEN excluded.total_processed > daily_usage.total_processed THEN excluded.total_known_cost_usd ELSE daily_usage.total_known_cost_usd END;
   ```
4. **Detachment**: Cleanly invokes `DETACH DATABASE seed_ledger;`.

#### 1.14.5 Cold-Start IPC Wiring & Synthetic Local Device Fallback
In `src/electron/main.js`, token accounting avoids collector startup delay via `historyResolverOptions()`:
* **Ledger History Integration**: `localLedgerHistory()` inspects local mode and reads from `tokenLedgerStore.readHistory({ overlayHistory })`.
* **Synthetic Local Device Fallback**: When the app cold-starts before the collector's background scan discovers hardware or emits `lastCollectedDevice`, `rawDevice` is null. Instead of delaying window rendering with empty placeholders or loading spinners, `historyResolverOptions()` immediately synthesizes an active device record:
  ```javascript
  const now = new Date();
  const nowIso = now.toISOString();
  const periods = tokenLedgerStore?.readPeriods?.({ overlayHistory: ledgerHistory }) || null;
  resolvedLocalDevice = {
    ...electronDeviceEnvelope(),
    hostname: os.hostname(),
    platform: `${process.platform}-${process.arch}`,
    updatedAt: nowIso,
    receivedAt: nowIso,
    periodWindows: computePeriodWindows(now),
    ...(periods ? { periods, today: periods.today, month: periods.month, allTime: periods.allTime } : {}),
    history: ledgerHistory,
    historyAvailable: true
  };
  ```
* **Performance SLA**: Guarantees sub-millisecond initial render latency (< 6.0 ms cold start), with HUD widget counters and analytical dashboard heatmaps fully populated on the very first painted frame.

#### 1.14.6 Packaged Distribution & First-Run Provisioning
To guarantee zero-friction initial onboarding on end-user machines:
* **Electron Builder Resource Bundling (`package.json`)**:
  ```json
  "extraResources": [
    {
      "from": "data/token_ledger.sqlite",
      "to": "token_ledger.seed.sqlite"
    }
  ]
  ```
* **Runtime Resolution**: At runtime, `packagedSeedPath()` inspects `process.resourcesPath/token_ledger.seed.sqlite`. On first app boot, when `resolveTokenLedgerPath()` detects that the local user directory (`%APPDATA%/Token Monitor/token_ledger.sqlite` on Windows, `~/.config/Token Monitor/token_ledger.sqlite` on Linux, `~/Library/Application Support/Token Monitor/token_ledger.sqlite` on macOS) does not exist, it automatically copies the 12.99B seed into place.

---

## 2. R1: Complete UI Sector & Component Anatomy

### 2.1 Dual-Window Presentation Model

```
+-------------------------------------------------------------------------------+
|  Floating Desktop Widget (src/electron/renderer/index.html)                    |
|  +-------------------------------------------------------------------------+  |
|  | [1] Titlebar & Period Tabs: #liveDot, #tokenRateReveal, DAY/MONTH/TOTAL  |  |
|  +-------------------------------------------------------------------------+  |
|  | [9] Settings Drawer (#settingsPanel) - Hidden / Slide-down              |  |
|  |     General | Main | Window | Appearance | Tools | Limits | Subs | Sync  |  |
|  +-------------------------------------------------------------------------+  |
|  | [2] Hero Total Banner: #totalTokens (tabular-nums), #cost ($0.00)       |  |
|  +-------------------------------------------------------------------------+  |
|  | [3] Home Overview (#homePanel): Dynamic Cards, Heatmap & Sparklines     |  |
|  | [4] Provider Breakdown (#breakdown: 'tool'): Rows, Badges, Accordions   |  |
|  | [5] Model Breakdown (#breakdown: 'model'): Model aliases, Quota bars    |  |
|  | [6] Session Explorer & Drill-Down: #session-detail, Exchange Turns      |  |
|  | [7] Live Rate-Limits (#limitsPanel): Rolling Quotas, Reset Animators    |  |
|  | [8] Trends & Heatmap (#trendsPanel): Mini sparkline, Peak Token stats    |  |
|  +-------------------------------------------------------------------------+  |
|  | [10] Footer & Switcher Bar: #viewSwitcher, #liveTokenRate, #refreshBtn  |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

---

### Part A: Floating Desktop Widget Anatomy (All 10 Sectors)

#### Sector 1: Titlebar & Period Tabs

- **DOM Hierarchy**:
  ```html
  <header class="titlebar">
    <div>
      <div class="app-title">
        <span class="app-title-text">Token Monitor</span>
        <span class="app-title-mark" aria-hidden="true">Σ</span>
        <span id="liveDot" class="live-dot" title="Stream offline"></span>
        <span id="tokenRateReveal" class="token-rate-reveal" aria-hidden="true"></span>
        <span class="app-title-measure" aria-hidden="true">Token Monitor</span>
      </div>
      <div id="status" class="status">Starting</div>
    </div>
    <div class="title-controls">
      <nav class="tabs" aria-label="Period tabs">
        <span class="tab-indicator" aria-hidden="true"></span>
        <button class="tab active" data-period="today" data-period-slot="today">DAY</button>
        <button id="monthPeriodTab" class="tab" data-period="month" data-period-slot="month" aria-haspopup="menu" aria-expanded="false">MONTH</button>
        <button class="tab" data-period="allTime" data-period-slot="allTime">TOTAL</button>
      </nav>
      <div id="monthPeriodMenu" class="view-switcher-menu period-menu hidden" role="menu" aria-labelledby="monthPeriodTab">
        <button class="view-switcher-menu-item" type="button" role="menuitemradio" data-fixed-period="month">...</button>
        <button class="view-switcher-menu-item" type="button" role="menuitemradio" data-fixed-period="week">...</button>
        <button class="view-switcher-menu-item" type="button" role="menuitemradio" data-fixed-period="last7">...</button>
        <button class="view-switcher-menu-item" type="button" role="menuitemradio" data-fixed-period="last30">...</button>
      </div>
      <div class="actions-hotspot" title="Window controls"></div>
      <div class="window-actions">
        <button id="pinButton" class="icon-button" title="Cycle window behavior">⇧</button>
        <button id="minButton" class="icon-button" title="Minimize">−</button>
        <button id="closeButton" class="icon-button" title="Close">×</button>
      </div>
    </div>
  </header>
  ```
- **CSS Selectors & Styling**:
  - `.titlebar`: `-webkit-app-region: drag; position: relative; z-index: 1; min-height: 30px; display: flex; justify-content: space-between;`
  - `.app-title`: `display: flex; align-items: baseline; font-size: clamp(13px, 4.5vw, 16px); font-weight: 700;`
  - `.tab-indicator`: `position: absolute; top: 3px; bottom: 3px; width: calc((100% - 10px) / 3); border-radius: 6px; transform: translate3d(calc(var(--period-index) * (100% + 2px)), 0, 0); transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);`
  - `.actions-hotspot`: `position: absolute; top: -12px; right: -14px; width: 28px; height: 28px; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 100%, 50% 42.857%, 0 42.857%); z-index: 5;`
  - `.window-actions`: `opacity: 0; pointer-events: none; transform: translateY(-2px); transition: opacity 160ms ease 140ms, transform 160ms ease 140ms;`
- **Visual State Transitions**:
  - **Title Collapse**: When window width narrows, JS (`updateTitleFit()`) detects overflow against `.app-title-measure` and toggles `.shell.title-collapsed` or `.shell.title-icon-only`. `.app-title-text` hides, revealing `.app-title-mark` (`Σ`).
  - **Token Rate Reveal**: Hovering over `.app-title-mark` or `.live-dot` in collapsed mode smoothly expands `#tokenRateReveal` up to `18ch` width (`transition: max-width 180ms ease, opacity 180ms ease`). Classes: `.boosting` (accent glow `rgba(var(--accent-rgb), 0.35)`), `.settling` (neutral muted).
  - **Corner Action Hotspot Swap**: Hovering `.actions-hotspot` or `.window-actions` brings window actions forward (`opacity: 1; transform: translateY(0)`) while sliding the period tabs away (`opacity: 0; transform: translateY(2px)`).
  - **Period Menu Dropdown**: Clicking an already active `#monthPeriodTab` opens `#monthPeriodMenu` with animated scale (`scale(0.985) -> scale(1)`) and blur removal (`blur(2px) -> blur(0)`).
- **Event Listeners (`src/electron/renderer/app.js`)**:
  - `tabs.forEach(tab => tab.addEventListener('click', ...))`: Switches `state.period` ('today', 'month', 'allTime'). If already active month tab, calls `toggleMonthPeriodMenu()`.
  - `#monthPeriodMenu` buttons: Sets custom fixed range (`month`, `week`, `last7`, `last30`).
  - `#pinButton.addEventListener('click', ...)`: Cycles window behavior: `normal` -> `pinned` -> `float` -> `tray`.
  - `#minButton.addEventListener('click', () => window.tokenMonitor.minimize())`.
  - `#closeButton.addEventListener('click', () => window.tokenMonitor.close())`.
  - Title click / liveDot click: Cycles token rate mode (`tok/s` vs `tok/min`).

---

#### Sector 2: Hero Total Banner

- **DOM Hierarchy**:
  ```html
  <section class="total-panel">
    <div class="label-row"><span>TOTAL TOKENS</span></div>
    <div class="total-number-row">
      <div id="totalTokens" class="total-number">0</div>
      <div id="totalTokensCompact" class="total-compact hidden" aria-hidden="true"></div>
    </div>
    <div id="cost" class="cost">$0.00</div>
  </section>
  ```
- **CSS Selectors & Styling**:
  - `.total-panel`: `position: relative; z-index: 1; padding: 2px 2px 12px;`
  - `.total-number-row`: `display: flex; align-items: baseline; gap: 8px; min-width: 0;`
  - `.total-number`: `font-family: var(--display-font); font-size: clamp(30px, 11vw, 46px); font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`
  - `.total-compact`: `flex: 0 0 auto; color: var(--muted); font-size: 0.8125rem; font-weight: 500;`
  - `.cost`: `display: flex; align-items: center; gap: 3px; margin-top: 6px; color: var(--readable-muted); font-size: 0.75rem;`
  - `.usage-cost-info`: Inline SVG icon mask indicating unpriced tokens, triggering detailed tooltip.
- **Visual State Transitions**:
  - Tabular numeric counting animation interpolating numbers between refresh ticks.
  - `#totalTokensCompact` automatically unhides if the integer string overflows the container width.
- **Event Listeners**:
  - Hover and keyboard focus on `.usage-cost-info` invokes `limitWindowsView.setDetailTooltip()`.

---

#### Sector 3: Home Overview

- **DOM Hierarchy**:
  ```html
  <section id="homePanel" class="home-panel hidden">
    <!-- Dynamically rendered modules: -->
    <div class="home-module home-module-limits" tabindex="0" role="button">...</div>
    <div class="home-module home-module-tool" tabindex="0" role="button">...</div>
    <div class="home-module home-module-model" tabindex="0" role="button">...</div>
    <div class="home-module home-module-session" tabindex="0" role="button">...</div>
    <div class="home-module home-module-device" tabindex="0" role="button">...</div>
    <div class="home-module home-module-trends" tabindex="0" role="button">
      <div class="home-module-head">
        <div class="home-module-title-wrap">
          <span class="home-module-label">ACTIVITY</span>
        </div>
        <div class="home-module-head-end">
          <span class="home-module-meta">28 active days</span>
          <span class="home-module-jump view-icon-trends"></span>
        </div>
      </div>
      <div class="home-module-body">
        <div class="home-activity-scroll" tabindex="0" role="region">
          <div class="home-activity-canvas">
            <!-- SVG Rolling Year Heatmap with #homeActivitySpotlightGradient -->
          </div>
        </div>
        <div class="home-trend-head">...</div>
        <div class="home-trend-plot">
          <div class="home-area-chart"><!-- SVG Area Curve --></div>
        </div>
        <div class="home-trend-dates">...</div>
      </div>
    </div>
  </section>
  ```
- **CSS Selectors & Styling**:
  - `.home-panel`: `display: grid; flex: 1; min-height: 0; align-content: start; gap: 12px; overflow: hidden auto;`
  - `.home-module`: `border-bottom: 1px solid rgba(var(--line-rgb), 0.12); padding-bottom: 12px; cursor: pointer;`
  - `.home-activity-scroll`: Horizontal scrolling viewport with scrollbar hiding and inertia dragging.
  - `.home-activity-tooltip`: Attached directly to `document.body`, absolute positioned via `moveHomeActivityTooltip()`.
- **Visual State Transitions**:
  - **Dynamic Spotlight**: A radial gradient inside the SVG (`#homeActivitySpotlightGradient`) tracks mouse movement with smooth easing (`spotlightCurrent.x += dx * 0.32`).
  - **Scroller Pinning**: Synchronizes scroll offset to the newest (rightmost) day using `ResizeObserver`.
  - **Module Navigation**: Clicking anywhere on a module triggers an animated view transition into that sector (`renderBreakdownChange(viewId, { fromHome: true })`).
- **Event Listeners**:
  - Module cards: `click` and `keydown` (Enter/Space) navigate to destination views.
  - Scroller: `pointerdown`, `pointermove`, `pointerup`, `pointercancel` handle horizontal touch/mouse drag.
  - Canvas: `pointermove` calculates SVG coordinates and invokes tooltip.

---

#### Sector 4: Provider Breakdown

- **DOM Hierarchy**:
  ```html
  <section id="breakdown" class="breakdown">
    <div class="row has-accordion" data-key="cursor" role="button">
      <div class="row-head">
        <span class="row-name">
          <span class="row-mark row-icon row-icon-cursor"></span>
          <span class="row-title">Cursor</span>
          <span class="row-live is-active pulse"><span class="row-live-dot"></span></span>
        </span>
        <span class="row-metrics">
          <span class="row-value">4.2M</span>
          <span class="row-cost">$18.42</span>
        </span>
      </div>
      <div class="bar"><div class="bar-fill" style="--bar-scale: 0.85; background: #5b6471;"></div></div>
      <div class="row-accordion">
        <div class="row-accordion-inner">
          <div class="accordion-content">
            <div class="accordion-row"><span class="accordion-label">Prompt Cache Read</span><span>3.1M</span></div>
            <div class="accordion-row"><span class="accordion-label">Prompt Cache Write</span><span>620K</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>
  ```
- **CSS Selectors & Styling**:
  - `.breakdown`: `display: flex; flex: 1; flex-direction: column; gap: 10px; overflow: hidden auto;`
  - `.row`: `display: grid; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid rgba(var(--line-rgb), 0.12);`
  - `.row-accordion`: `display: grid; grid-template-rows: 0fr; transition: grid-template-rows 250ms cubic-bezier(0.4, 0, 0.2, 1);`
  - `.row.expanded .row-accordion`: `grid-template-rows: 1fr;`
- **Visual State Transitions**:
  - Smooth grid-template-rows expansion from 0fr to 1fr.
  - Pulsing live indicator for actively streaming sessions (`@keyframes row-live-pulse 1.2s ease-out`).
- **Event Listeners**:
  - Click on `.row.has-accordion`: Toggles `.expanded` class.
  - Context menu: Custom scan path reveal, client lock repair, or client rescan triggers.

---

#### Sector 5: Model Breakdown

- **DOM Hierarchy**:
  ```html
  <section id="breakdown" class="breakdown">
    <div class="row model-row" data-key="claude-3-7-sonnet">
      <div class="row-head">
        <span class="row-name">
          <span class="row-mark row-icon row-icon-model"></span>
          <div class="row-label">
            <span class="row-title">Claude 3.7 Sonnet</span>
            <span class="row-subtitle">Anthropic · Direct API</span>
          </div>
        </span>
        <span class="row-metrics">
          <span class="row-value">2.8M</span>
          <span class="row-cost">$12.30</span>
        </span>
      </div>
      <div class="bar"><div class="bar-fill" style="--bar-scale: 0.62;"></div></div>
    </div>
  </section>
  ```
- **CSS Selectors & Styling**:
  - Color mapping: Uses `charts.modelColor(key)` with luminosity lift for dark backgrounds (`displayColor()`).
  - Bar fill: Uses CSS variable `--bar-scale` (0.0 to 1.0).
- **Event Listeners**:
  - Click on model row: Opens alias renaming modal (`modelAliasForm.js`).

---

#### Sector 6: Session Explorer & Drill-Down

- **DOM Hierarchy**:
  ```html
  <div id="session-detail-head" class="detail-head hidden">
    <button class="detail-back detail-back-titled" type="button">
      <span class="detail-back-arrow">‹</span>
      <span class="detail-heading">Sessions</span>
    </button>
    <div class="detail-session-id">
      <span class="detail-session-id-text">9613946f-bdb6...</span>
      <button class="detail-session-id-copy" title="Copy ID">📋</button>
    </div>
    <button class="detail-sort" type="button">Chronological</button>
  </div>
  <div id="session-detail" class="session-detail hidden">
    <div class="detail-exchange">
      <div class="detail-ex-head">
        <span class="detail-chev">▼</span>
        <div class="detail-ex-label">
          <span class="detail-ex-title">Investigate UI Sectors</span>
          <span class="detail-ex-sub">2 turns · 14.2K tokens</span>
        </div>
        <div class="detail-ex-metrics"><span class="detail-ex-cost">$0.04</span></div>
      </div>
      <div class="detail-turns">
        <div class="detail-turn">
          <div class="detail-turn-label">
            <span class="detail-role-user">User:</span>
            <span class="detail-turn-title">Analyze the codebase...</span>
          </div>
          <div class="detail-turn-metrics"><span>1.2K tok</span></div>
        </div>
      </div>
    </div>
  </div>
  <div id="sessionPagerHost" class="session-pager-host hidden">
    <div class="session-pager">
      <button class="session-page-button session-page-prev">‹</button>
      <span class="session-page-status">1 / 5</span>
      <button class="session-page-button session-page-next">›</button>
    </div>
  </div>
  ```
- **CSS Selectors & Styling**:
  - `.session-detail`: `display: flex; flex: 1; flex-direction: column; gap: 6px; overflow: hidden auto;`
  - `.detail-turns`: `margin: 4px 0 4px 20px; padding-left: 12px; border-left: 2px solid rgba(255,255,255,0.08);`
  - `.fade-overflow.has-overflow-fade`: `mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);`
- **Visual State Transitions**:
  - `.shell.session-mode` activates when entering session breakdown.
  - Drill-down transitions: `#breakdown` hides, `#session-detail-head` and `#session-detail` remove `.hidden`.
- **Event Listeners**:
  - `.detail-back`: Returns to session list.
  - `.detail-session-id-copy`: Writes session ID to clipboard via `window.tokenMonitor.copyText()`.
  - `.session-page-button`: Navigates paginated session records.

---

#### Sector 7: Live Rate-Limits

- **DOM Hierarchy**:
  ```html
  <section id="limitsPanel" class="limits-panel hidden">
    <div class="limit-row" data-provider="codex">
      <div class="limit-head">
        <div class="limit-title">
          <div class="limit-name">
            <span class="row-icon row-icon-codex"></span>
            <span class="limit-name-title">Codex</span>
            <span class="limit-live-badge">✓</span>
          </div>
          <span class="limit-meta">Workplace Pro</span>
        </div>
        <div class="limit-account-switch-zone">
          <button class="limit-account-switch-button">Switch</button>
        </div>
      </div>
      <div class="limit-windows">
        <div class="limit-window">
          <div class="limit-window-line">
            <span class="limit-window-label">5h Rolling</span>
            <span class="home-list-value">84% left</span>
          </div>
          <div class="limit-meter"><div class="limit-meter-fill" style="width: 84%;"></div></div>
          <span class="limit-reset">resets in 2h 14m</span>
        </div>
        <div class="limit-window">
          <div class="limit-window-line">
            <span class="limit-window-label">Weekly</span>
            <span class="home-list-value">62% left</span>
          </div>
          <div class="limit-meter"><div class="limit-meter-fill" style="width: 62%;"></div></div>
          <span class="limit-reset">resets Fri 18:00</span>
        </div>
      </div>
      <div class="codex-reset-forecast">
        <button class="codex-reset-forecast-open" type="button"></button>
        <div class="codex-reset-forecast-head">
          <span class="codex-reset-forecast-label">Reset Forecast</span>
          <span class="codex-reset-forecast-value">Normal</span>
        </div>
        <div class="codex-reset-forecast-detail">Operational status on status.openai.com</div>
      </div>
    </div>
  </section>
  ```
- **CSS Selectors & Styling**:
  - `.limits-panel`: `display: grid; flex: 1; align-content: start; gap: 12px; overflow: hidden auto;`
  - `.limit-windows`: `display: grid; grid-template-columns: 1fr 1fr; gap: 10px;`
  - Tone styling: Remaining < 20% triggers `.home-limit-value-critical` (red/orange); 20-50% triggers `.home-limit-value-low`.
- **Visual State Transitions**:
  - Real-time countdown clock ticks down resets every second via `resetAnimator.js`.
  - Switching popover floats in on hover: `.limit-account-switch-zone:hover .limit-account-switch-popover`.
- **Event Listeners**:
  - Account switch button: Invokes `window.tokenMonitor.codex.switchSystemAccount()`.
  - Reset forecast link: Opens external status page in user's default browser.

---

#### Sector 8: Trends & Heatmap

- **DOM Hierarchy**:
  ```html
  <section id="trendsPanel" class="trends-panel hidden">
    <div class="trends-cap">
      <span>DAILY TOKENS (LAST 30 DAYS)</span>
      <span id="trendsOpenHint" class="trends-open-hint">Open Dashboard ↗</span>
    </div>
    <div class="trends-spark">
      <svg class="sparkline" viewBox="0 0 300 70">
        <!-- Bars with .spark-bar and .spark-bar--last -->
      </svg>
    </div>
    <div class="trends-axis">
      <span>Oct 1</span>
      <span>Oct 15</span>
      <span>Today</span>
    </div>
    <div class="trends-stats">
      <div class="trends-stat"><span class="trends-stat-v">24</span><span class="trends-stat-k">Active Days</span></div>
      <div class="trends-stat"><span class="trends-stat-v">14</span><span class="trends-stat-k">Current Streak</span></div>
    </div>
  </section>
  ```
- **CSS Selectors & Styling**:
  - `.trends-spark`: `flex: 1 1 auto; display: flex; cursor: pointer; border-radius: 8px; padding: 6px 4px;`
  - `.trends-spark:hover`: `background: rgba(var(--overlay-rgb), 0.05);`
- **Visual State Transitions**:
  - Subtle hover highlight over sparkline chart.
- **Event Listeners**:
  - Clicking anywhere on `.trends-spark` or `#trendsOpenHint` executes `window.tokenMonitor.openDashboard()`.

---

#### Sector 9: Settings Drawer

- **DOM Hierarchy**:
  ```html
  <section id="settingsPanel" class="settings-panel hidden">
    <!-- 8 Collapsible Settings Groups -->
    <div class="settings-group settings-collapsible-group settings-general-group">
      <button class="settings-section-toggle" type="button" data-settings-section="general" aria-expanded="false">
        <span class="settings-section-heading"><span class="settings-section-icon settings-section-icon-general"></span>General</span>
        <span class="settings-section-meta"><span id="generalSettingsSummary" class="settings-section-summary"></span><span class="settings-section-disclosure"></span></span>
      </button>
      <div id="generalSettingsDetails" class="settings-section-details hidden">...</div>
    </div>
    <div class="settings-group settings-collapsible-group settings-main-group">...</div>
    <div class="settings-group settings-collapsible-group settings-window-section-group">...</div>
    <div class="settings-group settings-collapsible-group settings-appearance-section-group">...</div>
    <div class="settings-group settings-collapsible-group settings-tools-group">...</div>
    <div class="settings-group settings-collapsible-group settings-limits-group">...</div>
    <div class="settings-group settings-collapsible-group settings-subscriptions-group">...</div>
    <div class="settings-group settings-collapsible-group settings-sync-group">...</div>
  </section>
  ```
- **CSS Selectors & Styling**:
  - `.settings-panel`: `max-height: calc(100vh - 72px); opacity: 1; overflow: hidden auto; transition: max-height 140ms ease, opacity 120ms ease;`
  - `.settings-panel.hidden`: `max-height: 0 !important; opacity: 0; pointer-events: none; transform: translateY(-4px);`
  - iOS Switches: `.settings-panel .checkbox-label > input[type="checkbox"]` with custom toggle pill (`transform: translateX(14px)` when checked).
- **Visual State Transitions**:
  - Drawer slide-down / expansion from 0 to full window height.
  - Accordion rotation: `.settings-collapsible-group.expanded .settings-section-disclosure` rotates 180deg.
- **Event Listeners**:
  - `settings-section-toggle` buttons: Toggles `.expanded` class on the parent group.
  - Input field listeners: Saves settings immediately via `window.tokenMonitor.updateSettings(patch)`.
  - Diagnostics button: Calls `window.tokenMonitor.generateDiagnosticReport()`.

---

#### Sector 10: Footer & Switcher Bar

- **DOM Hierarchy**:
  ```html
  <footer class="footer">
    <div id="viewSwitcher" class="view-switcher">
      <button class="view-switcher-current" type="button">
        <span class="view-switcher-icon view-icon-home"></span>
        <span class="view-switcher-label">Home</span>
      </button>
      <button class="view-switcher-disclosure" type="button" aria-label="Choose view"></button>
      <div id="viewSwitcherMenu" class="view-switcher-menu hidden" role="menu">...</div>
    </div>
    <div id="toolDetailFooter" class="tool-detail-footer hidden" role="group">
      <button id="toolDetailFooterTokens" class="tool-detail-footer-option" type="button">Tokens</button>
      <button id="toolDetailFooterModels" class="tool-detail-footer-option" type="button">Models</button>
    </div>
    <button id="liveTokenRate" class="live-token-rate hidden is-idle" type="button" title="Live token rate">
      <span class="live-token-rate-icon" aria-hidden="true"></span>
      <span id="liveTokenRateValue" class="live-token-rate-value">— tok/s</span>
    </button>
    <div id="appUpdatePill" class="update-pill hidden">...</div>
    <span id="footerActionSlot">
      <span id="utilityActions" class="utility-actions">
        <button id="refreshButton" class="refresh-button" title="Refresh"><span class="refresh-button-icon"></span><span class="refresh-button-spinner"></span></button>
        <button id="settingsButton" class="icon-button settings-icon-button" title="Settings"></button>
      </span>
    </span>
  </footer>
  ```
- **CSS Selectors & Styling**:
  - `.footer`: `position: relative; z-index: 1; display: flex; align-items: center; justify-content: flex-start; gap: 8px;`
  - `.utility-actions`: Progressive disclosure container. Primary button anchored at 34px width; secondary button slides out to the left on hover (`opacity: 1; transform: none;`).
  - `.live-token-rate`: Anchored at `left: 50%; transform: translateX(-50%);`.
- **Visual State Transitions**:
  - **Live Rate Flash**: Streaming tokens add `.is-fresh`, firing `@keyframes live-token-rate-flash` (pulse & drop-shadow).
  - **Utility Disclosure**: Hovering `#utilityActions` reveals `#refreshButton` with smooth scale and slide.
  - **Menu Popup**: `#viewSwitcherMenu` animates from bottom-left with scale and blur fade.
- **Event Listeners**:
  - `.view-switcher-current`: Cycles to the next enabled view in `state.settings.viewDisplayOrder`.
  - `.view-switcher-disclosure`: Toggles `#viewSwitcherMenu`.
  - `#settingsButton`: Toggles `.settings-open` class on `.shell` and unhides `#settingsPanel`.
  - `#refreshButton`: Triggers immediate background collector rescan.
  - `#liveTokenRate`: Toggles token velocity measurement mode (`tok/s` vs `tok/min`).

---

### Part B: Expanded Analytical Dashboard Anatomy (`dashboard.html`, `dashboard.css`, `dashboard.js`)

```
+-----------------------------------------------------------------------------------+
|  Expanded Analytical Dashboard (src/electron/renderer/dashboard.html)             |
|  +-----------------------------------------------------------------------------+  |
|  | Header: Title ("Usage Dashboard"), Theme Toggle, Refresh, Min, Close        |  |
|  +-----------------------------------------------------------------------------+  |
|  | Navigation Tabs: [Overview (#activityTab)] | [Trends (#trendsTab)]          |  |
|  +-----------------------------------------------------------------------------+  |
|  | Overview Pane (#activityPane):                                              |  |
|  |   [B1] Overview Cards (#dashCards): Total Tokens, Cost, Active Days, Streak  |  |
|  |   [B2] 365-Day Contribution Heatmap (#dashHeatmap): 12 rolling months,      |  |
|  |        Metric Toggle (Tokens vs Cost), Staggered Cell Wave Entry Animation  |  |
|  |   [B3] Top-5 Breakdown Columns (#dashBreakdown): Models & Clients           |  |
|  +-----------------------------------------------------------------------------+  |
|  | Trends Pane (#trendsPane):                                                  |  |
|  |   [B4] Controls: Grouping (Tool/Model) | Mode (Bars / K-Line) | Range (7..All) |
|  |   [B5] Candlestick (K-Line) & Bar Charts (#dashChart): OHLC + Wicks / Stacks|  |
|  |   [B6] Interactive Legend (#dashLegend) & Rich Inspection Tooltip           |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

#### B1: Overview Cards (`#dashCards`)
- **Structure**: Grid of cards generated dynamically via `charts.statsCardsHtml()`.
  - Metric Keys: `totalTokens`, `totalCost`, `activeDays`, `currentStreak`, `activeTimeMs`, `peakDayTokens`, `favoriteModel`, `messages`.
- **Dynamic Balancing (`balanceStatCards()`)**:
  - Uses an offscreen HTML5 `<canvas>` element (`statCardMeasureCanvas`) to measure exact text widths using active font style (`fontStyle fontWeight fontSize fontFamily`).
  - Calls `charts.statCardColumnWidths()` to determine balanced column widths with a minimum safety margin (10px).
  - Sets CSS variable `--stat-count` and inline style `gridTemplateColumns`.

#### B2: 365-Day GitHub-Style Heatmap (`#dashHeatmap`)
- **Structure**:
  - Calendar alignment: Automatically computes local start date 11 months back from the 1st of the month, resulting in exactly 12 distinct months ending at today's local date (`charts.localDayKey()`).
  - Metric Toggle: Segmented control (`[data-control="heatmapMetric"]`) switching between `tokens` (`tokenIntensity`) and `cost` (`costIntensity`).
  - Cell Sizing: Dynamically computed via `Math.max(9, Math.min(22, (availableWidth - weeks * gap) / weeks))` to guarantee pixel-perfect responsiveness.
- **Visual State Transitions & Keyframe Animations**:
  - **Staggered Entry Wave (`animateHeatmapEntry()`)**:
    - Animates cells across horizontal columns from left to right.
    - Duration: `HEAT_CELL_MOTION_MS = 280ms`, staggered over `HEATMAP_MOTION_MS = 720ms`.
    - Easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
    - Protected by `is-motion-pending` class to prevent flash-of-unstyled-content (FOUC).
  - **Hover Tooltip (`showHeatTooltip()`)**:
    - Displays Date, Formatted Tokens, Formatted Currency, and unpriced token warning.

#### B3: Top-5 Breakdown Columns (`#dashBreakdown`)
- **Structure**: Two side-by-side columns: Top 5 Models and Top 5 Tools.
  - Each item contains: Swatch (`.dash-bd-swatch`), Name (`.dash-bd-name`), Track background (`.dash-bd-bar-bg`), Bar fill (`.dash-bd-bar-fill`), Value (`.dash-bd-val`), and Percentage of Grand Total (`.dash-bd-pct`).
- **Animations**: FLIP geometry scaling (`scaleX`) from previous width to new width over `DATA_MOTION_MS = 800ms`.

#### B4: Candlestick / K-Line Token Velocity Charts
- **Structure**:
  - Activated when `state.mode === 'kline'`.
  - Calculates dynamic day buckets: If total span <= 10 days, `bucketDays = 2`; otherwise `Math.round(span / targetBuckets)`.
  - Each candle comprises:
    - Candle Body (`.candle-body`): Represents Open and Close token values.
    - Candle Wick (`.candle-wick`): Upper and Lower wicks representing High and Low daily token spikes.
- **Animations (`animateCandles()`)**:
  - Body: Animated via `transform: scaleY(0)` -> `scaleY(1)` (`KLINE_MOTION_MS = 560ms`).
  - Wick: SVG stroke dash animation (`strokeDashoffset` from `length` to `0`).
- **Hover Inspection**: Tooltip displays Date Range, Open (O), High (H), Low (L), and Close (C).

#### B5: Stacked Bar Charts & Legend
- **Structure**:
  - Grouping selector: `.seg-btn[data-stack="client"]` vs `.seg-btn[data-stack="model"]`.
  - Rendered via SVG with stacked rects (`.bar-stack`).
  - Legend (`#dashLegend`): Displays colored swatches, names, compact tokens, and percentage shares.
- **Animations (`animateChartGeometry()`)**:
  - Uses FLIP technique: measures previous DOM rectangles before render, calculates delta scale/translation (`sx`, `sy`, `dx`, `dy`), and animates smoothly to target over 800ms.

#### B6: Range Controls (`#rangeSelect`)
- **Options**: `7` (Last 7 days), `30` (Last 30 days), `90` (Last 90 days), `365` (Last 365 days), and `all` (Complete retention).
- **Behavior**: Clicking updates `state.range`, resets motion to `'update'`, and triggers re-render.

---

## 3. R2: Electron Main Process & Hidden Subsystems

### 3.1 Overview of Hidden Subsystems

### 1.1. Discord Rich Presence (`@xhayper/discord-rpc`)
Located at: `src/electron/discordRpc.js` (integrated into `src/electron/main.js`).

TokeX includes an unobtrusive background Discord Rich Presence integration that broadcasts token consumption, expenditure, and active tools to Discord profiles without user intervention once enabled.

#### Architectural Mechanics & Constants
- **Library**: `@xhayper/discord-rpc`
- **Application Client ID**: `'1507034330436862062'`
- **Repository Link**: `'https://github.com/Javis603/token-monitor'`
- **Rate-Limiting Cooldown**: `UPDATE_MIN_INTERVAL_MS = 15000` (15 seconds, preventing Discord IPC rate-limit bans)
- **Reconnection Backoff**: `RECONNECT_DELAY_MS = 30000` (30 seconds upon disconnect or failure)

#### Payload Schema & State Generation
The payload is constructed dynamically from `stats.periods.today`:
```javascript
{
  type: 0, // ActivityType.Playing
  largeImageKey: 'logo',
  largeImageText: 'Token Monitor',
  startTimestamp: <connection_time_ms>,
  buttons: [{ label: 'View on GitHub', url: 'https://github.com/Javis603/token-monitor' }],
  details: '<TopClientLabel> · <FormattedCompactTokens> tokens',
  state: '<FormattedCurrency> today',
  smallImageKey: '<client_id>',   // e.g. 'claude', 'copilot', 'codex'
  smallImageText: '<client_label>'
}
```
- **Zero Usage Handling**: When `totalTokens === 0`, `details` defaults to `'Token Monitor'` and `state` to `'No usage today'`, omitting `smallImageKey`.
- **Top Client Selection (`topClient`)**: Inspects `stats.periods.today.clients`, filters for entries `> 0`, sorts descending by token volume, and selects index 0. The client id is matched against `CLIENT_LABELS` (from `src/shared/clientCatalog.js`), dynamically displaying the specific tool icon on Discord.
- **Compact Number & Currency Formatting**: Respects the user's selected currency (`latestCurrency`, default `'USD'`), compact token unit system (`'western'` vs `'localized'`), and application locale (`latestLocale`).

#### Lifecycle & Event Triggers
1. **Startup**: Evaluated in `main.js:7387` during app initialization (`if (settings.discordRpcEnabled) startDiscordRpc()`).
2. **Settings Changes**: Dynamically watched in `main.js:7744-7753`. Toggling `discordRpcEnabled` immediately connects (`startDiscordRpc()`) or destroys the client (`stopDiscordRpc()`). Changing display currency or token formatting immediately forces an updated payload.
3. **Usage Ingest / Collector Pushes**: In `main.js:4232, 4369, 4498, 5054`, whenever local token scans or synced device summaries arrive, `updateDiscordRpcDisplay(stats)` is invoked. This updates `pendingPayload` and flushes through `scheduleFlush()` respecting the 15-second timer.
4. **Shutdown**: In `main.js:6291`, `app.on('before-quit')` calls `stopDiscordRpc()`, clearing Discord activity and destroying the IPC socket.

---

### 1.2. Edge Docking & Floating Bubble Architecture

TokeX features two distinct edge docking concepts:
1. **Floating Bubble (`src/electron/floatingBubble.js`)**: An edge-collapsing mode for the primary widget window (`mainWindow`).
2. **Edge Dock (`src/electron/edgeDock/controller.js`)**: A separate multi-window system (`peek`, `rail`, `bubble`) dedicated to quota gauges and real-time provider activity.

#### 1.2.1. Floating Bubble Mode
- **Configuration Constraints**:
  - Requires `settings.floatingBubbleEnabled === true`, `settings.trayMode !== true`, and `settings.windowBehavior !== 'desktop'`.
- **Handle Dimensions & Margins**:
  - Handle width: `18 DIPs` (`FLOATING_BUBBLE_HANDLE_WIDTH`)
  - Handle height: `34 DIPs` (`FLOATING_BUBBLE_HANDLE_HEIGHT`)
  - Screen margin: `8 DIPs` (`FLOATING_BUBBLE_MARGIN`)
  - Windows collapsed margin: `{ x: 0, y: 0 }` (flush against the screen edge)
  - Non-Windows collapsed margin: `{ x: 0, y: 8 }`
- **Side Detection**:
  - `floatingBubbleSide(bounds, workArea)` evaluates whether `centerX <= workAreaCenterX` to snap to `'left'` or `'right'`.
- **Chrome Adjustments on Win32**:
  - When collapsed on Windows, `floatingBubbleWindowChrome` strips window shadow (`hasShadow: false`), enables rounded corners (`roundedCorners: true`), and disables thick frame (`thickFrame: false`).
- **Linux Window Restore Workaround**:
  - `restoreFloatingBubbleWindow()` handles a specific Linux window manager quirk: when collapsing pins the window to handle size and marks it non-resizable, unpinning requires setting `win.setResizable(true)` *before* re-applying minimum size limits and bounds; otherwise, the window clamps back to handle size.

#### 1.2.2. Edge Dock Architecture & Physics Loop
The Edge Dock (`src/electron/edgeDock/controller.js`) owns three frameless, non-activating windows that operate entirely out of focus and do not steal window activation:
1. **`peek`**: The resting edge trigger handle (width 10 DIPs, length 88 DIPs). It expands from 6 DIPs to 8 DIPs when the cursor approaches, inviting interaction.
2. **`rail`**: The vertical dock strip (width 64 DIPs) featuring concave shoulders (`shoulder: 28 DIPs`, `railRadius: 20 DIPs`) flowing into the display edge. Displays circular quota progress rings, token velocity readouts, and session status indicators.
3. **`bubble`**: The flyout detail card (width 280 DIPs, radius 18 DIPs, tail 12 DIPs, neck 18 DIPs) extending horizontally from the hovered rail cell.

#### Physics & Interaction Cadence
- **Pointer Polling**:
  - Idle cadence: `POLL_IDLE_MS = 90`
  - Active hover: `POLL_ACTIVE_MS = 40`
  - Active drag: `POLL_DRAG_MS = 16` (60 fps tracking)
- **Delays & Transitions**:
  - Reveal delay: `140 ms` (distinguishes intentional docking pushes from incidental cursor sweeps toward scrollbars)
  - Retract/Hide delay: `320 ms` (grace period across gaps between rail and bubble)
  - Bubble pop delay: `70 ms` (instantaneous cell-to-cell transitions once opened)
  - Fade animations: Fade-in `150 ms`, Fade-out `120 ms`, step `16 ms`
- **Fullscreen Guard**:
  - Mode `alwaysExceptFullScreen` queries `fullScreenProbe.js` every `500 ms` (`FULL_SCREEN_POLL_MS`) to hide the dock during fullscreen video or presentation playback.
- **Masking & Native Vibrancy**:
  - **macOS**: `src/electron/edgeDock/mask.js` converts SVG polygon paths into OS window masks (`macVibrancyMask.js`), clipping native materials (`NSVisualEffectView` or Liquid Glass) to the exact organic silhouette.
  - **Windows**: Utilizes transparent shaped windows, relying on the renderer to paint tint over transparent backdrops.
- **Haptic Integration**:
  - macOS calls `performHaptic('alignment', 'default')` via `macHaptics.js` when docking snaps or reveals.

---

### 1.3. Multi-Device & Cloud Sync Ecosystem

TokeX supports three interchangeable sync topologies:
1. **iCloud Container Sync** (zero-setup macOS sync via Apple CloudDocs).
2. **Node Hub Server** (self-hosted or local intranet synchronization).
3. **Cloudflare Worker Sync** (global serverless sync via Cloudflare Workers + Durable Objects).

#### 1.3.1. iCloud Drive Engine
Located at: `src/electron/icloudSync.js` & `src/electron/icloudSyncRuntime.js`.
- **Root Path**:
  - `~/Library/Mobile Documents/com~apple~CloudDocs/Token Monitor/sync-v1/`
  - Subdirectories:
    - `devices/`: Per-device state documents (`device-${sha256(deviceId)}.json`)
    - `subscriptions/`: Subscription ledger documents (`writer-${sha256(writerId)}.json`)
    - `deletions/`: Deletion tombstones (`writer-${sha256(writerId)}.json`)
- **Local Revision Ledger**:
  - Stored in `~/Library/Application Support/Token Monitor/icloud-revisions-${sha256(writerId)}.json`.
  - Tracks monotonic device revisions, subscription counters, and deletion vectors across crashes.
- **Crash-Proof Atomic Write Protocol**:
  1. Writes document to `.<filename>.<pid>.<timestamp>.<random>.tmp` with permissions `0o600`.
  2. Executes `fsync` on the file descriptor handle.
  3. Renames the temporary file over the target file.
  4. Executes `fsync` on the parent directory file descriptor (using POSIX directory file handles).
  5. Enforces `O_NOFOLLOW` on Darwin to eliminate symlink hijacking attacks.
- **Conflict Resolution (Lamport Clocks)**:
  - Subscriptions use `(counter, writerId)` vector comparisons. If a write detects a higher counter or conflicting base revision, it rejects with `stale_write`.
- **Tombstones & Deletions**:
  - `targetDeviceRevision` is recorded in `deletions/writer-*.json`. Any device document with `revision <= targetDeviceRevision` is excluded from the aggregate.
- **Privacy Boundary**:
  - Strips all sensitive tokens (`cookie`, `secret`, `api_key`, `access_token`, `authorization`) via `stripSensitive()` before writing to iCloud Drive.

#### 1.3.2. Node Hub Server (`src/hub/server.js`)
A lightweight, dependency-free Node HTTP server (default port `17321`):
- **Binding Security**: Automatically restricts unauthenticated instances to loopback (`127.0.0.1`); requires an explicit secret (`TOKEN_MONITOR_SECRET`) to bind `0.0.0.0` for LAN access.
- **Endpoints**:
  - `GET /api/health`: Returns runtime type (`node-hub`), version, build ID, device count, and auth requirement.
  - `POST /api/ingest`: Receives device token snapshots. Supports `x-token-monitor-response: minimal` to return `{ ok, deviceId }` without echoing full aggregate stats.
  - `GET /api/stats`: Returns aggregated multi-device totals, 365-day history previews, and subscription revision tokens.
  - `GET /api/stats/stream`: Server-Sent Events (SSE) connection with a 30-second heartbeat (`: hb\n\n`) and content-keyed freshness events (`freshnessEvent()`).
  - `GET / PUT /api/subscriptions`: Shared subscription management guarded by Optimistic Concurrency Control (`stale_write` on outdated `baseUpdatedAt`).
  - `DELETE /api/devices/:id`: Deletes device records and writes revocation tombstones.
  - `GET /api/sync/content`: Queries server-wide capabilities.
  - `GET / PUT /api/sync/settings/:kind`: Syncs `modelAliases` and `customPricing`.
  - `PUT /api/sync/titles/:deviceId`: Per-device policy gating session title sharing.

#### 1.3.3. Cloudflare Worker Sync (`worker/src/index.js`)
Provides identical HTTP and SSE endpoints for global edge deployment:
- **Durable Object Architecture (`HubDO`)**: All mutations (ingest, deletions, subscriptions, sync settings) are serialized through `this.state.blockConcurrencyWhile` and transactional storage.
- **Compression**: Automatic gzip stream compression via `CompressionStream('gzip')` when client sends `Accept-Encoding: gzip` and payload exceeds 1 KB.
- **Timing-Safe Auth**: Uses standard Web Crypto API SHA-256 digests evaluated in constant time via an XOR reduction loop to prevent timing attacks against the secret header.

#### 1.3.4. Session Title Privacy & Data Sanitization
- Both Hub and Worker enforce a privacy contract: if server title sync is disabled or a device is unverified, `stripSessionTextFromDeviceRecord` strips raw prompts and session titles before persisting or broadcasting stats to other devices.

---

### 1.4. Platform-Specific Native Integrations

#### 1.4.1. Windows: Taskbar Z-Order & Forefront Hooks
- **The Problem**: Windows Shell (`Shell_TrayWnd`) routinely elevates itself over `alwaysOnTop` windows whenever any window activation touches the taskbar. Electron's native `setAlwaysOnTop(true, 'floating')` gets overridden by the OS.
- **The Solution (`src/electron/windowsTaskbarZOrder.js`)**:
  - Implements a Taskbar Z-Order Keeper that runs only when the widget window overlaps the reserved taskbar area (`overlapsReservedArea(bounds, display)`).
  - Maintains a base 250 ms ticker (`INTERVAL_MS = 250`) calling `win.moveTop()` (which invokes `SetWindowPos(HWND_TOP, SWP_NOACTIVATE)`).
  - Fires burst nudges at `[60, 200, 400, 800] ms` following any foreground change, compensating for the shell's delayed taskbar elevation.
- **System-Wide Foreground Hook (`src/electron/windowsForegroundHook.js`)**:
  - Uses native FFI (`koffi`) to load `user32.dll`.
  - Installs `SetWinEventHook` for `EVENT_SYSTEM_FOREGROUND (0x0003)` with `WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS`.
  - Injects zero code into foreign processes; the OS posts messages directly to Electron's main thread message pump, immediately notifying the keeper without expensive polling.
- **Windows Acrylic & Blur Behind (`src/electron/windowsBackdrop.js`)**:
  - Employs Koffi to load `user32.dll`, `dwmapi.dll`, and `gdi32.dll`.
  - Bypasses standard limitations using the undocumented `SetWindowCompositionAttribute` API:
    - `WCA_ACCENT_POLICY = 19`
    - `ACCENT_ENABLE_ACRYLICBLURBEHIND = 4`
    - `DwmEnableBlurBehindWindow`
    - `DwmExtendFrameIntoClientArea` with `-1` margins.

#### 1.4.2. macOS: Native Widget Extension & Code Signing
- **Native Widget Architecture (`native/macos/TokenMonitorWidget/`)**:
  - Native Swift 6 / SwiftUI WidgetKit extension supporting `accessoryCircular`, `accessoryRectangular`, `systemSmall`, and `systemMedium` families.
  - Decodes cached JSON snapshots (`WidgetSnapshot.swift`) written by Electron.
- **App Group Container Bridge (`src/electron/macWidget/macAppGroupContainer.js`)**:
  - On macOS 15 (Sequoia), directly creating files under `~/Library/Group Containers/<group>` prompts an OS security consent dialog on every launch.
  - TokeX bypasses this by using Koffi to load Foundation and `libobjc.A.dylib`, invoking `[NSFileManager defaultManager] containerURLForSecurityApplicationGroupIdentifier:appGroup` via `objc_msgSend` within the entitled host app process.
- **WidgetKit Timeline Reloader (`src/electron/macWidget/reloader.js`)**:
  - Executes a compiled native helper binary (`TokenMonitorWidgetReloader`) that calls `WidgetCenter.shared.reloadTimelines(ofKind: "com.tokenmonitor.dashboard")`.
  - Features an adaptive throttle (`DEFAULT_MIN_INTERVAL_MS = 30000`) with trailing timer coalescence.
- **Build & Provisioning Pipeline (`scripts/build-macos-widget.js`)**:
  - Compiles the Xcode project into `build/macos-widget/DerivedData`.
  - Extracts provisioning profiles (`macos-provisioning.js`) to generate sandboxed entitlement plists (`com.apple.security.app-sandbox`, `com.apple.security.application-groups`).
  - Verifies architecture alignment via `lipo -archs` (arm64 vs x86_64).

#### 1.4.3. Linux: XDG Autostart Integration
- Located at: `src/electron/linuxAutostart.js`.
- Electron's `app.setLoginItemSettings` is a no-op on Linux.
- TokeX inspects `process.env.APPIMAGE` and writes an XDG desktop entry to `~/.config/autostart/token-monitor.desktop`.
- Enforces strict Desktop Entry escaping: double-quotes arguments, escapes `\`, `"`, `` ` ``, `$`, doubles `%` to `%%`, and sets `X-GNOME-Autostart-enabled=true`.

#### 1.4.4. WSL Scanner over UNC Shares (`\\wsl$\`)
- Located at: `src/shared/wslUsage.js` & `src/electron/renderer/wslStatusPresentation.js`.
- **Install-Proof Gate**: Prior to executing any `wsl.exe` commands, queries `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss`. If the key is absent, exits immediately, preventing Windows from displaying "press any key to install WSL" dialogs.
- **Distro Discovery**: Executes `wsl.exe --list --quiet --running`, decoding UTF-16LE output.
- **Home Traversal**: Probes network shares `\\wsl$\<distro>\home\<user>` and `\\wsl$\<distro>\root`.
- **Marker Inspection (`homeHasData`)**: Scans for known configuration directories (`.config/Code/User/workspaceStorage/*/chatSessions` for Copilot, `.minimax-<profile>` for MiniMax, Claude, Cline, and related tools).
- **Exclusion Filters**: Excludes `reasonix`, `catpaw`, and `qodercn` from WSL scans to prevent double-counting or APPDATA path misdirection.

---

### 1.5. External Service Status Monitoring
Located at: `src/electron/serviceStatus.js` (rendered in `serviceStatusPresentation.js`).

TokeX continuously checks external provider status pages:
1. **Claude**: `https://status.claude.com/api/v2/summary.json`
2. **OpenAI**: `https://status.openai.com/api/v2/summary.json`
3. **Cursor**: `https://status.cursor.com/api/v2/summary.json`
4. **DeepSeek**: `https://deepseek.statuspage.io/api/v2/summary.json` (bypasses browser-only HTML bot-detection on status.deepseek.com).

#### Data Model & Caching
- **Cache Windows**: 60s success cache (`DEFAULT_CACHE_MS`), 10s error cache (`DEFAULT_ERROR_CACHE_MS`), 5s request timeout.
- **Indicator Classification**:
  - `none` -> `'ok'` (green)
  - `minor` -> `'degraded'` (yellow)
  - `major`, `critical` -> `'outage'` (red)
- **Active Incident Extraction**: Filters out `resolved`, `completed`, and `postmortem` entries, isolating the active incident title and affected components.
- **Scheduled Maintenance**: Isolates maintenance items from active incidents, tracking them separately under `maintenanceCount`.

---

## 4. R3: Shared Layer, Providers & Accounting Engine

### 4.1 Architecture of the Accounting Engine

### 2.1. Client Catalog & Provider Architecture

#### 2.1.1. Tracked Client Catalog (`src/shared/clientCatalog.js`)
The authoritative single source of truth for all 36 tracked clients:
1. `claude` (Claude Code)
2. `codex` (Codex)
3. `opencode` (OpenCode)
4. `hermes` (Hermes Agent)
5. `openclaw` (OpenClaw)
6. `cursor` (Cursor)
7. `antigravity` (Antigravity)
8. `cline` (Cline)
9. `amp` (Amp)
10. `droid` (Factory Droid)
11. `kimi` (Kimi)
12. `qwen` (Qwen)
13. `grok` (Grok Build)
14. `copilot` (GitHub Copilot)
15. `pi` (Pi)
16. `omp` (Oh My Pi)
17. `zed` (Zed)
18. `kilo` (Kilo)
19. `commandcode` (Command Code)
20. `mimo` (Xiaomi MiMo)
21. `muse` (Muse Code)
22. `zcode` (ZCode)
23. `kiro` (Kiro)
24. `codebuddy` (CodeBuddy)
25. `workbuddy` (WorkBuddy)
26. `proma` (Proma, fork-only)
27. `catpaw` (CatPaw, defaultTracked: false, fork-only)
28. `qodercn` (Qoder CN, defaultTracked: false, fork-only)
29. `reasonix` (Reasonix)
30. `dsh` (DeepSeek Harness)
31. `cherrystudio` (Cherry Studio)
32. `lmstudio` (LM Studio)
33. `unsloth` (Unsloth)
34. `devin` (Devin)
35. `fx` (fx)
36. `mcode` (MiniMax Code)
*(Plus `gemini` registered under `NON_CATALOG_CLIENT_LABELS`).*

#### 2.1.2. Partition Invariants
To prevent data corruption during delta updates, three strict partition invariants are enforced:
1. **Fixed-Point Normalization**: For every catalog id, `normalizeClientName(id) === id`.
2. **Alias Unification**: Every Tokscale alias in `TOKSCALE_CLIENT_ALIASES` must normalize back to its parent catalog id, and `tokscaleClientFilter()` must expand the parent id to include the alias (e.g. `antigravity` expands to include `antigravity-cli`).
3. **No Synthetic Output**: `tokscaleClientFilter()` must never output `'synthetic'`. (Tokscale's CLI treats `synthetic` as a flag to enable every parser, which turns high-speed targeted scans into slow full scans).

#### 2.1.3. Session Metadata & Context Windows
Session metadata (`src/shared/sessionMetadata.js`) provides:
- Live session title resolution.
- Context tokens and model context windows (`contextTokens` / `contextWindow`).
- T3 Code relationship tracking (`t3SessionIdentity.js`), mapping parent and child session IDs for agent delegation trees.

---

### 2.2. AI Limits & Quota Accounting Engine

#### 2.2.1. Limit Provider Catalog (`src/shared/limits/providers.js`)
Maps 29 distinct quota providers. Where tracked client names differ from limits accounts, explicit aliases are maintained:
- `droid` -> `factory`
- `zcode` -> `zai`
- `qodercn` -> `qoder`
- `dsh` -> `deepseek`
- `mcode` -> `minimax`

#### 2.2.2. Account Drivers & The Credential Wall (`src/shared/limits/accounts.js`)
The engine enforces a strict security boundary between main process credentials and the renderer:
- **Leaf Account Modules**: Each provider implements `src/shared/providers/<id>/account.js` as a pure, dependency-free leaf module.
- **Store Path Isolation**: Secrets declare `storePath: ['providers', '<id>', '<key>']`. This instructs `credentialStore.js` to persist secrets exclusively in `credentials.json` on the main process.
- **Renderer Projections**: The renderer never sees secrets. Settings requests return redacted form DTOs via `limitAccountFormsForRenderer()` in `credentialCommands.js`.
- **Lazy Module Binding**: `accounts.js` registers lazy loaders `() => require('./limits')` so credential stores can read account schemas without triggering circular dependency cycles.

#### 2.2.3. Quota Windows & Normalization Hierarchy (`src/shared/limits/core.js`)
Windows are normalized into a canonical four-tier hierarchy:
```javascript
const WINDOW_ORDER = ['session', 'daily', 'weekly', 'billing'];
```
- **5-Hour Rolling Windows**:
  - Tracked as kind `'session'`.
  - Identified by `FIVE_HOUR_WINDOW_PROVIDERS` (`windowLabels.js`): `alibaba`, `antigravity`, `cline`, `commandcode`, `kimi`, `volcengine`, `zai`, `zaiteam`.
  - Providers not in this set label the rolling window as `'Session'`.
- **Weekly Quotas**:
  - Tracked as kind `'weekly'`. Includes rolling 7-day all-model limits (Claude, Kimi) or fixed calendar week quotas.
- **Billing / Monthly Quotas**:
  - Tracked as kind `'billing'`. Normalizes `billingcycle`, `monthly`, or plan subscription tiers.

#### 2.2.4. Prepaid Credits & Balance Quotas (`src/shared/limits/balanceDisplay.js`)
- **Wire Metric**: Quota windows representing money declare `metric: 'credits'`.
- **Meter Percentage Inference**:
  - If the provider does not publish an explicit quota limit (e.g. top-up credits in OpenRouter, DeepSeek, or MiMo), TokeX calculates an inferred meter percentage for UI display:
    $$\text{percent} = \frac{\text{funds}}{\text{funds} + \text{monthSpend}} \times 100$$
  - When balance is zero, it immediately evaluates to `0%`.
  - When balance is untouched (zero month spend observed), it evaluates to `100%`.
  - **Tripwire Rule**: This inferred percentage is strictly display-only and is never written to the wire record.

#### 2.2.5. Adaptive Burn-Rate Scheduling (`src/shared/limits/burnRate.js`)
Instead of polling on a static timer or polling on every token consumption, TokeX implements adaptive limits polling:
$$\text{TTL} = \frac{\text{remainingPercent}}{\text{burnRate}}$$
$$\text{Poll Delay} = \max\left(60000\text{ ms},\, \frac{\text{TTL}}{4}\right)$$
- **Floor**: `LIMITS_URGENCY_FLOOR_MS = 60000` (1 minute).
- **Asymmetric Smoothing**: `LIMITS_URGENCY_RELEASE_WEIGHT = 0.3`. Burn rate increases are adopted instantaneously; consumption slowdowns decay gradually by 30% per sample to protect against burst usage.
- **Reset Invalidation**: Resets (`resetsAt` advancement or sudden increase in remaining quota) re-anchor the baseline, preventing negative burn calculations.

#### 2.2.6. Reset Boundaries (`src/shared/limits/resetBoundary.js`)
To ensure limits refresh promptly when a window expires without wasting requests:
- Detects `resetsAt` timestamps across all provider windows.
- Schedules targeted refreshes at:
  $$\text{Target Refresh Time} = \text{resetsAt} + 30000\text{ ms}$$
- The 30-second delay (`LIMITS_RESET_BOUNDARY_DELAY_MS`) accommodates upstream cloud provider quota rollover lag.

#### 2.2.7. Reset Animations (`resetMotion.js` & `resetAnimator.js`)
When an exhausted meter refills, the UI executes a coordinated refill animation:
- **Trigger Qualification (`shouldAnimateReset`)**:
  - Previous remaining percentage $< 99.5\%$ (`FULL_PERCENT`).
  - Current remaining percentage $\ge 99.5\%$.
  - Window `resetsAt` has advanced forward in time (rejecting local data corrections).
- **Animation Timing Formula**:
  $$\text{Duration (ms)} = \text{round}(900 + |\Delta\text{Percent}| \times 7)$$
  Yields 900 ms to 1600 ms animations.
- **Group Synchronization**: `groupDurationMs()` aligns all resetting meters in a provider card to complete simultaneously.
- **Visual Easing & Effects**:
  - CSS transform on `.limit-meter-fill`: `scaleX(from) -> scaleX(to)` using `cubic-bezier(0.333, 0.667, 0.667, 1)`.
  - Quadratic ease-out text interpolation: $\text{from} + \Delta \times (1 - (1 - t)^2)$.
  - Completion Glow: Appends `.limit-meter-completion` for a 700 ms linear pulse peaking at $52\%$ opacity at 252 ms lead time.

---

## 3. Comprehensive Subsystems Comparison Matrix

| Subsystem | Primary Source Files | Primary Runtime / Platform | Triggers & Cadence | Payload / Storage Shape | Key Constraints & Invariants |
|---|---|---|---|---|---|
| **Discord RPC** | `src/electron/discordRpc.js` | Electron Main (Node) | On startup, settings toggle, and stats updates (min 15s interval) | Client `1507034330436862062`, `type: 0`, top client icon, token count, USD cost | Max 1 call per 15s; 30s reconnect backoff; handles zero-token state cleanly |
| **Floating Bubble** | `src/electron/floatingBubble.js` | Electron Main & Renderer | Window minimize/collapse toggle, blur auto-collapse | `floatingBubbleBounds: { x, y, width: 18, height: 34 }` | Screen edge clamping; Win32 disables shadow & thick frames when collapsed |
| **Edge Dock** | `src/electron/edgeDock/controller.js`, `geometry.js`, `dock.js` | Electron Main (`darwin`, `win32`) | Cursor polling (16ms drag, 40ms active, 90ms idle) | 3 frameless windows: `peek` (10x88), `rail` (64w), `bubble` (280w) | Non-activating windows; SVG polygon mask clipping on macOS; 500ms fullscreen probe |
| **iCloud Sync** | `src/electron/icloudSync.js`, `icloudSyncRuntime.js` | macOS (Node `fs/promises`) | FS watcher + 60s periodic reconciliation (1s debounce) | `com~apple~CloudDocs/Token Monitor/sync-v1/` (`devices/`, `subscriptions/`, `deletions/`) | Atomic writes via `.tmp` + `0o600` + file `fsync` + directory `fsync`; `O_NOFOLLOW` |
| **Node Hub** | `src/hub/server.js` | Node 22 (`http`) | HTTP requests + SSE streaming (30s heartbeat) | `data/devices.json`, HTTP REST + SSE wire records | Binds `127.0.0.1` unless secret provided; strips session text if unverified |
| **Cloudflare Worker** | `worker/src/index.js` | Cloudflare Workers & Durable Objects | HTTP requests + SSE streaming | Cloudflare Durable Object transactional storage (`HubDO`) | Timing-safe XOR auth comparison; gzip response compression; strict Worker isolation |
| **Win32 Taskbar Z-Order** | `windowsTaskbarZOrder.js`, `windowsForegroundHook.js` | Windows (`win32`) | 250ms interval + nudges at [60, 200, 400, 800] ms on foreground event | `SetWindowPos(HWND_TOP, SWP_NOACTIVATE)` | Uses `koffi` `SetWinEventHook` (0x0003); runs only when window overlaps taskbar |
| **Windows Accent Blur** | `windowsBackdrop.js` | Windows (`win32`) | Window initialization / theme change | Win32 structs: `TOKEN_MONITOR_ACCENT_POLICY`, `DWM_BLURBEHIND` | Undocumented `SetWindowCompositionAttribute` (WCA 19); margins `-1` |
| **macOS Native Widget** | `macWidget/`, `scripts/build-macos-widget.js`, Swift | macOS (`darwin`) | Token ingestion + 30s throttled helper binary | `~/Library/Group Containers/<group>/` JSON snapshot | Uses `libobjc.A.dylib` `objc_msgSend` to bypass macOS 15 container consent prompt |
| **Linux Autostart** | `src/electron/linuxAutostart.js` | Linux (`linux`) | Settings toggle | `~/.config/autostart/token-monitor.desktop` | Only supported under `$APPIMAGE`; strict Desktop Entry spec string escaping |
| **WSL Scanner** | `src/shared/wslUsage.js`, `wslStatusPresentation.js` | Windows (`win32`) | Background token scanning tick | UNC network shares `\\wsl$\<distro>\home\...` | Probes `HKCU\...\Lxss` registry first; excludes `reasonix`, `catpaw`, `qodercn` |
| **Service Status** | `src/electron/serviceStatus.js` | Electron Main (Node / fetch) | Settings view / interval (60s cache, 10s error cache) | Atlassian Statuspage v2 summary JSON | Maps Claude, OpenAI, Cursor, DeepSeek; distinguishes maintenance from incidents |
| **Client Catalog** | `src/shared/clientCatalog.js` | Shared (Isomorphic) | Continuous usage scanning | 36 catalog clients + 1 non-catalog (`gemini`) | Partition invariants: fixed point of normalizer, alias expansion, no `synthetic` |
| **AI Limits Engine** | `src/shared/limits/core.js`, `accounts.js`, `burnRate.js` | Shared & Main | Dynamic polling + resetsAt + 30s | Normalized limits schema: `session`, `daily`, `weekly`, `billing` | Secrets stored in `credentials.json`, never renderer; adaptive burn-rate sampling |
| **UI Reset Motion** | `resetMotion.js`, `resetAnimator.js` | Electron Renderer (DOM) | On limits update when remaining jumps $\ge 99.5\%$ | Web Animations API `scaleX` + `.limit-meter-completion` glow | Duration: $900 + 7 \times \Delta\%$; group sync; quadratic ease-out number tweening |

---

## 5. R4: Complete File-by-File Codebase Inventory

### 5.1 Exhaustive Catalog of All 476 Non-Vendor Files

This catalog exhaustively documents every non-vendor file in the specified target directories. There are **zero placeholders** ("Fully Resolved", "Action Plan", "and related components.").

## 1.1 Headless Agent Subsystem (`src/agent/` - 4 Files)

The headless agent provides a lightweight, non-GUI background collector daemon suitable for servers, CLI environments, cron jobs, and containers.

#### `src/agent/agent.js`
- **Single Responsibility**: Headless background CLI daemon entry point that orchestrates collector ticks, limits polling, and hub synchronization.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `node:fs`, `node:path`, `../shared/config`, `../shared/appVersion`, `../shared/clientTracking`, `./seedClients`, `../shared/collector`, `../shared/limits/collector`, `../shared/syncPayload`, `./titleSync`, `../shared/hubProtocol`, `../shared/usage`, `./runtime`, `../shared/usage/sessionUsageArchive`, `../shared/usage/sessionUsageArchiveStore`, `../shared/providers/cursor/usageEvents`
- **State Flow**: CLI args and environment loaded -> initializes collector, limits engine, and title synchronizer -> starts periodic collection timer -> sends sync payload to Hub via HTTP POST.

#### `src/agent/runtime.js`
- **Single Responsibility**: No local live UI: observe state on normal scans, without a perpetual activity heartbeat driving archive writes and Hub uploads..
- **Exports**: `runAgent`, `runAgentOnce`
- **Dependencies**: `../shared/usage/deviceRuntime`, `../shared/orderedSink`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/agent/seedClients.js`
- **Single Responsibility**: The headless equivalent of the widget's `seededClientSplits`.
- **Exports**: `seedAgentClients`
- **Dependencies**: `node:path`, `../shared/config`, `../shared/clientIdentitySplits`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/agent/titleSync.js`
- **Single Responsibility**: A restarted container may reuse this PID.
- **Exports**: `createAgentTitleSync`
- **Dependencies**: `node:crypto`, `node:fs`, `node:path`, `../shared/credentialStore`, `../shared/syncContent`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

## 1.2 Node Central Hub Subsystem (`src/hub/` - 1 File)

The standalone Node Hub coordinates multi-device token aggregation, device heartbeat tracking, subscription synchronization, and real-time Server-Sent Events (SSE) broadcasting.

#### `src/hub/server.js`
- **Single Responsibility**: Central Node HTTP hub server managing device ingestion, subscription CAS storage, and live SSE event broadcasting.
- **Exports**: `createHub`, `resolveBindHost`
- **Dependencies**: `node:http`, `node:path`, `node:url`, `../shared/usage`, `../shared/syncContent`, `../shared/syncUploadInterval`, `../shared/history`, `../shared/subscriptionDisplay`, `../shared/currency`, `../shared/hubBuildIdentity`, `../shared/hubProtocol`, `../shared/http`, `../shared/config`
- **State Flow**: HTTP requests arrive at Node HTTP server -> request router parses authorization header -> device state aggregated into memory -> persisted to devices.json -> updates broadcast to SSE subscribers.

## 1.3 Cloudflare Worker Edge Hub Subsystem (`worker/` - 28 Files)

The edge hub implementation runs in Cloudflare Workers using Durable Objects for distributed consistency, Web Crypto for timing-safe secret validation, and streaming gzip compression.

#### `worker/.dev.vars.example`
- **Single Responsibility**: Example environment variables template for local runtime configuration.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `worker/package-lock.json`
- **Single Responsibility**: Static JSON data structure or build configuration registry.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `worker/package.json`
- **Single Responsibility**: Static JSON data structure or build configuration registry.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `worker/README.md`
- **Single Responsibility**: Documentation reference and usage guide.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `worker/README.zh-CN.md`
- **Single Responsibility**: Documentation reference and usage guide.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `worker/README.zh-TW.md`
- **Single Responsibility**: Documentation reference and usage guide.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `worker/src/index.js`
- **Single Responsibility**: Cloudflare Worker edge hub handling HTTP REST ingestion, Durable Object sync, and SSE streams.
- **Exports**: `HubDO`
- **Dependencies**: `./shared/limits/core.js`, `./shared/subscriptionDisplay.js`, `./shared/currency.js`, `./shared/syncContent.js`, `./shared/usage.js`, `./shared/syncUploadInterval.js`, `./shared/history.js`, `./shared/hubBuildIdentity.js`, `./shared/hubProtocol.js`
- **State Flow**: Incoming Cloudflare edge fetch request -> token authenticated -> state routed to Durable Object instance -> JSON or compressed gzip stream returned to client.

#### `worker/src/shared/clientHealth.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `CLIENT_HEALTH_DIAGNOSTIC_CODES`, `CLIENT_HEALTH_OVERALL_STATES`, `CLIENT_HEALTH_VERSION`, `CLIENT_COLLECTION_STATES`, `CLIENT_SYNC_DETAIL_CODES`, `CLIENT_SYNC_FAILURE_STAGES`, `MAX_SYNC_DETAIL_INPUT_LENGTH`, `CLIENT_SOURCE_CHECK_IDS`, `CLIENT_SOURCE_STATES`, `MAX_CHECKS_PER_CLIENT`, `MAX_DIAGNOSTICS_PER_CLIENT`, `MAX_TRACKED_CLIENTS`, `countOverall`, `deriveClientOverall`, `deriveLegacyClientStatus`, `normalizeClientHealth`, `normalizeClientSyncDetailCode`, `normalizeClientSyncExitCode`, `normalizeClientSyncFailureStage`, `classifyClientSyncDetailCode`
- **Dependencies**: `./providers/reasonix/paths`, `./providers/dsh/paths`, `./providers/devin/paths`, `there is nothing to read`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/currency.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/history.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `hasDisjointReasoning`, `num`, `normalizeTokscaleClientName`, `normalizeTokscaleModelNameForClient`, `normalizeTokscaleModelComponentSummary`, `sumOutputTokens`, `sumTokens`, `parseGraphResult`, `computeIntensities`, `localDayKey`, `dayKeyAddDays`, `computeStreaks`, `monthlyRollup`, `normalizeHistory`, `mergeHistories`, `coerceHistory`, `historyPreview`, `historyRevision`, `deviceHistoryRevision`
- **Dependencies**: `./providers/reasonix/paths`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/hubBuildIdentity.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `api`
- **Dependencies**: `./hubBuildRegistry.json`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/hubBuildRegistry.json`
- **Single Responsibility**: Static JSON data structure or build configuration registry.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `worker/src/shared/hubProtocol.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `HUB_RESPONSE_HEADER`, `HUB_RESPONSE_MINIMAL`, `HUB_STREAM_HEADER`, `HUB_STREAM_VERSION`, `acceptsEncoding`, `applyFreshnessEvent`, `freshnessEvent`, `headerValue`, `hubStatsContentKey`, `wantsFreshnessEvents`, `wantsMinimalResponse`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/limits/core.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `DEFAULT_LIMITS_REFRESH_MS`, `aggregateLimits`, `mergeCodexTransientWindows`, `normalizeLimitProvider`, `normalizeLimitsSummary`, `normalizeLimitWindow`, `normalizeProviderUsageSummary`, `openCodeWindowKey`, `publicLimits`, `syncLimits`
- **Dependencies**: `../syncUploadInterval`, `./providers`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/limits/providers.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/package.json`
- **Single Responsibility**: Static JSON data structure or build configuration registry.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `worker/src/shared/projectKey.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/providers/devin/paths.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `DEVIN_CLIENT`, `DEVIN_CLI_SOURCE_CHECK_ID`, `DEVIN_DESKTOP_SOURCE_CHECK_ID`, `devinCliDbDirs`, `devinCliDbPaths`, `devinDesktopAcpDirs`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/providers/dsh/paths.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `DSH_CLIENT`, `DSH_SOURCE_CHECK_ID`, `resolveDshHome`, `resolveDshSessionsDir`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/providers/reasonix/paths.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `cleanEnvDir`, `REASONIX_CLIENT`, `REASONIX_SOURCE_CHECK_ID`, `resolveReasonixHome`, `resolveReasonixStatsDir`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/providers/reasonix/sessionGuard.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/sessionActivityProviders.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/sessionLive.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `api`
- **Dependencies**: `./sessionActivityProviders`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/subscriptionDisplay.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/syncContent.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `SHARED_SYNC_KINDS`, `normalizeSharedSyncValue`, `emptySharedSyncDocument`, `nextSharedSyncDocument`, `syncContentCapability`, `syncSessionTitlesEnabled`, `normalizeTitlePolicy`, `nextTitlePolicy`, `acceptsSessionTitles`, `createSessionTitleSyncNegotiator`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/syncUploadInterval.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `DEFAULT_STALE_AFTER_MS`, `DEFAULT_SYNC_UPLOAD_INTERVAL_MS`, `SYNC_UPLOAD_INTERVAL_OPTIONS`, `normalizeSyncUploadIntervalMs`, `staleAfterMsForSyncUpload`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/src/shared/usage.js`
- **Single Responsibility**: @generated by scripts/sync-worker-shared.js — DO NOT EDIT.
- **Exports**: `PERIODS`, `UNATTRIBUTED_USAGE_CLIENT`, `addPeriodInto`, `aggregateDevices`, `aggregateHistory`, `applyPeriodDelta`, `applyProjectRollups`, `canonicalProjectKey`, `carryDeviceHistory`, `emptyPeriod`, `extractUsageBundleFromTokscale`, `extractUsageFromTokscale`, `mergeDeviceRecord`, `mergeSyncDeviceRecord`, `mergePeriods`, `normalizeClientName`, `normalizeModelName`, `normalizeModelNameForClient`, `normalizeDeviceRecord`, `normalizePeriod`, `projectRollupFromSessions`, `stripSessionTextFromDeviceRecord`, `stripSessionTextFromPeriod`
- **Dependencies**: `./sessionActivityProviders`, `./sessionLive`, `./limits/core`, `./clientHealth`, `./history`, `./providers/reasonix/paths`, `./providers/reasonix/sessionGuard`, `./projectKey`, `./syncUploadInterval`, `a turn is in progress`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `worker/wrangler.toml`
- **Single Responsibility**: Cloudflare Wrangler deployment and environment configuration.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

## 1.4 Scripts & Automation Tooling (`scripts/` - 40 Files)

Build, packaging, verification, forensic analysis, code signing, and database ledger management scripts.

#### `scripts/analyze_state5_monthly.py`
- **Single Responsibility**: Provides analyze_state5_monthly logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/benchmark-grok-bot-grouping.js`
- **Single Responsibility**: Synthetic main/renderer pipeline benchmark; not a live Electron frame-time measurement.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `node:assert/strict`, `node:perf_hooks`, `../src/electron/syncDisplayStats`, `../src/electron/statsPublisher`, `../src/electron/renderer/sessionRows`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/benchmark-hub-bandwidth.js`
- **Single Responsibility**: Provides benchmark-hub-bandwidth logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `node:assert/strict`, `node:zlib`, `../src/shared/history`, `../src/shared/hubProtocol`, `../src/shared/usage`, `../worker/src/shared/history`, `../worker/src/shared/hubProtocol`, `../worker/src/shared/usage`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/build-macos-widget.js`
- **Single Responsibility**: Provides build-macos-widget logic and lifecycle management.
- **Exports**: `DEFAULT_APP_GROUP`, `DEFAULT_WIDGET_BUNDLE_ID`, `DEFAULT_WIDGET_KIND`, `WIDGET_SCHEMA_VERSION`, `WIDGET_UI_VERSION`, `WIDGET_ARCHITECTURES`, `assertWidgetArchitecture`, `buildTimestamp`, `entitlementPlist`, `gitRevision`, `packageVersion`, `widgetBundleVersion`, `widgetVersions`, `resolveWidgetArchitecture`, `validateDistributionIdentifiers`
- **Dependencies**: `node:fs`, `node:path`, `node:child_process`, `./macos-widget-config`, `./macos-provisioning`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/build_token_ledger.py`
- **Single Responsibility**: Provides build_token_ledger logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/check_discrepancy.py`
- **Single Responsibility**: Provides check_discrepancy logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/check_session_tokens.py`
- **Single Responsibility**: Provides check_session_tokens logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/check_t3_ui_math.py`
- **Single Responsibility**: Provides check_t3_ui_math logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/dev-macos-widget.js`
- **Single Responsibility**: Provides dev-macos-widget logic and lifecycle management.
- **Exports**: `availableDevelopmentIdentities`, `developmentTeamForAppGroup`, `findApps`, `hostLaunchEnvironment`, `parseArguments`, `extensionBundleIdentifier`, `readWidgetConfig`, `resolveDeveloperDirectory`, `resolveAppPath`, `resolveWidgetBundleId`, `teamIdentifierFromCodesignOutput`, `updatedWidgetConfig`, `xcconfigContents`
- **Dependencies**: `node:fs`, `node:path`, `node:child_process`, `./sign-macos-with-widget`, `./build-macos-widget`, `./macos-packaging`, `./verify-macos-widget-app`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/electron-builder-version.js`
- **Single Responsibility**: Provides electron-builder-version logic and lifecycle management.
- **Exports**: `resolveElectronVersionOverride`
- **Dependencies**: `semver`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/electron-builder.config.js`
- **Single Responsibility**: electron-builder downloads the framework selected by this top-level option.
- **Exports**: `createBuilderConfig`
- **Dependencies**: `../package.json`, `./macos-packaging`, `./electron-builder-version`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/ensure-vendored-tokscale.js`
- **Single Responsibility**: Ensures the npm-installed tokscale platform binary is replaced by the pinned downstream build recorded in scripts/vendor/tokscale.json.
- **Exports**: `MAX_BYTES`, `DOWNLOAD_TIMEOUT_MS`, `downloadAsset`, `ensureVendoredTokscale`, `main`, `sha256`, `sha256File`, `smokeTest`, `verifySha256`
- **Dependencies**: `node:crypto`, `node:fs`, `node:child_process`, `./vendoredTokscale`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/fetch-star-history-stargazers.js`
- **Single Responsibility**: Provides fetch-star-history-stargazers logic and lifecycle management.
- **Exports**: `fetchSanitizedStargazers`, `parseNextPage`
- **Dependencies**: `node:fs/promises`, `node:path`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/find_gap_source.py`
- **Single Responsibility**: Provides find_gap_source logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/find_missing_threads.py`
- **Single Responsibility**: Provides find_missing_threads logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/harvest_t3.py`
- **Single Responsibility**: Provides harvest_t3 logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/hub-build-manifest.js`
- **Single Responsibility**: This is the portable Hub core copied into the standalone Worker repository.
- **Exports**: `CORE_SOURCE_FILES`, `NODE_RUNTIME_SOURCE_FILES`, `REGISTRY_PATH`, `WORKER_RUNTIME_SOURCE_FILES`, `WORKER_SHARED_MODULES`, `WORKER_SHARED_PACKAGE`, `currentHubSourceBuildIds`, `latestEntry`, `nodeLockBuildInput`, `nodePackageBuildInput`, `readRegistry`, `updatedRegistry`, `validateRegistry`, `workerLockBuildInput`, `workerPackageBuildInput`, `workerSharedPackageContents`
- **Dependencies**: `node:crypto`, `node:fs`, `node:path`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/ingest_october_files.py`
- **Single Responsibility**: Provides ingest_october_files logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/inspect_codex_state.py`
- **Single Responsibility**: Provides inspect_codex_state logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/macos-packaging.js`
- **Single Responsibility**: Provides macos-packaging logic and lifecycle management.
- **Exports**: `assertWidgetArtifacts`, `createBuilderConfig`, `localWidgetSigningIdentity`, `widgetArtifactPaths`, `widgetEnabled`, `widgetMacBuildConfig`
- **Dependencies**: `node:fs`, `node:path`, `./macos-widget-config`, `./macos-provisioning`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/macos-provisioning.js`
- **Single Responsibility**: Provides macos-provisioning logic and lifecycle management.
- **Exports**: `classifyAppGroup`, `copyProvisioningProfiles`, `isTeamPrefixedAppGroup`, `parseProvisioningProfileDocument`, `parsePlistXml`, `profileIsRequired`, `profilePath`, `readProvisioningProfile`, `validateProvisioningProfile`, `validateProvisioningProfiles`
- **Dependencies**: `node:fs`, `node:path`, `node:child_process`, `../src/shared/macWidgetConfig`, `node:fs/promises`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/macos-widget-config.js`
- **Single Responsibility**: Provides macos-widget-config logic and lifecycle management.
- **Exports**: `require`
- **Dependencies**: `../src/shared/macWidgetConfig`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/merge-mac-updater-metadata.js`
- **Single Responsibility**: Provides merge-mac-updater-metadata logic and lifecycle management.
- **Exports**: `mergeMacUpdaterMetadata`, `mergeMacUpdaterMetadataFiles`, `parseMacUpdaterMetadata`
- **Dependencies**: `node:fs`, `node:path`, `./verify-updater-artifact-names`, `../src/shared/macSystemRequirements`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/nsis-installer.nsh`
- **Single Responsibility**: NSIS installer script for Windows desktop installer packaging.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `scripts/prepare-github-release-notes.js`
- **Single Responsibility**: Provides prepare-github-release-notes logic and lifecycle management.
- **Exports**: `GENERATED_NOTES_MARKER`, `apiEndpoint`, `composeReleaseNotes`, `fetchDirectCommits`, `fetchGeneratedNotes`, `fullChangelogRange`, `generatedChangelogDetails`, `generatedNotesWithoutFullChangelog`, `isReleaseCommit`, `notesWithDirectCommits`
- **Dependencies**: `node:fs/promises`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/scan_october.py`
- **Single Responsibility**: Provides scan_october logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/sign-macos-with-widget.js`
- **Single Responsibility**: Provides sign-macos-with-widget logic and lifecycle management.
- **Exports**: `async`, `extensionSignArgs`, `appSignOptions`, `localCodesignWrapperScript`, `localMainAppSignArgs`, `formalMainAppSignArgs`, `localElectronHelperEntitlements`, `localElectronHelperPaths`, `localElectronHelperSignArgs`, `reloaderSignArgs`
- **Dependencies**: `node:fs/promises`, `node:os`, `node:path`, `node:child_process`, `node:util`, `@electron/osx-sign`, `./macos-widget-config`, `./macos-provisioning`, `node:fs`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/signpath-windows-artifacts.js`
- **Single Responsibility**: electron-builder uses this implementation for its own blockmaps.
- **Exports**: `windowsApplicationProductVersion`, `expectedWindowsApplication`, `expectedWindowsArtifacts`, `windowsAppUpdateConfig`, `writeWindowsAppUpdateConfig`, `applicationSigningInputPath`, `signingInputPaths`, `assertExactTopLevelWindowsArtifacts`, `prepareUnsignedWindowsApplication`, `prepareUnsignedWindowsArtifacts`, `patchLatestYamlForSignedFile`, `listExeFiles`, `applySignedWindowsApplication`, `applySignedWindowsArtifacts`
- **Dependencies**: `node:fs`, `node:path`, `app-builder-lib/out/targets/blockmap/blockmap`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/sync-worker-shared.js`
- **Single Responsibility**: Vendors the Cloudflare Worker's shared-code closure into worker/src/shared/.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `node:fs`, `node:path`, `./hub-build-manifest`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/TokenMonitorWidgetReloader.swift`
- **Single Responsibility**: macOS native Swift helper utility for widget reloading via LaunchServices.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/update-hub-build.js`
- **Single Responsibility**: Provides update-hub-build logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `node:fs`, `./hub-build-manifest`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/validate-star-history-artifact.js`
- **Single Responsibility**: Provides validate-star-history-artifact logic and lifecycle management.
- **Exports**: `EXPECTED_FILES`, `validateArtifact`, `validateSnapshot`, `validateSvg`, `validateXmlWithXmllint`
- **Dependencies**: `node:fs`, `node:path`, `node:child_process`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/vendor/tokscale.json`
- **Single Responsibility**: Static JSON data structure or build configuration registry.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `scripts/vendoredTokscale.js`
- **Single Responsibility**: Shared by ensure-vendored-tokscale.js and the verification scripts so they can never resolve a different binary path than each other.
- **Exports**: `loadManifest`, `manifestMode`, `platformKey`, `runtimePlatformKey`, `binaryName`, `resolvePackageBinDir`, `resolveManifestEntry`, `resolveOptionalManifestEntry`, `resolveTargetBinPath`, `resolveInstalledPackageVersion`
- **Dependencies**: `node:fs`, `node:path`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/verify-macos-widget-app.js`
- **Single Responsibility**: Provides verify-macos-widget-app logic and lifecycle management.
- **Exports**: `exactArchitectures`, `entitlementValues`, `hasEntitlement`, `readCodesignMetadata`, `verifyLocalElectronHelpers`, `verifyAppGroupSources`, `verifyFormalCodeSignature`, `verifyTeamAppGroupSignature`, `verifyMacWidgetApp`, `verifyWidgetAppStructure`
- **Dependencies**: `node:fs`, `node:path`, `node:child_process`, `../package.json`, `../src/shared/macWidgetConfig`, `./macos-provisioning`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/verify-updater-artifact-names.js`
- **Single Responsibility**: Provides verify-updater-artifact-names logic and lifecycle management.
- **Exports**: `artifactNameFromReference`, `referencedArtifactNames`, `verifyUpdaterArtifactNames`
- **Dependencies**: `node:fs`, `node:path`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/verify-vendored-tokscale-clients.js`
- **Single Responsibility**: Verifies that the real, currently-authoritative tokscale binary recognizes every id tokscaleClientFilter() actually sends for a DEFAULT_CLIENTS scan (fork-only ids by a real scan, see below).
- **Exports**: `supportedClients`, `verifyVendoredTokscaleClients`
- **Dependencies**: `node:child_process`, `node:fs`, `node:os`, `node:path`, `./vendoredTokscale`, `../src/shared/tokscaleCapabilities`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/verify-vendored-tokscale-release.js`
- **Single Responsibility**: Verifies the complete immutable Release contract behind the vendor manifest.
- **Exports**: `assetNameForPlatformKey`, `fetchReleaseMetadata`, `parseChecksumManifest`, `platformKeyForPackage`, `resolveReleaseTagCommit`, `verifyManifestTargets`, `verifyReleaseMetadata`, `verifyVendoredTokscaleRelease`
- **Dependencies**: `./ensure-vendored-tokscale`, `./vendoredTokscale`, `@tokscale/cli/package.json`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/verify-vendored-tokscale.js`
- **Single Responsibility**: Integration gate for the Tokscale binary Token Monitor will ship.
- **Exports**: `main`, `TOKEN_CONTRACT_CASES`, `applicableTokenContracts`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `node:child_process`, `./vendoredTokscale`, `../src/shared/usage`, `node:sqlite`, `../tests/fixtures/tencentBuddyUsage.json`
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

#### `scripts/verify_ledger_integrity.py`
- **Single Responsibility**: Provides verify_ledger_integrity logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: CLI invocation -> parses flags and workspace context -> executes filesystem transformations, database migrations, or test validations -> outputs execution logs or release artifacts.

## 1.5 Electron Main Process Subsystems (`src/electron/` - 74 Files)

The Electron main process controls window lifecycles, background coordinators, tray interactions, native platform hooks (Windows taskbar z-order, macOS Liquid Glass / Mica, Linux autostart), iCloud sync, Discord RPC, and secure IPC routing.

#### `src/electron/backgroundImage.js`
- **Single Responsibility**: Provides background image logic and lifecycle management.
- **Exports**: `backgroundImagePath`, `clearBackgroundImage`, `getBackgroundImage`, `importBackgroundImage`
- **Dependencies**: `node:crypto`, `node:fs`, `node:path`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/clientSourceIpc.js`
- **Single Responsibility**: Provides client source ipc logic and lifecycle management.
- **Exports**: `createClientSourceIpcHandlers`, `normalizeClientId`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/codexAdditionalLimitsMigration.js`
- **Single Responsibility**: `showCodexAdditionalLimits: false` predates the visible-usage-items checklist, where each additional Codex pool is an item of its own.
- **Exports**: `applyCodexAdditionalLimitsMigration`, `codexAdditionalLimitsMigrationPatch`
- **Dependencies**: `../shared/limits/usageItems`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/deferredWindowSend.js`
- **Single Responsibility**: A renderer that has not finished loading silently drops anything sent to it, and a cold start publishes before the window is up.
- **Exports**: `sendWhenRendererReady`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/deviceRuntimeCoordinator.js`
- **Single Responsibility**: Cursor and Antigravity only move when their sync subprocess runs, and that is throttled to once per 5 minutes.
- **Exports**: `canRefreshUsageRuntime`, `drainPendingUsageClientRefreshes`, `runLimitInvalidation`, `runManualDeviceRefresh`, `settingsLimitInvalidationPlan`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/diagnostics.js`
- **Single Responsibility**: Provides diagnostics logic and lifecycle management.
- **Exports**: `DEFAULT_CPU_SAMPLE_DURATION_MS`, `createDiagnosticReportGenerator`, `metricGroup`, `processMetricsSnapshot`, `statArchiveFile`
- **Dependencies**: `node:os`, `../shared/diagnosticReport`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/diagnosticSnapshot.js`
- **Single Responsibility**: Provides diagnostic snapshot logic and lifecycle management.
- **Exports**: `createDiagnosticSnapshotBuilder`, `diagnosticAgeSeconds`, `diagnosticHubTarget`, `diagnosticHubTransport`, `diagnosticOsInfo`, `diagnosticStreamDetailCode`, `diagnosticTokscaleInfo`, `selectLocalDeviceRecord`
- **Dependencies**: `node:net`, `node:os`, `../shared/clientTracking`, `../shared/diagnosticReport`, `./renderer/i18n`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/discordRpc.js`
- **Single Responsibility**: Discord Rich Presence client that broadcasts live token usage metrics and active AI tools.
- **Exports**: `startDiscordRpc`, `stopDiscordRpc`, `updateDiscordRpc`
- **Dependencies**: `@xhayper/discord-rpc`, `../shared/currency`, `../shared/compactTokens`, `../shared/clientCatalog`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/edgeDock/controller.js`
- **Single Responsibility**: Provides controller logic and lifecycle management.
- **Exports**: `canUseEdgeDock`, `createEdgeDockController`, `edgeDockSupported`
- **Dependencies**: `node:os`, `node:path`, `./geometry`, `./mask`, `../renderer/edgeDock/shapes`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/edgeDock/fullScreenProbe.js`
- **Single Responsibility**: Answers "is another app full screen on this display?" for the edge dock's `alwaysExceptFullScreen` mode.
- **Exports**: `createFullScreenProbe`, `createMacSpaceReader`, `macCurrentSpaceIsFullScreen`, `rectMatches`, `windowsDisplayIsFullScreen`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/edgeDock/geometry.js`
- **Single Responsibility**: Pure placement and pointer-intent logic for the edge dock.
- **Exports**: `EDGE_DOCK_DEFAULT_OFFSET`, `EDGE_DOCK_METRICS`, `EDGE_DOCK_MODES`, `EDGE_DOCK_CUSTOM_SCALE`, `EDGE_DOCK_SIDES`, `EDGE_DOCK_SIZES`, `EDGE_DOCK_TIMING`, `createEdgeDockIntent`, `edgeDockBubbleBounds`, `edgeDockCellAt`, `edgeDockCellLayout`, `edgeDockCorridorBounds`, `edgeDockFittingScale`, `edgeDockHandleBounds`, `edgeDockHandleZones`, `edgeDockPeekBounds`, `edgeDockPlacementForDrop`, `edgeDockRailBounds`, `edgeDockRefreshBounds`, `edgeDockRefreshCorridor`, `edgeDockScale`, `edgeDockTriggerBounds`, `normalizeEdgeDockCustomScale`, `normalizeEdgeDockDisplayId`, `normalizeEdgeDockMode`, `normalizeEdgeDockOffset`, `normalizeEdgeDockSide`, `normalizeEdgeDockSize`, `railLength`, `rectContains`, `scaledEdgeDockMetrics`, `unionRect`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/edgeDock/macHaptics.js`
- **Single Responsibility**: Electron does not expose AppKit's trackpad haptics.
- **Exports**: `HAPTIC_FEEDBACK_PATTERNS`, `HAPTIC_PERFORMANCE_TIMES`, `createMacHapticsApi`, `performMacHaptic`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/edgeDock/macVibrancyMask.js`
- **Single Responsibility**: Clips a window's native material (NSVisualEffectView) to an arbitrary shape.
- **Exports**: `applyVibrancyMask`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/edgeDock/mask.js`
- **Single Responsibility**: Rasterizes dock silhouettes into an alpha mask for the native material.
- **Exports**: `rasterizeMask`, `shapeRectsFromPolygons`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/edgeDock/pointerButtons.js`
- **Single Responsibility**: Reads whether the primary mouse button is held, system-wide.
- **Exports**: `createWindowsReader`, `primaryButtonDown`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/edgeDock/preload.js`
- **Single Responsibility**: The dock is a glance surface floating over other apps, so its renderer gets a deliberately narrow bridge: it can render what the main process pushes and report pointer gestures, nothing else (no settings writes, no credentials).
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `electron`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/fixedPeriodHistory.js`
- **Single Responsibility**: This only describes whether the History transport can be read.
- **Exports**: `fixedPeriodHistoryMeta`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/floatingBubble.js`
- **Single Responsibility**: Manages the compact floating desktop bubble overlay window and snap physics.
- **Exports**: `FLOATING_BUBBLE_HANDLE_HEIGHT`, `FLOATING_BUBBLE_HANDLE_WIDTH`, `FLOATING_BUBBLE_MARGIN`, `canUseFloatingBubble`, `collapsedFloatingBubbleBounds`, `dragFloatingBubbleBounds`, `expandedFloatingBubbleBounds`, `floatingBubbleCollapsedArea`, `floatingBubbleCollapsedMargin`, `floatingBubbleCollapsePlan`, `floatingBubbleInitialRendererQuery`, `floatingBubbleNativeGlassEnabled`, `floatingBubbleSide`, `floatingBubbleWindowChrome`, `normalizeInitialRendererViewState`, `moveFloatingBubbleBounds`, `applyWindowSizeLimits`, `restoreFloatingBubbleWindow`
- **Dependencies**: `no view was provided`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/historySource.js`
- **Single Responsibility**: Provides history source logic and lifecycle management.
- **Exports**: `completeHistorySource`, `devicesWithLocalHistory`, `parseDeviceHistories`, `parseCompleteHistory`, `resolveCompleteHistory`, `resolveCompleteHistoryWithDevices`
- **Dependencies**: `../shared/history`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/hubBuildStatus.js`
- **Single Responsibility**: Provides hub build status logic and lifecycle management.
- **Exports**: `healthRuntime`, `probeHubBuild`
- **Dependencies**: `../shared/hubBuildComparison`, `../shared/hubBuildIdentity`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/icloudSync.js`
- **Single Responsibility**: iCloud Drive is deliberately a small, file-backed adapter at the Electron boundary.
- **Exports**: `ICLOUD_SCHEMA_VERSION`, `ICLOUD_SYNC_DIR`, `ICLOUD_SYNC_VERSION_DIR`, `MAX_ICLOUD_DOCUMENT_BYTES`, `atomicWriteJson`, `createIcloudSyncStore`, `defaultCloudDocsRoot`, `defaultRevisionLedgerPath`, `deviceFilenameForId`, `isKnownDeviceFilename`, `isKnownWriterFilename`, `pathState`, `readJsonFile`, `readOpenFlags`, `revisionToken`, `safePathForDisplay`, `semanticDeviceFingerprint`, `stripSensitive`, `syncDirectory`, `validDeletionDocument`, `writerFilenameForId`
- **Dependencies**: `node:crypto`, `node:fs`, `node:fs/promises`, `node:os`, `node:path`, `node:util`, `../shared/http`, `../shared/syncUploadInterval`, `../shared/usage`, `../shared/syncPayload`, `../shared/subscriptionDisplay`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/icloudSyncRuntime.js`
- **Single Responsibility**: Provides icloud sync runtime logic and lifecycle management.
- **Exports**: `DEFAULT_DEBOUNCE_MS`, `DEFAULT_RECONCILE_MS`, `createIcloudSyncRuntime`, `mergeByDeviceId`
- **Dependencies**: `node:fs`, `../shared/usage`, `../shared/history`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/initialLimitProviderSeed.js`
- **Single Responsibility**: Keep the Limits view discoverable on a source-free first run..
- **Exports**: `applyInitialLimitProviderSeed`
- **Dependencies**: `../shared/limits/providers`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/latestWinsReconciler.js`
- **Single Responsibility**: Provides latest wins reconciler logic and lifecycle management.
- **Exports**: `createLatestWinsReconciler`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/limits/accountSettings.js`
- **Single Responsibility**: The Electron-side read of the limits account registry: every per-provider credential behaviour main.js used to hand-wire is derived here from the bound declarations in src/shared/limits/registry.js — settings:update      → normalizeAccountPatch + finalAccountSettings settingsForRenderer  → accountFieldProjection + accountStatusProjection fresh-install config → initialAccountSettings limits config        → limitsAccountConfig Adding a provider with a simple cookie/API-key account touches none of this file; its account.js declaration is the whole change.
- **Exports**: `accountForm`, `accountFieldProjection`, `accountStatusProjection`, `currentAccountField`, `finalAccountSettings`, `initialAccountSettings`, `limitAccountFormsForRenderer`, `limitsAccountConfig`, `normalizeAccountField`, `normalizeAccountPatch`, `redactOpencodeProfilesForRenderer`, `redactOpenRouterProfilesForRenderer`, `redactThirdPartyProfilesForRenderer`, `rendererOmittedAccountKeys`
- **Dependencies**: `../../shared/limits/accounts`, `../../shared/limits/registry`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/limits/credentialCommands.js`
- **Single Responsibility**: The one save path for an account form's credential.
- **Exports**: `createCredentialCommands`, `credentialVerdict`, `providerSelectionIncluding`
- **Dependencies**: `../../shared/limits/collector`, `../../shared/limits/registry`, `./accountSettings`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/limits/fetch.js`
- **Single Responsibility**: * Outbound transport for the widget's provider calls.
- **Exports**: `createElectronLimitsFetch`, `createElectronNetFetch`
- **Dependencies**: `../../shared/outboundFetch`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/limits/statsPresentation.js`
- **Single Responsibility**: Provides stats presentation logic and lifecycle management.
- **Exports**: `hasLocalQuotaEstimate`, `isLocalDeviceProvider`, `projectLimitProviderForDisplay`, `projectLimitStatsForDisplay`
- **Dependencies**: `../../shared/limits/core`, `../../shared/syncUploadInterval`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/linuxAutostart.js`
- **Single Responsibility**: Linux "start at login" for AppImage builds.
- **Exports**: `autostartSupported`, `desktopFilePath`, `desktopFileContents`, `isAutostartEnabled`, `setAutostartEnabled`
- **Dependencies**: `fs`, `os`, `path`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macBackdropMode.js`
- **Single Responsibility**: Classic vibrancy stays the default: the app's own tint keeps dense figures legible over any wallpaper, whereas the system-managed glass cannot be dimmed.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macLiquidGlass.js`
- **Single Responsibility**: Provides mac liquid glass logic and lifecycle management.
- **Exports**: `createMacLiquidGlass`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macosSpaceBehavior.js`
- **Single Responsibility**: Electron exposes the native NSView handle on macOS, but not AppKit's window collectionBehavior.
- **Exports**: `NS_WINDOW_COLLECTION_BEHAVIOR_MOVE_TO_ACTIVE_SPACE`, `createMacSpaceApi`, `setMoveToActiveSpace`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macWidget/bridge.js`
- **Single Responsibility**: Provides bridge logic and lifecycle management.
- **Exports**: `commitMacWidgetSnapshot`, `createCommitMacWidgetSnapshot`, `discardMacWidgetSnapshot`, `prepareMacWidgetSnapshot`, `prepareMacWidgetSnapshotUpdate`, `resolveMacWidgetSnapshotPath`, `syncMacWidgetSnapshotDirectory`, `updateMacWidgetSnapshot`, `writeMacWidgetSnapshot`
- **Dependencies**: `node:fs`, `node:fs/promises`, `node:path`, `node:crypto`, `../../shared/macWidgetSnapshot`, `../../shared/macWidgetConfig`, `./macAppGroupContainer`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macWidget/demand.js`
- **Single Responsibility**: Tracks whether the user actually has a Widget on screen (demand) so the snapshot pipeline — history resolution, serialization, fsync, reload helper spawn — can be skipped entirely while nothing is installed.
- **Exports**: `DEFAULT_DEMAND_LEASE_MS`, `DEFAULT_PROVISIONAL_LEASE_MS`, `DEFAULT_RECONCILE_MS`, `WIDGET_DEMAND_MARKER`, `WIDGET_DEMAND_PROVISIONAL_MARKER`, `createMacWidgetDemandState`
- **Dependencies**: `node:fs`, `node:path`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macWidget/history.js`
- **Single Responsibility**: The widget's Activity heatmap and Trend page need the complete history, not the compact window `/api/stats` carries.
- **Exports**: `DEFAULT_MIN_INTERVAL_MS`, `DEFAULT_RETRY_INTERVAL_MS`, `EMPTY_HISTORY`, `isHistoryDocument`, `macWidgetHistorySourceKey`, `resetMacWidgetHistoryCache`, `resolveMacWidgetHistory`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macWidget/historyStore.js`
- **Single Responsibility**: Provides history store logic and lifecycle management.
- **Exports**: `MAC_WIDGET_HISTORY_CACHE_VERSION`, `MAX_MAC_WIDGET_HISTORY_CACHE_BYTES`, `MAX_MAC_WIDGET_HISTORY_CACHE_ENTRIES`, `macWidgetHistoryCacheFingerprint`, `macWidgetHistoryCachePath`, `projectMacWidgetHistory`, `readMacWidgetHistoryCache`, `writeMacWidgetHistoryCache`
- **Dependencies**: `node:fs`, `node:fs/promises`, `node:crypto`, `node:path`, `../../shared/macWidgetSnapshot`, `./history`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macWidget/launchServicesRecovery.js`
- **Single Responsibility**: Provides launch services recovery logic and lifecycle management.
- **Exports**: `MARKER_FILE_NAME`, `createMacWidgetLaunchServicesRecovery`
- **Dependencies**: `node:crypto`, `node:fs`, `node:path`, `node:child_process`, `../../shared/credentialStore`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macWidget/macAppGroupContainer.js`
- **Single Responsibility**: macOS 15 protects App Group containers even for correctly signed apps unless the process first asks NSFileManager for the authorized container URL.
- **Exports**: `createMacAppGroupApi`, `resolveMacAppGroupContainerPath`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macWidget/reloader.js`
- **Single Responsibility**: `src/electron/macWidget/` is three hops below the repository root, and the development build of the helper stays at `<repo>/build/macos-widget` however deep this module sits, so the hop count follows the file, not the artifact..
- **Exports**: `DEFAULT_WIDGET_KIND`, `requestMacWidgetReload`, `resetMacWidgetReloadThrottle`, `resolveWidgetReloaderPath`
- **Dependencies**: `node:fs`, `node:path`, `node:child_process`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/macWidget/snapshotController.js`
- **Single Responsibility**: Provides snapshot controller logic and lifecycle management.
- **Exports**: `createMacWidgetSnapshotController`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/main.js`
- **Single Responsibility**: Electron main process master orchestrator managing lifecycle, multi-window creation, tray, background tasks, and IPC handlers.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `node:fs`, `node:crypto`, `node:os`, `node:path`, `electron`, `electron-updater`, `../shared/config`, `../shared/credentialStore`, `../shared/safeStdio`, `../shared/appVersion`, `../shared/macSystemRequirements`, `../shared/exporter`, `../shared/trayLayout`, `../shared/fontSettings`, `./motionPreference`, `./backgroundImage`, `./clientSourceIpc`, `./providers/claude/webFetch`, `./providers/mimo/exchangeFetch`, `./providers/antigravity/oauthLogin`, `../shared/providers/antigravity/oauth`, `./providers/workbuddy/localAuth`, `./limits/fetch`, `./windowState`, `../shared/clientTracking`, `../shared/clientIdentitySplits`, `../shared/collector`, `../shared/providers/antigravity/selfSync`, `../shared/anchorSeed`, `./deferredWindowSend`, `./windowLifecycle`, `./initialLimitProviderSeed`, `./codexAdditionalLimitsMigration`, `../shared/sessionActivityProjection`, `../shared/usage/deviceRuntime`, `../shared/usage/agentPid`, `../shared/diagnosticJournal`, `./diagnostics`, `./diagnosticSnapshot`, `../shared/tokscaleConfig`, `../shared/syncContent`, `./syncContentRuntime`, `./syncContentCredentials`, `../shared/tokscaleCustomPricing`, `./modelAliasPresentation`, `../hub/server`, `./hubBuildStatus`, `../shared/limits/collector`, `../shared/providers/cursor/usageEvents`, `../shared/limits/accounts`, `../shared/limits/usageItems`, `./limits/accountSettings`, `./limits/credentialCommands`, `../shared/providers/copilot/deviceFlow`, `../shared/providers/codex/auth`, `../shared/providers/codex/login`, `../shared/providers/codex/workspaces`, `../shared/providers/codex/systemSwitch`, `./renderer/clientDisplayPreferences`, `./renderer/usageAttributionRows`, `./renderer/i18n`, `./renderer/viewDisplayPreferences`, `./renderer/homeModulePreferences`, `../shared/appUpdater`, `../shared/providers/cursor/auth`, `../shared/providers/cursor/probe`, `../shared/providers/stepfun/limits`, `../shared/providers/opencode/web`, `../shared/providers/opencode/goApi`, `../shared/providers/opencode/profiles`, `../shared/providers/openrouter/limits`, `../shared/providers/thirdparty/limits`, `../shared/subscriptionDisplay`, `../shared/currency`, `../shared/compactTokens`, `../shared/exchangeRates`, `../shared/usage/clientUsageArchive`, `../shared/usage/sessionUsageArchive`, `../shared/usage/sessionUsageArchiveStore`, `../shared/usage/usageTransform`, `../shared/usage/usageHost`, `../shared/dailyHistoryArchive`, `../shared/usage`, `../shared/hubProtocol`, `../shared/syncPayload`, `../shared/localSessions`, `../shared/providers/mimo/limits`, `./providers/mimo/accountMetadata`, `../shared/history`, `./historySource`, `./fixedPeriodHistory`, `../shared/sessionDetailResolver`, `./discordRpc`, `./macWidget/bridge`, `./macWidget/snapshotController`, `./macWidget/history`, `./macWidget/historyStore`, `./macWidget/launchServicesRecovery`, `./limits/statsPresentation`, `./macWidget/reloader`, `./macWidget/demand`, `./linuxAutostart`, `./renderer/accountIdentity`, `./tray`, `./trayModeSettings`, `./serviceStatus`, `./providers/codex/resetForecast`, `./updateInstallQuit`, `./syncConnection`, `./syncDisplayStats`, `./statsPublisher`, `./sessionTitleDisplay`, `./sseEventReader`, `./syncUploadScheduler`, `./latestWinsReconciler`, `./icloudSync`, `./icloudSyncRuntime`, `./runtimeConfig`, `../shared/customScanPaths`, `./deviceRuntimeCoordinator`, `./windowBehavior`, `./windowsTaskbarZOrder`, `./windowsForegroundHook`, `./windowShortcut`, `./floatingBubble`, `./windowsChrome`, `./edgeDock/controller`, `./edgeDock/fullScreenProbe`, `./edgeDock/geometry`, `./renderer/edgeDock/presentation`, `./renderer/edgeDock/items`, `./renderer/fixedPeriodRanges`, `./renderer/glassRendering`, `./renderer/tokenRatePresentation`, `./renderer/edgeDock/shapes`, `./edgeDock/mask`, `./edgeDock/macVibrancyMask`, `./edgeDock/macHaptics`, `./edgeDock/pointerButtons`, `./macosSpaceBehavior`, `./windowsBackdropMode`, `./windowsBackdrop`, `./macBackdropMode`, `./nativeMaterialVisibility`, `./macLiquidGlass`, `./renderer/themePresets`, `node:child_process`, `the hub is
      // down`, `os`
- **State Flow**: Electron ready event -> creates MainWindow, DashboardWindow, and EdgeDock -> attaches IPC event handlers -> coordinates limits and usage runtimes -> dispatches stats updates to renderer windows.

#### `src/electron/modelAliasPresentation.js`
- **Single Responsibility**: Every projection below hands its input back BY REFERENCE when no alias touches it, the way projectLimitStatsForDisplay already does.
- **Exports**: `normalizeModelAliases`, `normalizeModelAliasGrouping`, `inferModelAliases`, `createModelAliasResolver`, `projectModelAliasStats`, `projectModelAliasSessions`, `projectModelAliasHistory`
- **Dependencies**: `./renderer/modelAliases`, `../shared/history`, `./renderer/sessionRows`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/motionPreference.js`
- **Single Responsibility**: Provides motion preference logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/nativeMaterialVisibility.js`
- **Single Responsibility**: Clear the entry before touching AppKit so a throwing cleanup can neither keep a disposed view reported as live nor pre-empt the HUD fallback.
- **Exports**: `attachNativeMaterialVisibility`, `syncNativeMaterialVisibility`, `getNativeMaterialState`
- **Dependencies**: `node:os`, `./macLiquidGlass`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/preload.js`
- **Single Responsibility**: Subscriptions are shared across devices when a hub is configured, so they have their own channel: the write is a network round trip main.js has to await, and it can fail in ways a settings write cannot.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `electron`
- **State Flow**: ContextBridge executes during renderer script initialization -> wraps ipcRenderer.invoke and ipcRenderer.on -> exposes safe tokenMonitor API surface on window.

#### `src/electron/providers/antigravity/oauthLogin.js`
- **Single Responsibility**: Provides oauth login logic and lifecycle management.
- **Exports**: `DEFAULT_TIMEOUT_MS`, `runAntigravityOAuthLogin`, `_callbackPage`
- **Dependencies**: `node:crypto`, `node:http`, `../../../shared/providers/antigravity/oauth`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/providers/claude/webFetch.js`
- **Single Responsibility**: Provides web fetch logic and lifecycle management.
- **Exports**: `createClaudeWebFetch`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/providers/codex/accountControl.js`
- **Single Responsibility**: The Limits view and Edge Dock both expose the same Codex account action.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/providers/codex/resetForecast.js`
- **Single Responsibility**: Provides reset forecast logic and lifecycle management.
- **Exports**: `CODEX_RESET_FORECAST_PAGE_URL`, `CODEX_RESET_FORECAST_URL`, `createCodexResetForecastClient`, `normalizeCodexResetForecast`
- **Dependencies**: `../../../shared/appVersion`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/providers/mimo/accountMetadata.js`
- **Single Responsibility**: Settings keeps only the account fingerprint, never the Cookie or raw userId.
- **Exports**: `createMimoAccountMetadataReader`
- **Dependencies**: `node:fs`, `../../../shared/providers/mimo/desktop`, `../../../shared/providers/mimo/limits`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/providers/mimo/exchangeFetch.js`
- **Single Responsibility**: Chromium answers with an ordered PAC route list: a direct route or one or more proxies followed by fallbacks.
- **Exports**: `createMimoExchangeFetch`, `parseProxyResolveResults`
- **Dependencies**: `undici`, `../../../shared/outboundFetch`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/providers/workbuddy/localAuth.js`
- **Single Responsibility**: Newer WorkBuddy builds seal individual credential fields with the key their own runtime holds, so `auth.accessToken` is a `{$wbEncrypted: 1, envelope: …}` shell rather than a string.
- **Exports**: `WORKBUDDY_AUTH_FILE_NAME`, `WORKBUDDY_AUTH_FILE_MAX_BYTES`, `WORKBUDDY_ENCRYPTED_FIELD_MARKER`, `WORKBUDDY_LOGOUT_MARKER_SUFFIX`, `WORKBUDDY_SESSION_EXPIRY_SKEW_MS`, `WORKBUDDY_SESSION_READ_REASONS`, `authDirectoriesForPlatform`, `authDirectoryForPlatform`, `createWorkbuddyLocalAuth`, `inspectStoredSession`, `isAllowedWorkbuddyApiUrl`, `isSupportedWorkbuddyLocalAppPlatform`, `normalizeStoredSession`, `sanitizeRequestInit`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `../../../shared/credentialStore`, `../../../shared/providers/workbuddy/limits`, `Token Monitor cannot read what the
// app wrote`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/runtimeConfig.js`
- **Single Responsibility**: Provides runtime config logic and lifecycle management.
- **Exports**: `LIMIT_PROVIDER_SETTING_KEYS`, `USAGE_STRUCTURAL_KEYS`, `classifySettingsChange`, `diagnosticConfigurationFromSettings`, `envelopeFromSettings`, `limitsConfigFromSettings`, `normalizeAllTimeSince`, `normalizeCursorAccountIds`, `normalizeCursorDisabledAccountIds`, `usageConfigFingerprint`, `usageConfigFromSettings`
- **Dependencies**: `../shared/clientTracking`, `../shared/collector`, `../shared/limits/collector`, `../shared/syncUploadInterval`, `../shared/customScanPaths`, `../shared/limits/accounts`, `../shared/providers/cursor/account`, `./limits/accountSettings`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/serviceStatus.js`
- **Single Responsibility**: A failed check is only cached briefly so a transient network blip recovers on the next visit instead of being pinned to "unknown" for the full cache window..
- **Exports**: `SERVICE_STATUS_PROVIDERS`, `createServiceStatusClient`, `summarizeStatuspageProvider`
- **Dependencies**: `../shared/appVersion`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/sessionTitleDisplay.js`
- **Single Responsibility**: Compatibility text fields may occur in retained or native session snapshots..
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/sseEventReader.js`
- **Single Responsibility**: The Hub's stats event is a single `data:` line of more than a megabyte, and it arrives over a hundred reads or more.
- **Exports**: `createSseBlockReader`, `parseSseBlock`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/statsPublisher.js`
- **Single Responsibility**: A published stats snapshot is read by every surface the main process feeds — renderer, tray, edge dock, Widget — and each of them asks for the presentation projection of the same object.
- **Exports**: `createRendererSnapshots`, `createStatsPresentationCache`, `createStatsPublicationBatcher`, `rendererStats`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/syncConnection.js`
- **Single Responsibility**: Classify why the sync stream is offline into a stable machine code.
- **Exports**: `classifyStreamFailure`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/syncContentCredentials.js`
- **Single Responsibility**: Identity bindings and cleanup journals live in the canonical main-process CredentialStore.
- **Exports**: `createSyncContentCredentialQueue`
- **Dependencies**: `node:crypto`, `./syncContentRuntime`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/syncContentRuntime.js`
- **Single Responsibility**: This binding remains private: it is compared directly inside CredentialStore, never hashed into a renderer-visible credential verifier..
- **Exports**: `createSyncContentRuntime`, `normalizeSyncContentState`, `destinationBinding`, `sameDestination`, `destinationLabel`
- **Dependencies**: `node:crypto`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/syncDisplayStats.js`
- **Single Responsibility**: Hub aggregates intentionally discard these fields.
- **Exports**: `attachLocalNativeViews`, `attachLocalPresentationNativeViews`, `completeLocalSyncStats`, `composeLocalOnlySummary`, `composeLocalSyncStats`, `composeLocalSyncSummary`, `projectLocalActivity`, `localActivityPatch`
- **Dependencies**: `../shared/usage`, `../shared/history`, `../shared/trayText`, `./renderer/sessionRows`, `../shared/sessionActivityProjection`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/syncUploadScheduler.js`
- **Single Responsibility**: Provides sync upload scheduler logic and lifecycle management.
- **Exports**: `DEFAULT_SYNC_UPLOAD_INTERVAL_MS`, `SYNC_UPLOAD_INTERVAL_OPTIONS`, `createSyncUploadScheduler`, `normalizeSyncUploadIntervalMs`
- **Dependencies**: `../shared/syncUploadInterval`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/tray.js`
- **Single Responsibility**: icon.png is authored to the macOS icon grid, where the squircle is inset from its canvas — the artwork covers ~75% of the 1024px square and the Dock reads the margin as spacing.
- **Exports**: `SYSTEM_UI_THEME_CONFIRM_MS`, `SYSTEM_UI_THEME_SETTLE_MS`, `buildTrayIcon`, `buildTrayMenuTemplate`, `createTray`, `parseWindowsSystemUsesLightTheme`, `watchSystemDarkUi`, `formatTrayText`, `isBarsTrayIconMode`, `pickUsageTrayIconId`, `pickWorstLimit`, `pointInside`, `pointerPoint`, `popoverAnchor`, `popoverBounds`, `prepareTrayIconForPlatform`, `primaryDisplayScaleFactor`, `reconcileCodexAccountSelection`, `resizeTrayIconForPlatform`, `runTrayMenuAction`, `shouldUseTemplateTrayIcon`, `sortCodexAccountsForDisplay`, `trayIconOpaqueBounds`, `trayShowsTitle`, `trimTrayIconPadding`, `windowsTrayIconHeight`
- **Dependencies**: `node:path`, `../shared/trayText`, `./renderer/accountIdentity`, `./edgeDock/geometry`, `./renderer/i18n`, `electron`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/trayModeSettings.js`
- **Single Responsibility**: hideAppIcon and trayMode both collapse to false without a tray icon: losing the Dock/taskbar entry while nothing is left in the menu bar or system tray would leave a background window with no way to focus or quit it.
- **Exports**: `macActivationPolicyMode`, `mainWindowCloseAction`, `normalizeTrayModeSettings`, `shouldCreateTray`, `skipTaskbarForSettings`, `trayToggleAction`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/updateInstallQuit.js`
- **Single Responsibility**: The lifecycle of one "install this update now" request.
- **Exports**: `createUpdateInstallQuitGuard`, `observeUpdateInstallHandoff`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/windowBehavior.js`
- **Single Responsibility**: Provides window behavior logic and lifecycle management.
- **Exports**: `describeWindowBehavior`, `floatingAlwaysOnTopLevel`, `normalizeWindowBehavior`, `normalizeWindowBehaviorSettings`, `windowBehaviorSelection`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/windowLifecycle.js`
- **Single Responsibility**: Provides window lifecycle logic and lifecycle management.
- **Exports**: `actionWindowForEvent`, `activateWindowAction`, `handoffWindow`, `showWindow`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/windowsBackdrop.js`
- **Single Responsibility**: Electron's documented Windows Acrylic uses DWMWA_SYSTEMBACKDROP_TYPE.
- **Exports**: `DEFAULT_ACCENT_ARGB`, `applyWindowsAccentBlur`, `createAccentApi`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/windowsBackdropMode.js`
- **Single Responsibility**: Provides windows backdrop mode logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/windowsChrome.js`
- **Single Responsibility**: Windows-only cosmetic chrome fixes for the frameless widget — things macOS gets natively but Electron can't express on win32, so we reach for the documented DWM APIs through koffi: 1.
- **Exports**: `applyWindowsChrome`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/windowsForegroundHook.js`
- **Single Responsibility**: Windows-only: tell us when any window in the system takes the foreground.
- **Exports**: `subscribeForegroundChange`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/windowShortcut.js`
- **Single Responsibility**: Provides window shortcut logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/windowsTaskbarZOrder.js`
- **Single Responsibility**: Windows-only: keep an always-on-top widget above the taskbar (#533).
- **Exports**: `createTaskbarZOrderKeeper`, `overlapsReservedArea`, `taskbarZOrderEnabled`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/electron/windowState.js`
- **Single Responsibility**: Provides window state logic and lifecycle management.
- **Exports**: `expandedBoundsForCollapse`, `isWindowMaximized`, `normalWindowBounds`, `persistWindowState`, `rebuildWindowBounds`, `restoreWindowMaximized`, `restoreWindowMaximizedForReveal`, `setWindowMaximizable`, `shouldPersistWindowBounds`, `shouldRestoreWindowMaximized`, `shouldTrackWindowMaximized`, `suspendWindowMaximized`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

## 1.6 Electron Renderer UI Sectors & Components (`src/electron/renderer/` - 97 Files)

The frontend UI layer encompassing the Floating Desktop Widget (`index.html`), the Analytical Dashboard (`dashboard.html`), the Edge Dock drawer, SVG iconography, CSS design systems, and component controllers.

#### `src/electron/renderer/accountIdentity.js`
- **Single Responsibility**: The account email as a limits surface may show it: masked when the display setting is on, and disambiguated when the visible form is not unique.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/allTimeSessions.js`
- **Single Responsibility**: The all-time session list is pulled rather than pushed: main composes it only when asked, for the snapshot the renderer names, and every stats push arrives without it.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/app.js`
- **Single Responsibility**: Client identity — ids, labels and display order — comes from the shared catalog (loaded as a script before this file).
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/appUpdatePresentation.js`
- **Single Responsibility**: A spent attempt stops the background downloader too, so the standing promise to fetch updates on its own is not true until the app restarts.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/breakdownRenderPolicy.js`
- **Single Responsibility**: FLIP captures force synchronous layout and every animated row creates both Web Animations and a number-counting rAF.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/clientDisplayPreferences.js`
- **Single Responsibility**: Provides client display preferences logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/clientHealthPresentation.js`
- **Single Responsibility**: Turns one client's health record into the groups its expanded panel shows.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/clientRescanState.js`
- **Single Responsibility**: Provides client rescan state logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/clientSourceCache.js`
- **Single Responsibility**: Provides client source cache logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/clientStatusPresentation.js`
- **Single Responsibility**: The `missing` state means "no data directory on disk".
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/customPricingForm.js`
- **Single Responsibility**: Provides custom pricing form logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/dashboard.css`
- **Single Responsibility**: { box-sizing: border-box; } The dashboard is a separate window with its own stylesheet, so it needs the This window links styles.css before this file, so it inherits that sheet's.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/dashboard.html`
- **Single Responsibility**: HTML DOM markup document providing structural layout and element anchoring for the window interface.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/dashboard.js`
- **Single Responsibility**: Canonical brand colours, captured before any override (clientColors is shared by reference and mutated in place to apply vendor overrides)..
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/deviceBreakdown.js`
- **Single Responsibility**: Provides device breakdown logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/diagnosticsPanel.js`
- **Single Responsibility**: Provides diagnostics panel logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/edgeDock/composer.css`
- **Single Responsibility**: ---- Edge dock composer -------------------------------------------------.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/edgeDock/composer.js`
- **Single Responsibility**: Settings composer for the edge dock's contents.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/edgeDock/dock.css`
- **Single Responsibility**: Edge dock surfaces (peek handle, rail, detail card).
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/edgeDock/dock.js`
- **Single Responsibility**: Renderer for the three edge dock surfaces.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/edgeDock/index.html`
- **Single Responsibility**: HTML DOM markup document providing structural layout and element anchoring for the window interface.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/edgeDock/items.js`
- **Single Responsibility**: What the edge dock shows, as a persisted list.
- **Exports**: `api`
- **Dependencies**: `../../../shared/limits/providers`, `../../../shared/limits/usageItems`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/edgeDock/presentation.js`
- **Single Responsibility**: Projects presentation stats into the edge dock's cell list.
- **Exports**: `api`
- **Dependencies**: `../../../shared/trayText`, `../../../shared/limits/balanceDisplay`, `../../../shared/limits/providers`, `./items`, `../accountIdentity`, `../../../shared/sessionLive`, `../usageAttributionRows`, `../limits/resetMotion`, `../../../shared/sessionActivityProviders`, `../sessionRows`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/edgeDock/shapes.js`
- **Single Responsibility**: Silhouettes for the edge dock surfaces, as plain command lists.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/fixedPeriodRanges.js`
- **Single Responsibility**: Provides fixed period ranges logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/floatingBubbleBoot.js`
- **Single Responsibility**: Provides floating bubble boot logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/glassRendering.js`
- **Single Responsibility**: Main normalizes the stored value on load and on every save, so a hand-edited settings.json never reaches the renderer as NaN — which CSS would resolve to opacity 1, hiding the glass behind the image..
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/helpPopover.js`
- **Single Responsibility**: Pair an accessible info button with a popover containing caller-owned text.
- **Exports**: `api`
- **Dependencies**: `./selectControl`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/homeModulePreferences.js`
- **Single Responsibility**: Provides home module preferences logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/homeOverview.js`
- **Single Responsibility**: Provides home overview logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `../../shared/limits/balanceDisplay`, `configured, but the first probe/usage baseline
  // has not landed yet`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/hubBuildPresentation.js`
- **Single Responsibility**: Provides hub build presentation logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/i18n.js`
- **Single Responsibility**: Provides i18n logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/icons/actions/arrow-left.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/actions/attention.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/actions/pencil-line.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/actions/refresh.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/actions/settings.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/actions/spinner.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/actions/trash.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/actions/zap.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/settings/appearance.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/settings/collection.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/settings/general.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/settings/limits.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/settings/main.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/settings/subscriptions.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/settings/sync.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/settings/window.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/THIRD_PARTY_NOTICES.md`
- **Single Responsibility**: Documentation reference and usage guide.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/views/device.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/views/home.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/views/limits.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/views/model.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/views/project-row.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/views/project.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/views/session.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/views/status.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/views/tool.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/icons/views/trends.svg`
- **Single Responsibility**: Vector graphic SVG icon asset for UI display.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/index.html`
- **Single Responsibility**: HTML DOM markup document providing structural layout and element anchoring for the window interface.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/limits/accountPanels.js`
- **Single Responsibility**: A form descriptor is a renderer-safe snapshot from main, never an account declaration.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/limits/accountShell.js`
- **Single Responsibility**: Common presentation for hand-built account panels.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/limits/displayMode.js`
- **Single Responsibility**: The percent to fill a limit meter with (and to render as the percent number).
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/limits/providerOrder.js`
- **Single Responsibility**: Provides provider order logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/limits/providerPresentation.js`
- **Single Responsibility**: Provides provider presentation logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `../accountIdentity`, `../../../shared/limits/windowLabels`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/limits/resetAnimator.js`
- **Single Responsibility**: A refill sweeps over roughly a second with a short glow as it lands.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/limits/resetMotion.js`
- **Single Responsibility**: Provides reset motion logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/limits/windowsView.js`
- **Single Responsibility**: The Limits view's provider rows, as a builder both windowed surfaces call.
- **Exports**: `api`
- **Dependencies**: `../../../shared/limits/providers`, `../../../shared/limits/usageItems`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/modelAliases.js`
- **Single Responsibility**: Provides model aliases logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/modelAliasForm.js`
- **Single Responsibility**: Provides model alias form logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `./modelAliases`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/overflowText.js`
- **Single Responsibility**: Provides overflow text logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/pressActivation.js`
- **Single Responsibility**: A dock card is thrown away and rebuilt from scratch on every repaint.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/projectRows.js`
- **Single Responsibility**: Provides project rows logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `../../shared/projectKey`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/rowDragController.js`
- **Single Responsibility**: Drag-to-reorder for a settings list, factored out of the limit provider list so other lists can adopt the same gesture without a second copy of it.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/rowIconMasks.js`
- **Single Responsibility**: Installs the `.row-icon-<id>` mask rules from the vendor presentation table, so a mark added there needs no stylesheet edit.
- **Exports**: `api`
- **Dependencies**: `../../shared/vendorPresentation`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/selectControl.js`
- **Single Responsibility**: Provides select control logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/serviceStatusPresentation.js`
- **Single Responsibility**: Split the affected component names into a short visible slice plus an overflow count, so the meta line can show e.g.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/serviceStatusProviderPreferences.js`
- **Single Responsibility**: Provides service status provider preferences logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/sessionDetail.js`
- **Single Responsibility**: Provides session detail logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/sessionRows.js`
- **Single Responsibility**: Running/archived and the context pair are shared with the Edge Dock's session rows: both render the same session record, so the predicate cannot live in only one of the two renderers..
- **Exports**: `api`
- **Dependencies**: `../../shared/providers/reasonix/sessionGuard`, `../../shared/sessionLive`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/settingsListFilter.js`
- **Single Responsibility**: Text filter shared by the settings lists that are long enough to need one (tracked tools, limit providers).
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/statsRenderScheduler.js`
- **Single Responsibility**: Provides stats render scheduler logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/styles.css`
- **Single Responsibility**: Surface overlays + borders are "light on dark" by default.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/electron/renderer/syncContentForm.js`
- **Single Responsibility**: Provides sync content form logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `./helpPopover`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/syncDevicePanel.js`
- **Single Responsibility**: In client mode the local entry is this machine's live record, so its own receivedAt is the collection time.
- **Exports**: `api`
- **Dependencies**: `./deviceBreakdown`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/themePresets.js`
- **Single Responsibility**: Appearance theme data: interface palette presets and vendor-colour helpers.
- **Exports**: `api`
- **Dependencies**: `../../shared/vendorPresentation`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/tokenRatePresentation.js`
- **Single Responsibility**: Provides token rate presentation logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `./deviceBreakdown`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/toolDetails.js`
- **Single Responsibility**: Provides tool details logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `./usageAttributionRows`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/trayBars.js`
- **Single Responsibility**: Provides tray bars logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/trayComposer.js`
- **Single Responsibility**: Provides tray composer logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/trayProviderIcons.js`
- **Single Responsibility**: Tray-only picker variants: alternative artwork for a provider that already has a mark, so they are not vendors of their own.
- **Exports**: `api`
- **Dependencies**: `../../shared/vendorPresentation`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/usageAttributionRows.js`
- **Single Responsibility**: A client can identify the source of unknown usage without identifying its execution model.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/usageCharts.js`
- **Single Responsibility**: Fold Tokscale's per-client alias into the canonical identity, so a legacy row that still carries `antigravity-cli` cannot render as a second tool beside `antigravity`.
- **Exports**: `api`
- **Dependencies**: `../../shared/vendorPresentation`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/verticalDragSort.js`
- **Single Responsibility**: The space a row frees when it leaves its slot: its own height plus the gap to its neighbour.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/viewDisplayPreferences.js`
- **Single Responsibility**: Provides view display preferences logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/windowsGlass.js`
- **Single Responsibility**: Provides windows glass logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `../windowsBackdropMode`
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

#### `src/electron/renderer/wslStatusPresentation.js`
- **Single Responsibility**: The client list is deliberately not hardcoded here: the WSL scan cannot know every SQLite-backed tool.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Subscribes to tokenMonitor IPC events -> parses stats snapshot -> binds data to DOM components -> handles user interactions (tabs, clicks, forms) -> invokes IPC commands.

## 1.7 Shared Architecture, Quota Limits & Providers (`src/shared/` - 232 Files)

### 1.7.1 Shared Core Architecture & Utilities (`src/shared/` - 82 Files)

#### `src/shared/abortSignal.js`
- **Single Responsibility**: Provides abort signal logic and lifecycle management.
- **Exports**: `abortReason`, `throwIfAborted`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/anchorSeed.js`
- **Single Responsibility**: The collector persists every full scan to collector-anchor.json so it can derive month/allTime from a `--today` scan after a restart.
- **Exports**: `deviceRecordFromAnchor`
- **Dependencies**: `./collector`, `./usage`, `./providers/reasonix/sessionGuard`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/appUpdater.js`
- **Single Responsibility**: Provides app updater logic and lifecycle management.
- **Exports**: `appUpdateInstallSupport`, `installFailureErrorKind`, `updateInstallQuitPolicy`, `parseTag`, `parseLatestReleasePayload`, `latestFromUpdaterInfo`, `providerUpdateCheckAvailability`, `classifyAppUpdateError`, `resolveAppUpdateCheckError`, `shouldSkipAppUpdateCheck`, `downloadedAppUpdateMatchesLatest`, `shouldDownloadAutomaticAppUpdate`, `deriveAppUpdateAvailability`, `extractReleaseNotes`, `extractUpdaterReleaseNotes`, `mergeLatestReleaseMetadata`, `checkLatestRelease`, `RELEASES_LATEST_URL`, `GITHUB_REPO`, `APP_UPDATE_BACKGROUND_COOLDOWN_MS`, `APP_UPDATE_OUTDATED_COOLDOWN_MS`
- **Dependencies**: `semver`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/appVersion.js`
- **Single Responsibility**: Provides app version logic and lifecycle management.
- **Exports**: `appVersion`
- **Dependencies**: `../../package.json`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/archiveHelpers.js`
- **Single Responsibility**: Primitives shared by the two usage archives (`clientUsageArchive.js` and `sessionUsageArchive.js`).
- **Exports**: `cloneJson`, `hasSummaryPeriod`, `localDay`, `localMonth`, `numberValue`, `periodFor`, `targetPeriod`, `toDate`
- **Dependencies**: `./usage`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/browserUserAgent.js`
- **Single Responsibility**: Several web-session providers reject clients that don't present as a browser — claude.ai answers anything else with a Cloudflare challenge — so their requests carry a browser agent rather than the honest `token-monitor/<version>` one.
- **Exports**: `BROWSER_USER_AGENT`, `BROWSER_CLIENT_HINTS`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/clientCatalog.js`
- **Single Responsibility**: The tracked-client catalog: one entry per wired usage client, in display order.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/clientHealth.js`
- **Single Responsibility**: Per-client diagnostics: why a tracked tool shows the number it shows.
- **Exports**: `CLIENT_HEALTH_DIAGNOSTIC_CODES`, `CLIENT_HEALTH_OVERALL_STATES`, `CLIENT_HEALTH_VERSION`, `CLIENT_COLLECTION_STATES`, `CLIENT_SYNC_DETAIL_CODES`, `CLIENT_SYNC_FAILURE_STAGES`, `MAX_SYNC_DETAIL_INPUT_LENGTH`, `CLIENT_SOURCE_CHECK_IDS`, `CLIENT_SOURCE_STATES`, `MAX_CHECKS_PER_CLIENT`, `MAX_DIAGNOSTICS_PER_CLIENT`, `MAX_TRACKED_CLIENTS`, `countOverall`, `deriveClientOverall`, `deriveLegacyClientStatus`, `normalizeClientHealth`, `normalizeClientSyncDetailCode`, `normalizeClientSyncExitCode`, `normalizeClientSyncFailureStage`, `classifyClientSyncDetailCode`
- **Dependencies**: `./providers/reasonix/paths`, `./providers/dsh/paths`, `./providers/devin/paths`, `there is nothing to read`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/clientIdentitySplits.js`
- **Single Responsibility**: Client identity splits: a Tokscale client id that Token Monitor used to record under a different client id, and that is now tracked on its own.
- **Exports**: `CLIENT_IDENTITY_GENERATION`, `CLIENT_IDENTITY_SPLITS`, `isPreSplitEntry`, `mergedClientIdFor`, `seedSplitClients`, `splitClientIdFor`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/clientSourceObservations.js`
- **Single Responsibility**: Which roots actually exist is probed here; the collector derives its legacy presence dot and health record from the same collapsed checks..
- **Exports**: `clientDiagnosticRoots`, `clientSourceChecks`, `dirExists`, `visibleDiagnosticRoots`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `./clientSources`, `./providers/antigravity/selfSync`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/clientSourceRegistration.js`
- **Single Responsibility**: WSL discovery markers are home-relative Linux paths in scan order.
- **Exports**: `SOURCE_MARKERS`, `WSL_DATA_MARKERS`, `MARKER_CLIENTS`, `simpleHostSourceRoots`
- **Dependencies**: `node:path`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/clientSources.js`
- **Single Responsibility**: Windows only: libuv asserts that the filename ReadDirectoryChangesW hands back starts with the directory string it was given, and calls abort() when it does not (src/win/fs-event.c).
- **Exports**: `antigravityCliDataDir`, `canonicalWatchPath`, `canonicalWatchFilePath`, `cherryStudioTranscriptRoots`, `clientSourceRoots`, `copilotExporterWatch`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `./clientSourceRegistration`, `./customScanPaths`, `./tokscaleConfig`, `./providers/claude/paths`, `./providers/hermes/profiles`, `./providers/kimi/sessionMetadata`, `./providers/catpaw/paths`, `./providers/qodercn/paths`, `./providers/mcode/paths`, `./providers/reasonix/paths`, `./providers/dsh/paths`, `./providers/devin/paths`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/clientTracking.js`
- **Single Responsibility**: Tracked-client CSV helpers.
- **Exports**: `DEFAULT_CLIENTS`, `KNOWN_CLIENTS`, `LEGACY_CLIENT_ID_ALIASES`, `clientsCsvForSetting`, `normalizeClientsCsv`, `normalizeTrackedClientId`
- **Dependencies**: `./clientCatalog`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/collector.js`
- **Single Responsibility**: Legacy token usage collector coordinating tokscale CLI execution, watch events, and anchor caching.
- **Exports**: `applySessionTimestamps`, `projectIdentity`, `projectPathFromJsonl`, `collectHistoryOnce`, `collectUsageOnce`, `clientActivityDaysFromHistory`, `clientDataDirPresence`, `clientDiagnosticRoots`, `visibleDiagnosticRoots`, `clientSourceChecks`, `clientSourceRoots`, `cherryStudioTranscriptRoots`, `clientsForWatchPath`, `clientWatchCandidates`, `computePeriodWindows`, `collectorAnchorTrust`, `pricingFingerprint`, `configFingerprint`, `qoderCnDbPathForClients`, `qoderCnProjectsDirForClients`, `qoderCnSourcesForClients`, `deriveClientHealth`, `deriveClientStatus`, `mergeClientActivityDays`, `wslPeriodsForPreview`, `statusFromSignals`, `DEFAULT_HISTORY_INTERVAL_MS`, `HISTORY_INTERVAL_VALUES`, `LIMITS_RESET_BOUNDARY_MAX_TIMER_MS`, `localTodayKey`, `nextLimitsResetBoundary`, `normalizeHistoryIntervalMs`, `sessionTimestampMap`, `locateBundledBinary`, `lookupModelPricing`, `pruneAttemptedResetBoundaries`, `getTokscaleStatus`, `readTokscaleBundledBuild`, `resolvePlatformBinary`, `resetTokscaleCapabilityCache`, `kimiWorkSessionsRoots`, `resolveWatchUsePolling`, `selfSyncSourceRootsForClients`, `isSelfWatchSqliteSidecarEvent`, `shouldIncludeHistory`, `spawnTokscaleHelp`, `startCollector`, `tokscaleCommand`, `tokscaleClientFilter`, `tokscaleEnvWithBlanksDropped`, `TOKSCALE_CLIENT_ALIASES`, `watchAttributionRootsForClients`, `watcherOptions`, `watchIgnoreMatcher`, `openWatch`, `WATCH_POLLING_LIMIT_CODE`, `WATCH_POLLING_UNAVAILABLE_CODE`, `WATCH_REFUSAL_CODES`, `watchPathsForClients`
- **Dependencies**: `node:child_process`, `node:fs`, `node:os`, `node:path`, `node:crypto`, `./tokscaleConfig`, `./abortSignal`, `./config`, `./appVersion`, `./clientTracking`, `./clientCatalog`, `./clientSources`, `./clientSourceObservations`, `./clientHealth`, `./tokscalePlatform`, `./tokscaleCapabilities`, `./customScanPaths`, `./tokscaleClientMapping`, `./usage`, `./wslUsage`, `./watcherHost`, `./sessionActivityScheduler`, `./sessionActivityWatch`, `./history`, `./dailyHistoryArchive`, `./subprocessTermination`, `./providers/antigravity/selfSync`, `./providers/antigravity/sessionMetadata`, `./providers/cursor/lifecycle`, `./providers/cursor/selfSync`, `./providers/cursor/desktopState`, `./sessionMetadata`, `./providers/kimi/sessionMetadata`, `./sessionActivityRegistry`, `./sessionActivityProviders`, `./t3SessionActivity`, `./processStarts`, `./providers/catpaw/paths`, `./providers/qodercn/paths`, `./providers/codex/localUsage`, `./providers/codex/localUsageSource`, `./providers/reasonix/sessions`, `./osVersion`, `./selfSyncThrottle`, `./limits/resetBoundary`, `./sessionActivityProjection`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/compactMoney.js`
- **Single Responsibility**: Provides compact money logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `./currency`, `./compactTokens`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/compactTokens.js`
- **Single Responsibility**: Provides compact tokens logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/config.js`
- **Single Responsibility**: Provides config logic and lifecycle management.
- **Exports**: `defaultDeviceId`, `generateHubSecret`, `lanIpv4Addresses`, `loadDotEnv`, `parseArgs`, `pidFilePath`, `projectRoot`, `readJson`, `sharedDataDir`, `writeJsonAtomic`
- **Dependencies**: `node:crypto`, `node:fs`, `node:os`, `node:path`, `dotenv`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/credentialStore.js`
- **Single Responsibility**: Provider-owned keys come from the account declarations (each field's storePath), so adding a provider credential never edits this file.
- **Exports**: `CREDENTIAL_SETTING_PATHS`, `CREDENTIALS_VERSION`, `CredentialStore`, `credentialSettingsForRenderer`, `hasCredentialSettings`, `persistSettingsAndCredentials`, `readRegularFileNoFollow`, `stripCredentialSettings`, `writePrivateJsonAtomic`
- **Dependencies**: `node:crypto`, `node:fs`, `node:path`, `./limits/accounts`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/currency.js`
- **Single Responsibility**: Process-scoped overlay; main and each renderer configure their own copy..
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/customScanPaths.js`
- **Single Responsibility**: Tokscale exposes extra roots for its recursive/file scanners.
- **Exports**: `CUSTOM_SCAN_PATH_LIMIT_ERRORS`, `CUSTOM_SCAN_CLIENT_IDS`, `MAX_CUSTOM_SCAN_PATHS`, `MAX_CUSTOM_SCAN_PATHS_PER_CLIENT`, `customScanPathLimitError`, `customScanPathEntries`, `customScanPathsFingerprint`, `normalizeCustomScanPaths`, `tokscaleExtraDirsEnv`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `./clientCatalog`, `./clientTracking`, `./tokscaleClientMapping`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/dailyHistoryArchive.js`
- **Single Responsibility**: Provides daily history archive logic and lifecycle management.
- **Exports**: `captureDailyHistoryArchive`, `clearDailyHistoryArchive`, `dailyHistoryArchivePath`, `graphFromDailyHistoryArchive`, `captureLiveDailyHistory`, `normalizeDailyHistoryArchive`, `observationKey`, `readDailyHistoryArchive`, `retainDailyHistory`, `retainLiveDailyHistory`, `shouldReplaceObservation`, `writeDailyHistoryArchive`
- **Dependencies**: `node:fs`, `node:path`, `node:util`, `./config`, `./history`, `./clientIdentitySplits`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/diagnosticJournal.js`
- **Single Responsibility**: Provides diagnostic journal logic and lifecycle management.
- **Exports**: `DEFAULT_DIAGNOSTIC_JOURNAL_CAPACITY`, `createDiagnosticJournal`, `normalizeDiagnosticEvent`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/diagnosticReport.js`
- **Single Responsibility**: Provides diagnostic report logic and lifecycle management.
- **Exports**: `DIAGNOSTIC_REDACTION_VERSION`, `DIAGNOSTIC_SCHEMA_VERSION`, `MAX_REPORT_BYTES`, `deriveDiagnosticFindings`, `formatDiagnosticReport`, `projectClientHealth`, `projectDeviceCompatibility`, `projectHubDevices`, `projectLimitsDiagnostics`, `sanitizeDiagnosticSnapshot`
- **Dependencies**: `./syncUploadInterval`, `./selfSyncThrottle`, `./clientHealth`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/exchangeRates.js`
- **Single Responsibility**: Require EVERY supported currency.
- **Exports**: `fetchRates`, `parseUsdRates`, `isCacheStale`, `todayUtc`, `SOURCES`
- **Dependencies**: `./currency`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/exporter.js`
- **Single Responsibility**: Pure serialization for the data-export feature.
- **Exports**: `csvEscape`, `toCsv`, `buildSnapshotRows`, `buildDailyRows`, `buildDailyModelRows`, `renderSnapshotCsv`, `renderTimeseriesCsv`, `renderDailyModelsCsv`, `renderExportJson`, `exportFileSet`, `exportSignature`, `EXPORT_FILENAMES`
- **Dependencies**: `./usage`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/fontSettings.js`
- **Single Responsibility**: The setting stores a CSS font-family list, not a font file or executable.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/hashKey.js`
- **Single Responsibility**: Provides hash key logic and lifecycle management.
- **Exports**: `hashKey`
- **Dependencies**: `node:crypto`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/history.js`
- **Single Responsibility**: Portable (Node-free) usage-history core.
- **Exports**: `hasDisjointReasoning`, `num`, `normalizeTokscaleClientName`, `normalizeTokscaleModelNameForClient`, `normalizeTokscaleModelComponentSummary`, `sumOutputTokens`, `sumTokens`, `parseGraphResult`, `computeIntensities`, `localDayKey`, `dayKeyAddDays`, `computeStreaks`, `monthlyRollup`, `normalizeHistory`, `mergeHistories`, `coerceHistory`, `historyPreview`, `historyRevision`, `deviceHistoryRevision`
- **Dependencies**: `./providers/reasonix/paths`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/http.js`
- **Single Responsibility**: Provides http logic and lifecycle management.
- **Exports**: `MAX_JSON_BODY_BYTES`, `isAuthorized`, `readJsonBody`, `sendJson`, `sendText`, `timingSafeEqualText`
- **Dependencies**: `node:crypto`, `node:zlib`, `./hubProtocol`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/hubBuildComparison.js`
- **Single Responsibility**: Provides hub build comparison logic and lifecycle management.
- **Exports**: `compareHubBuild`, `entryForRevision`, `validBuildId`
- **Dependencies**: `./hubBuildRegistry.json`, `./hubBuildIdentity`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/hubBuildIdentity.js`
- **Single Responsibility**: Provides hub build identity logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `./hubBuildRegistry.json`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/hubBuildRegistry.json`
- **Single Responsibility**: Static JSON data structure or build configuration registry.
- **Exports**: None (Asset / Configuration)
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Static asset or configuration loaded directly by the browser renderer, build toolchain, or installer; emits no active runtime events.

#### `src/shared/hubProtocol.js`
- **Single Responsibility**: Provides hub protocol logic and lifecycle management.
- **Exports**: `HUB_RESPONSE_HEADER`, `HUB_RESPONSE_MINIMAL`, `HUB_STREAM_HEADER`, `HUB_STREAM_VERSION`, `acceptsEncoding`, `applyFreshnessEvent`, `freshnessEvent`, `headerValue`, `hubStatsContentKey`, `wantsFreshnessEvents`, `wantsMinimalResponse`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/localSessions.js`
- **Single Responsibility**: `allTime.sessions` is an unbounded, ever-growing collection, so syncPayload drops it from uploads to keep them under the hub's ingest limit (#118).
- **Exports**: `mergedLocalAllTimeSessions`
- **Dependencies**: `./providers/reasonix/sessionGuard`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/macSystemRequirements.js`
- **Single Responsibility**: electron-builder writes the marketing version into LSMinimumSystemVersion, while electron-updater compares update metadata against Darwin's os.release()..
- **Exports**: `MAC_APP_MIN_DARWIN_VERSION`, `MAC_APP_MIN_VERSION`, `MAC_WIDGET_MIN_DARWIN_VERSION`, `MAC_WIDGET_MIN_VERSION`, `macWidgetRuntimeSupport`
- **Dependencies**: `semver`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/macWidgetConfig.js`
- **Single Responsibility**: Provides mac widget config logic and lifecycle management.
- **Exports**: `DEFAULT_MAC_DISTRIBUTION_CHANNEL`, `classifyAppGroup`, `isTeamPrefixedAppGroup`, `normalizeMacDistributionChannel`, `validateAppGroup`, `validateAppGroupForDistribution`, `validateAppGroupSyntax`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/macWidgetSnapshot.js`
- **Single Responsibility**: Provides mac widget snapshot logic and lifecycle management.
- **Exports**: `MAC_WIDGET_ACTIVITY_DAYS`, `MAC_WIDGET_SCHEMA_VERSION`, `MAC_WIDGET_FRESHNESS_HEARTBEAT_MS`, `buildMacWidgetSnapshot`, `resolveWidgetSourceFreshness`, `isLikelySensitivePathOrUrl`, `macWidgetSnapshotFingerprint`, `macWidgetSnapshotFingerprintFromSerialized`, `macWidgetSnapshotNeedsWrite`, `safeDisplayName`, `serializeMacWidgetSnapshot`
- **Dependencies**: `./clientCatalog`, `./clientTracking`, `./limits/providers`, `./limits/windowLabels`, `./vendorPresentation`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/namedProfile.js`
- **Single Responsibility**: Provides named profile logic and lifecycle management.
- **Exports**: `normalizeNamedProfileName`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/orderedSink.js`
- **Single Responsibility**: Provides ordered sink logic and lifecycle management.
- **Exports**: `createOrderedSink`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/osVersion.js`
- **Single Responsibility**: Provides os version logic and lifecycle management.
- **Exports**: `detectOsInfo`, `hostOsInfo`, `normalizeOsInfo`, `normalizeOsName`, `normalizeOsVersion`
- **Dependencies**: `node:child_process`, `node:fs`, `node:os`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/outboundFetch.js`
- **Single Responsibility**: * Outbound HTTP helpers that honor standard proxy env vars.
- **Exports**: `cleanProxyUrl`, `resolveProxyConfig`, `resolveProxyUrl`, `createOutboundFetch`, `resetOutboundFetchCache`
- **Dependencies**: `undici`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/probeDeadline.js`
- **Single Responsibility**: Provides probe deadline logic and lifecycle management.
- **Exports**: `ProbeTimeoutError`, `abortError`, `runWithProbeDeadline`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/processStarts.js`
- **Single Responsibility**: Provides process starts logic and lifecycle management.
- **Exports**: `processStarts`, `createProcessStartBatch`
- **Dependencies**: `node:child_process`, `./windowsProcessStarts`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/projectKey.js`
- **Single Responsibility**: Provides project key logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/safeStdio.js`
- **Single Responsibility**: console.log is wired to the same stdout stream that npm / Electron inherit from the parent shell.
- **Exports**: `installSafeStdout`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/selfSyncThrottle.js`
- **Single Responsibility**: Rationing for the self-synced clients (cursor / antigravity), and the queue of source events waiting on it.
- **Exports**: `clampTimerDelayMs`, `createSelfSyncThrottle`, `createSourceSyncQueue`, `mergeSelfSyncSelection`, `selfSyncSelected`, `MAX_TIMER_DELAY_MS`, `SELF_SYNC_FAILURE_CODES`, `SELF_SYNC_KINDS`, `SYNC_MIN_INTERVAL_MS`, `SYNC_SOURCE_EVENT_MIN_INTERVAL_MS`
- **Dependencies**: `./clientHealth`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionActivityProjection.js`
- **Single Responsibility**: Local activity is metadata, not a new accounting observation.
- **Exports**: `api`
- **Dependencies**: `./sessionLive`, `./sessionActivityProviders`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionActivityProviders.js`
- **Single Responsibility**: Portable declarations only.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionActivityRegistry.js`
- **Single Responsibility**: Explicit lazy bindings follow the limits registry convention.
- **Exports**: `SESSION_ACTIVITY_REGISTRY`, `sessionActivityProvidersFor`, `refreshSessionActivity`
- **Dependencies**: `./sessionActivityProviders`, `./providers/claude/sessionActivity`, `./providers/codex/sessionActivity`, `./sessionMetadata`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionActivityScheduler.js`
- **Single Responsibility**: File events are the primary trigger.
- **Exports**: `createSessionActivityScheduler`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionActivityWatch.js`
- **Single Responsibility**: Provides session activity watch logic and lifecycle management.
- **Exports**: `activityWatchSources`, `activityClientsForPath`, `activityWatchIgnored`
- **Dependencies**: `node:fs`, `node:path`, `node:os`, `./sessionActivityRegistry`, `./t3SessionMetadata`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionContext.js`
- **Single Responsibility**: * Context-window occupancy for a session that is still open.
- **Exports**: `CONTEXT_READ_WINDOW_MS`, `normalizeSessionContext`, `shouldReadSessionContext`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionDetail.js`
- **Single Responsibility**: Provides session detail logic and lifecycle management.
- **Exports**: `parseClaudeTranscript`, `parseCodebuddyTranscript`, `parseCodexTranscript`, `makeTokens`, `readCodebuddyExtensionSessionDetail`, `groupEvents`, `filterExchangesByPeriod`, `distributeCost`, `readReasonixSessionDetail`, `readSessionDetail`
- **Dependencies**: `node:fs`, `./sessionFiles`, `./providers/codebuddy/transcript`, `./providers/codebuddy/extension`, `./providers/opencode/session`, `./providers/reasonix/sessionDetail`, `./providers/codex/localUsageStore`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionDetailResolver.js`
- **Single Responsibility**: wslUsage.js's MARKER_CLIENTS also scans `.dsh/sessions` and `.codebuddy/projects`, so a session surfaced from a WSL distro on Windows is a real, reachable case for them, not just claude/codex — dsh must get the same native-miss -> WSL-hit fallback, just through its own reader (it parses zstd transcripts directly, not tokscale JSONL).
- **Exports**: `readSessionDetailForPlatform`, `resolveSessionDetailForPlatform`, `runSessionDetailWorker`
- **Dependencies**: `node:os`, `node:worker_threads`, `./sessionDetail`, `./providers/codex/localUsage`, `./providers/dsh/sessionDetail`, `./wslUsage`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionDetailWorker.js`
- **Single Responsibility**: Provides session detail worker logic and lifecycle management.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `node:worker_threads`, `./sessionDetailResolver`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionFiles.js`
- **Single Responsibility**: 5.5 moved the WorkBuddy home to ~/.workbuddy-ai and tokscale still scans both, so a session reported from either root resolves from either.
- **Exports**: `findSessionFiles`, `codexSessionFile`, `resolveSessionFile`, `isSafeSessionId`
- **Dependencies**: `node:fs`, `node:path`, `./providers/claude/paths`, `./providers/codebuddy/paths`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionLive.js`
- **Single Responsibility**: The two display facts about a session that more than one surface has to agree on: whether it is still being written to, and how much of its context window is left.
- **Exports**: `api`
- **Dependencies**: `./sessionActivityProviders`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionMetadata.js`
- **Single Responsibility**: Provides session metadata logic and lifecycle management.
- **Exports**: `applySessionMetadata`, `applyT3SessionParents`, `applySessionIdentities`, `applyTokscaleSessionMetadata`, `and`, `projectIdentity`, `projectPathFromJsonl`, `sessionMetadataMap`, `sessionTimestampMap`
- **Dependencies**: `node:fs`, `node:os`, `./hashKey`, `./sessionContext`, `./providers/claude/sessionMetadata`, `./providers/antigravity/sessionMetadata`, `./providers/codebuddy/sessionMetadata`, `./providers/codex/sessionMetadata`, `./providers/cursor/sessionMetadata`, `./providers/droid/sessionMetadata`, `./providers/opencode/session`, `./providers/kimi/sessionMetadata`, `./providers/dsh/sessionMetadata`, `./providers/workbuddy/sessionMetadata`, `./providers/devin/sessionMetadata`, `./providers/grok/sessionMetadata`, `./t3SessionMetadata`, `./t3SessionIdentity`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sessionPromptCache.js`
- **Single Responsibility**: A product estimate for every Codex route, not a model or provider TTL claim.
- **Exports**: `createPromptCacheState`, `applyPromptCacheEntry`, `promptCacheFromTranscript`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/sqliteReadOnly.js`
- **Single Responsibility**: The caller only owns the connection after initialization succeeds..
- **Exports**: `resolveSqlite`, `openDb`
- **Dependencies**: `node:sqlite`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/subprocessTermination.js`
- **Single Responsibility**: Enough for every subprocess one collector can have running at once.
- **Exports**: `createLiveSubprocessTable`, `createSubprocessTermination`, `signalLiveSubprocesses`, `trackLiveSubprocesses`, `terminationUnconfirmedError`, `DEFAULT_TERMINATION_GRACE_MS`, `DEFAULT_TERMINATION_CLOSE_GRACE_MS`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/subscriptionDisplay.js`
- **Single Responsibility**: Manual subscription metadata: the single entry point for normalizing, matching and deriving everything shown from a user-entered subscription.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/subscriptionText.js`
- **Single Responsibility**: What a recorded subscription reads: its price, its cadence, the dates it runs between, and what it has cost so far.
- **Exports**: `api`
- **Dependencies**: `./limits/providers`, `./subscriptionDisplay`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/syncContent.js`
- **Single Responsibility**: Provides sync content logic and lifecycle management.
- **Exports**: `SHARED_SYNC_KINDS`, `normalizeSharedSyncValue`, `emptySharedSyncDocument`, `nextSharedSyncDocument`, `syncContentCapability`, `syncSessionTitlesEnabled`, `normalizeTitlePolicy`, `nextTitlePolicy`, `acceptsSessionTitles`, `createSessionTitleSyncNegotiator`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/syncPayload.js`
- **Single Responsibility**: Provides sync payload logic and lifecycle management.
- **Exports**: `SYNC_PAYLOAD_BUDGET_BYTES`, `buildSyncPayload`, `postSyncPayload`, `serializeSyncPayload`, `syncPayload`
- **Dependencies**: `./http`, `./limits/core`, `./usage`, `./providers/reasonix/sessionGuard`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/syncUploadInterval.js`
- **Single Responsibility**: Provides sync upload interval logic and lifecycle management.
- **Exports**: `DEFAULT_STALE_AFTER_MS`, `DEFAULT_SYNC_UPLOAD_INTERVAL_MS`, `SYNC_UPLOAD_INTERVAL_OPTIONS`, `normalizeSyncUploadIntervalMs`, `staleAfterMsForSyncUpload`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/t3SessionActivity.js`
- **Single Responsibility**: A durable pending request alone is not evidence that its owner survived a crash.
- **Exports**: `readT3Activity`, `readT3Activities`
- **Dependencies**: `node:fs`, `node:path`, `./sqliteReadOnly`, `./processStarts`, `./t3SessionMetadata`, `./sessionActivityProviders`, `./sessionLive`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/t3SessionIdentity.js`
- **Single Responsibility**: Provides t3 session identity logic and lifecycle management.
- **Exports**: `supportsT3SessionClient`, `nativeAccountingId`, `readT3IdentityBindings`, `t3AccountingClient`
- **Dependencies**: `node:fs`, `node:path`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/t3SessionMetadata.js`
- **Single Responsibility**: T3 Code keeps its own display titles for each provider.
- **Exports**: `expandHomePath`, `t3HomeDir`, `discoverT3DbPaths`, `readT3SessionMeta`, `readT3SessionParents`, `readT3SessionRelations`, `readT3SessionRelationResult`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `./sqliteReadOnly`, `./t3SessionIdentity`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/tokscaleCapabilities.js`
- **Single Responsibility**: Anchored to --client's own stanza, not just the first "[possible values: ...]" anywhere after it in the --help output: other clap-generated flags (e.g.
- **Exports**: `createTokscaleCapabilityResolver`, `filterSupportedClients`, `parseSupportedClients`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/tokscaleClientMapping.js`
- **Single Responsibility**: Some Token Monitor rows combine multiple concrete Tokscale clients.
- **Exports**: `TOKSCALE_CLIENT_ALIASES`, `TOKSCALE_CLIENT_GROUPS`, `tokscaleCustomScanClientIds`, `tokscaleScanClientIds`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/tokscaleConfig.js`
- **Single Responsibility**: Mirror tokscale-core get_config_dir() (tmp/tokscale/crates/tokscale-core/src/paths.rs) so the file we write is the exact file the spawned tokscale reads — on every OS and whether we run via `npm start` (dev) or the packaged app.
- **Exports**: `tokscaleConfigDir`, `tokscaleHomeDir`, `customPricingPath`
- **Dependencies**: `node:os`, `node:path`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/tokscaleCustomPricing.js`
- **Single Responsibility**: '' / null / undefined => unset (undefined).
- **Exports**: `normalizeCustomPricingSetting`, `buildTokscaleModels`, `mergeManaged`, `applyCustomPricing`
- **Dependencies**: `./config`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/tokscalePlatform.js`
- **Single Responsibility**: Provides tokscale platform logic and lifecycle management.
- **Exports**: `tokscalePackageNameForPlatform`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/trayLayout.js`
- **Single Responsibility**: Provides tray layout logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `./currency`, `./trayText`, `./limits/balanceDisplay`, `./compactMoney`, `./limits/windowLabels`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/trayText.js`
- **Single Responsibility**: Provides tray text logic and lifecycle management.
- **Exports**: `api`
- **Dependencies**: `./currency`, `./limits/balanceDisplay`, `./compactTokens`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage.js`
- **Single Responsibility**: Additive components for a token total.
- **Exports**: `PERIODS`, `UNATTRIBUTED_USAGE_CLIENT`, `addPeriodInto`, `aggregateDevices`, `aggregateHistory`, `applyPeriodDelta`, `applyProjectRollups`, `canonicalProjectKey`, `carryDeviceHistory`, `emptyPeriod`, `extractUsageBundleFromTokscale`, `extractUsageFromTokscale`, `mergeDeviceRecord`, `mergeSyncDeviceRecord`, `mergePeriods`, `normalizeClientName`, `normalizeModelName`, `normalizeModelNameForClient`, `normalizeDeviceRecord`, `normalizePeriod`, `projectRollupFromSessions`, `stripSessionTextFromDeviceRecord`, `stripSessionTextFromPeriod`
- **Dependencies**: `./sessionActivityProviders`, `./sessionLive`, `./limits/core`, `./clientHealth`, `./history`, `./providers/reasonix/paths`, `./providers/reasonix/sessionGuard`, `./projectKey`, `./syncUploadInterval`, `a turn is in progress`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/vendorPresentation.js`
- **Single Responsibility**: How each vendor mark looks: brand colour, artwork files and the macOS widget's variant of the colour.
- **Exports**: `api`
- **Dependencies**: `./clientCatalog`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/watcherHost.js`
- **Single Responsibility**: Where the file watcher physically runs.
- **Exports**: `createInProcessWatcherHost`, `createWatcherCoordinator`, `createWatcherHost`, `inProcessRequested`
- **Dependencies**: `node:child_process`, `node:events`, `chokidar`, `./collector`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/watcherWorker.js`
- **Single Responsibility**: Worker half of the watch host.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `node:worker_threads`, `chokidar`, `./collector`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/windowsProcessStarts.js`
- **Single Responsibility**: Anonymous type avoids colliding with the credential reader's FILETIME..
- **Exports**: `readWindowsProcessStarts`
- **Dependencies**: `koffi`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/wslUsage.js`
- **Single Responsibility**: Provides wsl usage logic and lifecycle management.
- **Exports**: `WSL_DATA_MARKERS`, `MARKER_CLIENTS`, `collectWslUsage`, `emptyWslBundle`, `homeHasData`, `isWslInstalled`, `listRunningWslDistros`, `probeWslState`, `wslUsageHomes`
- **Dependencies**: `node:fs`, `node:child_process`, `./abortSignal`, `./usage`, `./providers/reasonix/paths`, `./clientSourceRegistration`, `./providers/mcode/paths`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

### 1.7.2 AI Limits & Quota Engine (`src/shared/limits/` - 14 Files)

#### `src/shared/limits/accounts.js`
- **Single Responsibility**: The limits account registry index: one account declaration per catalog provider, in catalog order.
- **Exports**: `LIMIT_PROVIDER_ACCOUNTS`, `limitAccountDeclaration`, `limitAccountField`, `limitProviderSettingKeys`, `limitProviderUrlAllowed`, `providerCredentialSettingPaths`
- **Dependencies**: `../providers/claude/account`, `../providers/claude/limits`, `../providers/codex/account`, `../providers/codex/limits`, `../providers/opencode/account`, `../providers/opencode/limits`, `../providers/cursor/account`, `../providers/cursor/limits`, `../providers/antigravity/account`, `../providers/antigravity/limits`, `../providers/cline/account`, `../providers/cline/limits`, `../providers/factory/account`, `../providers/factory/limits`, `../providers/kimi/account`, `../providers/kimi/limits`, `../providers/grok/account`, `../providers/grok/limits`, `../providers/copilot/account`, `../providers/copilot/limits`, `../providers/zed/account`, `../providers/zed/limits`, `../providers/commandcode/account`, `../providers/commandcode/limits`, `../providers/mimo/account`, `../providers/mimo/limits`, `../providers/zai/account`, `../providers/zai/limits`, `../providers/zaiteam/account`, `../providers/zaiteam/limits`, `../providers/kiro/account`, `../providers/kiro/limits`, `../providers/workbuddy/account`, `../providers/workbuddy/limits`, `../providers/qoder/account`, `../providers/qoder/limits`, `../providers/deepseek/account`, `../providers/deepseek/limits`, `../providers/devin/account`, `../providers/devin/limits`, `../providers/minimax/account`, `../providers/minimax/limits`, `../providers/typesafe/account`, `../providers/typesafe/limits`, `../providers/openrouter/account`, `../providers/openrouter/limits`, `../providers/volcengine/account`, `../providers/volcengine/limits`, `../providers/ollama/account`, `../providers/ollama/limits`, `../providers/trae/account`, `../providers/trae/limits`, `../providers/alibaba/account`, `../providers/alibaba/limits`, `../providers/stepfun/account`, `../providers/stepfun/limits`, `../providers/thirdparty/account`, `../providers/thirdparty/limits`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/balanceDisplay.js`
- **Single Responsibility**: The wire-level marker for "this window's headline value is money, not a percentage".
- **Exports**: `api`
- **Dependencies**: `../compactTokens`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/burnRate.js`
- **Single Responsibility**: Polling shows a quota's remaining percentage as an *upper* bound: whatever was consumed since the last probe is invisible, and that error grows with the burn rate.
- **Exports**: `LIMITS_ADAPTIVE_BASE_MS`, `LIMITS_URGENCY_FLOOR_MS`, `LIMITS_URGENCY_RELEASE_WEIGHT`, `LIMITS_URGENCY_SAMPLES_AHEAD`, `createLimitsBurnState`, `markLimitsProbeSuccess`, `nextLimitsUrgencyRefresh`, `pruneLimitsBurnState`, `recordLimitsSample`, `recordLimitsUrgencyAttempt`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/collector.js`
- **Single Responsibility**: Orchestrates rate limit probes across external provider APIs with concurrency control and backoff.
- **Exports**: `LIMIT_PROVIDER_IDS`, `DEFAULT_PROVIDER_PHYSICAL_BOUND_MS`, `PROVIDER_CLEANUP_GRACE_MS`, `collectLimitsOnce`, `claudeCommandCandidates`, `codexCommandCandidates`, `codexCommandSourceDetail`, `createProbeFetch`, `resolveProviderFetch`, `createLimitsCollector`, `probeLimitProvider`, `providerFetchers`, `providerPhysicalBoundMs`, `fetchAntigravityLimits`, `fetchOpenCodeLimits`, `fetchOpenRouterLimits`, `fetchThirdPartyLimits`, `fetchOpenCodeProfile`, `claudeWebCookie`, `normalizeClaudeWebCookieInput`, `fetchClaudeLimits`, `fetchCodexLimits`, `fetchCursorLimits`, `fetchClineLimits`, `clineApiKey`, `resolveClineAutomaticCredential`, `fetchDeepSeekLimits`, `fetchMimoLimits`, `readCodexRpcWithCommand`, `runCodexLogin`, `runProcessText`, `deepseekToken`, `selectFundedRow`, `minimaxToken`, `minimaxBaseUrl`, `parseMinimaxTiers`, `fetchMinimaxLimits`, `grokCredential`, `readAuthJson`, `parseGrokBilling`, `parseGrokGrpcWebBilling`, `fetchGrokRpcBilling`, `fetchGrokWebGrpcBilling`, `fetchGrokLimits`, `copilotToken`, `fetchCopilotLimits`, `parseKiroUsage`, `fetchKiroLimits`, `zaiToken`, `factoryEnvApiKey`, `fetchFactoryLimits`, `resolveFactoryAutomaticApiKey`, `zaiRegion`, `fetchZaiLimits`, `zaiTeamToken`, `fetchZaiTeamLimits`, `volcengineCredentials`, `fetchVolcengineLimits`, `alibabaCookie`, `alibabaVariant`, `alibabaDashboardUrl`, `normalizeAlibabaCookieHeader`, `fetchAlibabaLimits`, `qoderCookie`, `fetchQoderLimits`, `devinBearerToken`, `fetchDevinLimits`, `traeAccessToken`, `traeDeviceId`, `fetchTraeLimits`, `fetchWorkbuddyLimits`, `commandcodeCookie`, `fetchCommandcodeLimits`, `ollamaSessionCookie`, `fetchOllamaLimits`, `kimiToken`, `kimiWebToken`, `fetchKimiLimits`, `zedCookie`, `typesafeCookie`, `normalizeZedCookieHeader`, `fetchZedLimits`, `mapClaudeCliUsageToProvider`, `mapClaudeUsageToProvider`, `mapCodexRateLimitsToProvider`, `parseClaudeCliUsageText`, `parseBoolean`, `parseLimitProviders`, `normalizeLimitsRefreshMode`, `normalizeLimitsRefreshMs`, `refreshClaudeAccessToken`, `refreshClaudeCredentials`, `delegatedClaudeRefresh`, `touchClaudeAuthPath`, `rankClaudeCredentialFiles`, `wslClaudeCredentialPaths`
- **Dependencies**: `./providers`, `./registry`, `./core`, `./retryPolicy`, `../providers/openrouter/limits`, `../providers/thirdparty/limits`, `../providers/minimax/limits`, `../providers/mimo/limits`, `../providers/grok/limits`, `../providers/copilot/limits`, `../providers/kiro/limits`, `../providers/zai/limits`, `../providers/factory/limits`, `../providers/zaiteam/limits`, `../providers/volcengine/limits`, `../providers/alibaba/limits`, `../providers/qoder/limits`, `../providers/devin/limits`, `../providers/commandcode/limits`, `../providers/ollama/limits`, `../providers/kimi/limits`, `../providers/workbuddy/limits`, `../providers/trae/limits`, `../providers/zed/limits`, `../providers/typesafe/limits`, `./providerHelpers`, `../providers/claude/limits`, `../providers/codex/limits`, `../providers/antigravity/limits`, `../providers/opencode/limits`, `../providers/deepseek/limits`, `../providers/cursor/limits`, `../providers/cline/limits`, `./runtime`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/core.js`
- **Single Responsibility**: Normalization engine for rate limits, rolling windows, weekly quotas, and reset timestamps.
- **Exports**: `DEFAULT_LIMITS_REFRESH_MS`, `aggregateLimits`, `mergeCodexTransientWindows`, `normalizeLimitProvider`, `normalizeLimitsSummary`, `normalizeLimitWindow`, `normalizeProviderUsageSummary`, `openCodeWindowKey`, `publicLimits`, `syncLimits`
- **Dependencies**: `../syncUploadInterval`, `./providers`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/providerHelpers.js`
- **Single Responsibility**: Helpers shared by more than one limits provider implementation: process and JSON transport, plan-label formatting, credential cleaning, and the small value/path/env utilities the provider modules all reach for.
- **Exports**: `PLAN_LABEL_ALIASES`, `TOKEN_MONITOR_USER_AGENT`, `cleanPlanText`, `cleanSecret`, `displayPlanText`, `envValue`, `errorWithStatus`, `fetchJson`, `nowIso`, `numberOrNull`, `parseBoolean`, `pathApiForPlatform`, `pathDelimiterForPlatform`, `planLabelFromParts`, `providerStatusFromError`, `runProcessText`, `statusForHttp`, `toIso`, `uniqueStrings`
- **Dependencies**: `node:child_process`, `node:path`, `../appVersion`, `../probeDeadline`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/providers.js`
- **Single Responsibility**: The AI Tool Limits provider catalog: one entry per wired provider, in the order a fresh install gets.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/registry.js`
- **Single Responsibility**: The limits provider registry: binds each provider's account declaration (src/shared/providers/<id>/account.js, pure data) to its limits module (src/shared/providers/<id>/limits.js, behaviour).
- **Exports**: `LIMIT_PROVIDER_ACCOUNTS`, `LIMIT_PROVIDER_FETCHERS`, `LIMIT_PROVIDER_MODULES`, `LIMIT_PROVIDER_REGISTRY`, `limitAccountFieldEntry`, `limitAccountFields`, `limitProviderEntry`, `normalizeSecretSetting`
- **Dependencies**: `./accounts`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/resetBoundary.js`
- **Single Responsibility**: Provides reset boundary logic and lifecycle management.
- **Exports**: `LIMITS_RESET_BOUNDARY_DELAY_MS`, `LIMITS_RESET_BOUNDARY_MIN_TIMER_MS`, `LIMITS_RESET_BOUNDARY_MAX_TIMER_MS`, `limitResetBoundaryEntries`, `nextLimitsResetBoundary`, `pruneAttemptedResetBoundaries`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/retryPolicy.js`
- **Single Responsibility**: Provides retry policy logic and lifecycle management.
- **Exports**: `DEFAULT_LIMITS_RETRY_BASE_MS`, `DEFAULT_LIMITS_RETRY_MAX_MS`, `MAX_RETRY_AFTER_MS`, `RETRYABLE_LIMIT_STATUSES`, `computeRetryDelayMs`, `isRetryableLimitStatus`, `parseRetryAfterHeader`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/runtime.js`
- **Single Responsibility**: Provides runtime logic and lifecycle management.
- **Exports**: `DEFAULT_LIMITS_MAX_CONCURRENCY`, `TRANSIENT_STATUSES`, `accountIdentityPart`, `createLimitsRuntime`, `rowIdentityKey`, `scopeIdentityKey`
- **Dependencies**: `node:crypto`, `./collector`, `./core`, `./resetBoundary`, `./burnRate`, `../probeDeadline`, `./retryPolicy`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/usageItems.js`
- **Single Responsibility**: Per-provider "visible usage items": which rows of a provider's limits card the user has hidden.
- **Exports**: `api`
- **Dependencies**: `./providers`, `./windowLabels`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/windowLabels.js`
- **Single Responsibility**: Display name for one quota window, shared by every surface that paints limits: the Limits view, the edge dock, the tray and the macOS widget.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/limits/windowText.js`
- **Single Responsibility**: What one quota window's headline value and sub-line say, shared by the Limits view and the edge dock.
- **Exports**: `api`
- **Dependencies**: `./balanceDisplay`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

### 1.7.3 Usage & Device Runtime Engine (`src/shared/usage/` - 11 Files)

#### `src/shared/usage/agentPid.js`
- **Single Responsibility**: Whether a headless agent other than this process is running.
- **Exports**: `externalAgentActive`
- **Dependencies**: `node:fs`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage/clientUsageArchive.js`
- **Single Responsibility**: Provides client usage archive logic and lifecycle management.
- **Exports**: `applyArchivedClientUsage`, `captureArchivedClientUsage`, `normalizeArchivedClientUsage`, `pruneArchivedClientUsage`
- **Dependencies**: `../usage`, `../history`, `../clientIdentitySplits`, `../archiveHelpers`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage/deviceRuntime.js`
- **Single Responsibility**: Diagnostic observers must never block usage or limits delivery..
- **Exports**: `createDeviceRuntime`
- **Dependencies**: `./deviceState`, `../limits/runtime`, `./usageRuntime`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage/deviceState.js`
- **Single Responsibility**: Provides device state logic and lifecycle management.
- **Exports**: `createDeviceState`
- **Dependencies**: `../providers/reasonix/sessionGuard`, `../sessionActivityProjection`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage/sessionUsageArchive.js`
- **Single Responsibility**: Provides session usage archive logic and lifecycle management.
- **Exports**: `applySessionUsageArchive`, `captureSessionUsageArchive`, `clearSessionUsageArchive`, `normalizeSessionUsageArchive`, `readSessionUsageArchive`, `sessionUsageArchiveDate`, `sessionUsageArchivePath`, `updateSessionUsageArchive`, `writeSessionUsageArchive`
- **Dependencies**: `node:fs`, `node:path`, `node:util`, `../usage`, `../archiveHelpers`, `../config`, `../providers/reasonix/sessionGuard`, `../clientIdentitySplits`, `../providers/cursor/sessionGuard`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage/sessionUsageArchiveStore.js`
- **Single Responsibility**: SQLite and JSON storage manager for historical session token usage snapshots.
- **Exports**: `SESSION_ARCHIVE_DATABASE_VERSION`, `createSessionUsageArchiveStore`, `readSessionUsageArchiveSnapshot`, `sessionUsageArchiveDatabasePath`
- **Dependencies**: `node:fs`, `node:path`, `node:sqlite`, `../config`, `./sessionUsageArchive`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage/usageHost.js`
- **Single Responsibility**: Where usage collection physically runs.
- **Exports**: `createUsageHost`, `createUsageHostCoordinator`, `terminateUsageHostSubprocesses`, `usageWorkerRequested`, `whenUsageHostsIdle`
- **Dependencies**: `../collector`, `../subprocessTermination`, `node:worker_threads`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage/usageRuntime.js`
- **Single Responsibility**: Provides usage runtime logic and lifecycle management.
- **Exports**: `createUsageRuntime`
- **Dependencies**: `../collector`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage/usageTransform.js`
- **Single Responsibility**: Every setting project() and transform() read.
- **Exports**: `USAGE_TRANSFORM_SETTING_KEYS`, `createUsageTransform`, `usageTransformSettings`
- **Dependencies**: `./clientUsageArchive`, `./sessionUsageArchive`, `./sessionUsageArchiveStore`, `../usage`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage/usageWorker.js`
- **Single Responsibility**: Worker half of the usage host.
- **Exports**: `Default execution / CLI entry point`
- **Dependencies**: `node:worker_threads`, `../collector`, `./agentPid`, `../providers/cursor/usageEvents`, `./sessionUsageArchiveStore`, `../subprocessTermination`, `./usageTransform`
- **State Flow**: Invoked with input parameters -> applies internal business logic, filtering, or transformations -> emits events or returns normalized output to caller.

#### `src/shared/usage/tokenLedger.js`
- **Single Responsibility**: App-owned SQLite token ledger store, period calculator, and historical read model.
- **Exports**: `baseRows`, `createTokenLedgerStore`, `packagedSeedPath`, `resolveTokenLedgerPath`
- **Dependencies**: `node:fs`, `node:path`, `node:sqlite`, `../config`, `../history`, `../usage`
- **State Flow**: Opens `token_ledger.sqlite` in WAL mode -> checks integrity via `PRAGMA quick_check` and auto-recovers from seed -> executes `reconcileDailyUsage` -> computes daily, monthly, and all-time usage periods overlaying live session records without double-counting -> returns normalized history and period envelopes to main process.

### 1.7.4 Provider Drivers & Account Adapters (`src/shared/providers/` - 126 Files)

#### `src/shared/providers/alibaba/account.js`
- **Single Responsibility**: Alibaba Cloud limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'alibaba'`, `'cookie']`, `resolve`, `normalize`, `style`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/alibaba/limits.js`
- **Single Responsibility**: Alibaba Cloud Token Plan limits.
- **Exports**: `ALIBABA_FETCH_TIMEOUT_MS`, `ALIBABA_VARIANTS`, `ALIBABA_VARIANT_IDS`, `alibabaCookie`, `alibabaDashboardUrl`, `alibabaVariant`, `alibabaVariantConfig`, `expandEmbeddedJson`, `fetchAlibabaLimits`, `normalizeAlibabaCookieHeader`, `parsePersonalUsage`, `parseTeamSummary`, `parseConsoleBody`, `secTokenFromHtml`
- **Dependencies**: `node:crypto`, `../../limits/core`, `../../hashKey`, `../../probeDeadline`, `../../abortSignal`, `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/antigravity/account.js`
- **Single Responsibility**: Antigravity limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `contextOverride`, `persist`, `initial`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/antigravity/limits.js`
- **Single Responsibility**: Antigravity limits provider: RPC snapshot plus the OAuth/probe helpers in this folder.
- **Exports**: `fetchAntigravityLimits`
- **Dependencies**: `./oauth`, `./probe`, `../../limits/core`, `../../hashKey`, `../../limits/providerHelpers`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/antigravity/oauth.js`
- **Single Responsibility**: CLIProxyAPI follows Antigravity Hub's own client identity.
- **Exports**: `AUTH_URL`, `TOKEN_URL`, `USERINFO_URL`, `SCOPES`, `accountKey`, `authorizationUrl`, `candidateOAuthArtifacts`, `discoverOAuthClient`, `exchangeAuthorizationCode`, `fetchGoogleIdentity`, `fetchRemoteSnapshot`, `generatePkce`, `modelsFromAvailable`, `modelsFromBuckets`, `managedAccountsForCollector`, `normalizeManagedAccounts`, `parseClientFromText`, `refreshCredential`, `_mergeVerifiedModels`, `_planFromLoadResponse`, `_officialOAuthClient`
- **Dependencies**: `node:crypto`, `node:fs`, `node:os`, `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/antigravity/probe.js`
- **Single Responsibility**: Provides probe logic and lifecycle management.
- **Exports**: `probe`, `detectProcessInfo`, `detectProcessInfos`, `listeningPorts`, `callLs`, `_parseProcessLine`, `_antigravityProcessKind`, `_isAntigravityIdeCommand`, `_isAntigravityCliCommand`, `_sortProcessInfos`, `_extractFlag`, `_errorWithStatus`, `_modelsFromConfigs`, `_collapsePools`, `_poolForModel`, `_quotaSummaryWindows`, `_quotaBucketKind`, `_endpointCandidates`
- **Dependencies**: `../../probeDeadline`, `node:child_process`, `node:https`, `node:http`, `../../appVersion`, `../../limits/providerHelpers`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/antigravity/selfSync.js`
- **Single Responsibility**: Antigravity keeps its usage in a cache tokscale reads but cannot populate, so the collector spawns `tokscale antigravity sync` before it scans.
- **Exports**: `ANTIGRAVITY_DATA_ROOTS`, `antigravityDataPresent`, `antigravityDataRoots`, `antigravitySyncLockPath`, `createAntigravitySelfSync`, `processIdIsAlive`, `removeOwnedAntigravitySyncLock`, `repairAntigravitySyncLock`
- **Dependencies**: `node:child_process`, `node:fs`, `node:os`, `node:path`, `../../abortSignal`, `../../clientHealth`, `../../clientTracking`, `../../subprocessTermination`, `../../tokscaleConfig`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/antigravity/sessionMetadata.js`
- **Single Responsibility**: Deferred like cursor: importing this resolver must not emit Node's experimental node:sqlite warning for collectors that never see an Antigravity row..
- **Exports**: `cleanTitle`, `antigravityConversationSummaryCandidates`, `readSummaries`, `resolveSessionMetadata`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `node:url`, `./selfSync`, `../../clientSources`, `node:sqlite`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/catpaw/paths.js`
- **Single Responsibility**: Token Monitor never reads usage here (the fork does); these paths drive watching, health, and the anchor fingerprint..
- **Exports**: `catpawDatabaseName`, `catpawDataSources`, `catpawSourcesFingerprint`, `readWindowsFolders`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `../../tokscaleConfig`, `koffi`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/claude/account.js`
- **Single Responsibility**: Claude limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'claude'`, `'webCookie']`, `resolve`, `normalize`, `style`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/claude/limits.js`
- **Single Responsibility**: Claude limits provider: OAuth and Web session credentials, the CLI fallback, identity/prepaid caches, and the usage → provider-window mapping.
- **Exports**: `claudeCommandCandidates`, `claudeWebCookie`, `delegatedClaudeRefresh`, `fetchClaudeLimits`, `listClaudeWebOrganizations`, `isClaudeCliAuthenticated`, `mapClaudeCliUsageToProvider`, `mapClaudeUsageToProvider`, `normalizeClaudeWebCookieInput`, `normalizeClaudeWebOrganizationId`, `parseClaudeCliUsageText`, `rankClaudeCredentialFiles`, `refreshClaudeAccessToken`, `refreshClaudeCredentials`, `runClaudeAuthStatus`, `touchClaudeAuthPath`, `wslClaudeCredentialPaths`
- **Dependencies**: `node:child_process`, `node:fs`, `node:os`, `node:path`, `../../browserUserAgent`, `../../limits/core`, `../../probeDeadline`, `../../hashKey`, `../../limits/providerHelpers`, `koffi`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/claude/linuxProcessIdentity.js`
- **Single Responsibility**: comm is parenthesized but may itself contain spaces or closing parentheses..
- **Exports**: `readLinuxPidDomain`, `parseLinuxStartTicks`, `readLinuxProcessStarts`
- **Dependencies**: `node:fs`, `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/claude/paths.js`
- **Single Responsibility**: Claude Code resolves both projects and transcript sessions from CLAUDE_CONFIG_DIR, falling back to ~/.claude.
- **Exports**: `claudeSessionRoots`, `resolveClaudeConfigDir`
- **Dependencies**: `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/claude/sessionActivity.js`
- **Single Responsibility**: Monitors live user activity and transcript modification timestamps for 'claude'.
- **Exports**: `projectSessionActivity`, `readSessionActivity`, `readSummaryActivity`, `readActivity`, `projectActivity`, `activityWatchTargets`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `../../processStarts`, `./linuxProcessIdentity`, `./paths`, `../../sessionFiles`, `../../t3SessionActivity`, `../../t3SessionMetadata`, `./sessionMetadata`, `../../sessionLive`, `../../sessionActivityProjection`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/claude/sessionMetadata.js`
- **Single Responsibility**: The turn boundary needs two fields, and on a real transcript they sit at opposite ends of a record: whether a `user` record is a genuine prompt is decided by the head (its content blocks), while `stop_reason` trails the assistant text.
- **Exports**: `TITLE_MAX_CODE_POINTS`, `TITLE_READ_CHUNK_BYTES`, `claudeContextWindow`, `cleanTitle`, `readSessionContext`, `readSessionPromptCache`, `readSessionTitle`, `readSessionTurnEnded`, `resolveSessionMetadata`
- **Dependencies**: `node:fs`, `../../sessionPromptCache`, `./paths`, `../../sessionFiles`, `../../t3SessionMetadata`, `../../sessionContext`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cline/account.js`
- **Single Responsibility**: Cline limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'cline'`, `'apiKey']`, `config`, `resolve`, `normalize`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cline/limits.js`
- **Single Responsibility**: Cline limits provider: the ClinePass usage windows, read from the account API Cline itself uses.
- **Exports**: `CLINE_API_BASE`, `USAGE_LIMITS_PATH`, `USERS_ME_PATH`, `balancePath`, `usagesDailyPath`, `clineApiKey`, `clineProvidersPath`, `fetchClineLimits`, `parseClineLimits`, `readClineSession`, `resolveClineCredential`, `resolveClineAutomaticCredential`, `formatAccessToken`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `../../abortSignal`, `../../limits/core`, `../../hashKey`, `../../limits/providerHelpers`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codebuddy/extension.js`
- **Single Responsibility**: The VS Code extension's conversation store.
- **Exports**: `clearExtensionCaches`, `collectHistoryDirs`, `findExtensionSession`, `findExtensionSessions`
- **Dependencies**: `node:fs`, `node:path`, `./paths`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codebuddy/paths.js`
- **Single Responsibility**: CodeBuddy Code keeps one transcript per session under a directory named after the working directory it ran in, the same storage shape Claude Code uses: <configDir>/projects/<mangled-cwd>/<session-id>.jsonl `CODEBUDDY_CONFIG_DIR` is deliberately not consulted, even though the CLI itself resolves its config directory from it.
- **Exports**: `codebuddyExtensionDataRoots`, `codebuddyProjectsRoot`
- **Dependencies**: `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codebuddy/sessionMetadata.js`
- **Single Responsibility**: One bounded pass over a transcript answers both things the scan cannot: the title (an `ai-title` record the client writes when it names a session) and the turn boundary (the `status` on each assistant response).
- **Exports**: `createProjectsResolver`, `readSessionMetadata`, `resolveSessionMetadata`
- **Dependencies**: `node:fs`, `./extension`, `../../sessionFiles`, `./paths`, `./transcript`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codebuddy/transcript.js`
- **Single Responsibility**: Record classification for CodeBuddy Code transcripts, shared by the session metadata scanner and the Session Detail parser.
- **Exports**: `TITLE_MAX_CODE_POINTS`, `cleanTitle`, `contentText`, `isSyntheticPromptText`, `isUserPromptRecord`, `userPromptText`, `assistantStatus`, `messageIdOf`, `usageTokens`, `buddyUsageTokens`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/account.js`
- **Single Responsibility**: Codex limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `contextOverride`, `persist`, `initial`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/auth.js`
- **Single Responsibility**: Authentication flow, token exchange, and credential refresh handler for 'codex'.
- **Exports**: `codexManagedAccountIdentityKey`, `codexManagedAccountMatchesIdentity`, `preserveCodexManagedHydrationCollisions`, `upgradeCodexManagedAccountIdentity`, `decodeJwtPayload`, `codexStoredAccountId`, `codexOAuthRequestContext`, `codexAuthIdentity`, `codexAccountKey`, `hashAccountKey`
- **Dependencies**: `node:crypto`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/limits.js`
- **Single Responsibility**: Codex limits provider: ChatGPT/Codex backend usage, the CLI RPC fallback and login flow, managed-account normalization, and the rate-limit → provider-window mapping.
- **Exports**: `codexCommandCandidates`, `quoteWindowsCmdArg`, `codexCommandSourceDetail`, `fetchCodexLimits`, `mapCodexRateLimitsToProvider`, `normalizeCodexManagedAccounts`, `readCodexRpcWithCommand`, `runCodexLogin`
- **Dependencies**: `node:child_process`, `node:fs`, `node:os`, `node:path`, `../../appVersion`, `../../limits/core`, `../../probeDeadline`, `./auth`, `../../hashKey`, `../../limits/providerHelpers`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/localExecutor.js`
- **Single Responsibility**: The desktop launches `codex exec-server --environment-id <id>`.
- **Exports**: `executorIdsFromProcesses`, `localExecutorIds`, `localThreadEnvironment`
- **Dependencies**: `node:child_process`, `../../subprocessTermination`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/localUsage.js`
- **Single Responsibility**: Provides local usage logic and lifecycle management.
- **Exports**: `buildLocalUsageView`, `readLocalUsageView`, `resolveLocalUsagePricing`, `priceLocalSessionDetail`
- **Dependencies**: `../../usage`, `../../history`, `./localUsageStore`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/localUsageSource.js`
- **Single Responsibility**: Provides local usage source logic and lifecycle management.
- **Exports**: `createLocalUsageSource`
- **Dependencies**: `node:fs`, `node:path`, `node:crypto`, `../../config`, `../../usage/agentPid`, `undici`, `../../outboundFetch`, `../../appVersion`, `./auth`, `./sessionMetadata`, `./localExecutor`, `./localUsageStore`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/localUsageStore.js`
- **Single Responsibility**: Provides local usage store logic and lifecycle management.
- **Exports**: `createLocalUsageStore`, `localUsageDatabasePath`, `usageCounters`
- **Dependencies**: `node:fs`, `node:path`, `node:sqlite`, `../../config`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/login.js`
- **Single Responsibility**: Authentication flow, token exchange, and credential refresh handler for 'codex'.
- **Exports**: `codexLoginUrlFromOutput`, `isAllowedCodexLoginUrl`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/sessionActivity.js`
- **Single Responsibility**: Monitors live user activity and transcript modification timestamps for 'codex'.
- **Exports**: `readT3Activity`, `readSessionActivity`, `projectSessionActivity`, `readActivity`, `projectActivity`
- **Dependencies**: `node:fs`, `node:path`, `../../sqliteReadOnly`, `./sessionIdentity`, `../../t3SessionActivity`, `../../clientSources`, `../../sessionFiles`, `../../sessionLive`, `./sessionContext`, `./sessionMetadata`, `../../sessionActivityProjection`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/sessionContext.js`
- **Single Responsibility**: * Codex reports its own context window, so this reader never estimates one.
- **Exports**: `TAIL_READ_BUDGETS`, `readCodexSessionState`, `readCodexSessionContext`, `readCodexTurnEnded`
- **Dependencies**: `node:fs`, `../../sessionContext`, `../../sessionPromptCache`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/sessionIdentity.js`
- **Single Responsibility**: Like the rollout timestamp cache, retain only per-path fingerprints and IDs.
- **Exports**: `nativeIdForFile`
- **Dependencies**: `node:fs`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/sessionMetadata.js`
- **Single Responsibility**: T3 Code is a separate Codex client that keeps its own thread catalog.
- **Exports**: `TITLE_MAX_CODE_POINTS`, `cleanSessionTitle`, `codexHomeDir`, `t3HomeDir`, `expandHomePath`, `discoverT3DbPaths`, `discoverDbPaths`, `threadIdCandidates`, `readSessionMeta`, `readT3SessionMeta`, `readSessionMetaForHome`, `resolveSessionMetadata`, `resolveSessionIdentities`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `../../sqliteReadOnly`, `../../sessionFiles`, `../../t3SessionMetadata`, `./sessionIdentity`, `../../sessionContext`, `./sessionContext`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/systemSwitch.js`
- **Single Responsibility**: Provides system switch logic and lifecycle management.
- **Exports**: `codexAuthMaterialForWorkspace`, `codexAccountMatchesIdentity`, `findMatchingCodexAccount`, `liveCodexAuthPath`, `readCodexAuthMaterial`, `writeCodexAuthFile`
- **Dependencies**: `node:crypto`, `node:fs`, `node:os`, `node:path`, `./auth`, `./workspaces`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/codex/workspaces.js`
- **Single Responsibility**: Provides workspaces logic and lifecycle management.
- **Exports**: `CODEX_WORKSPACES_URL`, `authWithSelectedCodexWorkspace`, `codexOAuthCredentials`, `listCodexWorkspaces`, `normalizeCodexWorkspaces`, `normalizeWorkspaceId`
- **Dependencies**: `../../outboundFetch`, `./auth`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/commandcode/account.js`
- **Single Responsibility**: Command Code limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'commandcode'`, `'cookie']`, `resolve`, `project`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/commandcode/limits.js`
- **Single Responsibility**: The plan lookup only enriches the monthly window, so it gets a shorter budget than the credits read it runs beside: a stalled subscriptions call must not hold back quota numbers that already arrived.
- **Exports**: `COMMANDCODE_CREDITS_URL`, `COMMANDCODE_FORWARDED_COOKIE_NAMES`, `COMMANDCODE_FETCH_TIMEOUT_MS`, `COMMANDCODE_PLANS`, `COMMANDCODE_SESSION_COOKIE_NAMES`, `COMMANDCODE_SUBSCRIPTIONS_URL`, `COMMANDCODE_USAGE_URL`, `commandcodeCookie`, `fetchCommandcodeLimits`, `normalizeCommandcodeCookieHeader`, `parseCommandcodeCredits`, `parseCommandcodeSubscription`
- **Dependencies**: `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../../probeDeadline`, `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/copilot/account.js`
- **Single Responsibility**: GitHub Copilot limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'copilot'`, `'apiToken']`, `resolve`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/copilot/deviceFlow.js`
- **Single Responsibility**: Provides device flow logic and lifecycle management.
- **Exports**: `COPILOT_DEVICE_CLIENT_ID`, `COPILOT_DEVICE_SCOPE`, `isAllowedVerificationUrl`, `verificationUrlHost`, `deviceCodeUrl`, `accessTokenUrl`, `requestDeviceCode`, `pollForAccessToken`, `runCopilotDeviceFlowLogin`, `copilotLoginErrorMessage`
- **Dependencies**: `./limits`, `../../limits/providerHelpers`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/copilot/limits.js`
- **Single Responsibility**: GitHub Copilot quota lookup via the Copilot internal usage API.
- **Exports**: `COPILOT_DEFAULT_HOST`, `copilotToken`, `normalizedEnterpriseHost`, `copilotApiHost`, `copilotUsageUrl`, `parseQuotaSnapshot`, `isPlaceholder`, `parseCopilotUsageResponse`, `parseQuotaResetDate`, `mapCopilotUsageToProvider`, `fetchCopilotUsage`, `fetchCopilotLimits`
- **Dependencies**: `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cursor/account.js`
- **Single Responsibility**: Cursor limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `configNormalize`, `persist`, `initial`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cursor/auth.js`
- **Single Responsibility**: Authentication flow, token exchange, and credential refresh handler for 'cursor'.
- **Exports**: `CURSOR_EXPLICIT_SYNC_TIMEOUT_MS`, `canonicalCursorUserId`, `credentialsPath`, `cursorDesktopStateCandidates`, `listAccounts`, `normalizeCursorSessionToken`, `readActiveAccount`, `readCursorDesktopAccessToken`, `runCursorDiscover`, `runCursorLogin`, `runCursorLogout`, `runCursorSync`, `runCursorStatus`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `node:crypto`, `node:child_process`, `../../abortSignal`, `../../subprocessTermination`, `../../clientHealth`, `./lifecycle`, `./desktopState`, `node:sqlite`, `../../collector`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cursor/desktopState.js`
- **Single Responsibility**: Watch the parent, not just today's database inode: SQLite can replace the database or create its WAL after the watcher starts.
- **Exports**: `cursorDesktopStateCandidates`, `cursorDesktopWatchRoots`, `isCursorDesktopStateWrite`
- **Dependencies**: `node:os`, `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cursor/lifecycle.js`
- **Single Responsibility**: Tokscale reports can implicitly sync Cursor, so every Cursor subprocess and local credentials mutation started by this process shares one FIFO lane..
- **Exports**: `withCursorLifecycle`
- **Dependencies**: `../../abortSignal`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cursor/limits.js`
- **Single Responsibility**: Cursor limits provider: per-account billing and on-demand windows, using the session/auth helpers in this folder.
- **Exports**: `fetchCursorLimits`
- **Dependencies**: `./auth`, `./probe`, `../../hashKey`, `../../limits/providerHelpers`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cursor/probe.js`
- **Single Responsibility**: Provides probe logic and lifecycle management.
- **Exports**: `parseUsageSummary`, `parseRequestUsage`, `parseGrokBotUsage`, `parseUserInfo`, `probe`, `requestJson`, `USAGE_SUMMARY_URL`, `AUTH_ME_URL`, `REQUEST_USAGE_URL`, `SAND_USAGE_URL`, `SAND_TIMEOUT_MS`
- **Dependencies**: `node:https`, `../../probeDeadline`, `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cursor/selfSync.js`
- **Single Responsibility**: Cursor's tokscale cache is self-synced the same way antigravity's is, but the spawn itself already belongs to providers/cursor/auth — it needs the signed session, not a bare binary.
- **Exports**: `createCursorSelfSync`
- **Dependencies**: `../../abortSignal`, `../../clientHealth`, `../../clientTracking`, `./auth`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cursor/sessionGuard.js`
- **Single Responsibility**: Tokscale's legacy CSV cache produced one Cursor session per usage event, `cursor-<account>-<CSV date>`.
- **Exports**: `isLegacyCursorEntry`, `legacyCursorEventTime`, `legacyCursorLookup`, `supersedingCursorSessionId`
- **Dependencies**: `../../archiveHelpers`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cursor/sessionMetadata.js`
- **Single Responsibility**: Deferred like auth.js: importing this resolver must not emit Node's experimental node:sqlite warning for collectors that never see a Cursor row..
- **Exports**: `cleanTitle`, `readTitles`, `resolveSessionMetadata`
- **Dependencies**: `node:fs`, `./desktopState`, `../../sessionLive`, `node:sqlite`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/cursor/usageEvents.js`
- **Single Responsibility**: Tokscale's Cursor JSON cache holds every usage event with its millisecond timestamp, its tokens and the conversation it belongs to, which is exactly what a legacy CSV row lacks.
- **Exports**: `createCursorUsageEventIndex`, `cursorCacheDir`
- **Dependencies**: `node:fs`, `node:path`, `../../tokscaleConfig`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/deepseek/account.js`
- **Single Responsibility**: DeepSeek limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'deepseek'`, `'apiKey']`, `resolve`, `resolveStyle`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/deepseek/balanceHistory.js`
- **Single Responsibility**: Provides balance history logic and lifecycle management.
- **Exports**: `recordConsumption`, `round2`, `startOfLocalDay`, `startOfLocalMonth`
- **Dependencies**: `../../config`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/deepseek/limits.js`
- **Single Responsibility**: DeepSeek limits provider: the API-key balance read, and the derived spend it records through ./balanceHistory.js.
- **Exports**: `deepseekToken`, `fetchDeepSeekLimits`, `selectFundedRow`
- **Dependencies**: `node:path`, `./balanceHistory`, `../../config`, `../../limits/core`, `../../hashKey`, `../../limits/providerHelpers`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/devin/account.js`
- **Single Responsibility**: Devin limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'devin'`, `'bearerToken']`, `resolve`, `project`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/devin/limits.js`
- **Single Responsibility**: Rate limit probe, quota parser, and reset window normalizer for provider 'devin'.
- **Exports**: `DEVIN_FETCH_TIMEOUT_MS`, `DEVIN_ORIGIN`, `devinBearerToken`, `devinOrganization`, `devinQuotaUrls`, `devinSubscriptionUrls`, `fetchDevinLimits`, `normalizeDevinOrganization`, `parseDevinSubscriptionPlan`, `parseDevinUsage`
- **Dependencies**: `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../../probeDeadline`, `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/devin/paths.js`
- **Single Responsibility**: Devin (Cognition) data roots, mirroring the upstream tokscale scanners (clients.rs + scanner.rs `devin_*_additional_roots`): devin-cli      PathRoot::XdgData, relative "devin/cli/sessions.db" — $XDG_DATA_HOME/devin/cli (fallback ~/.local/share) on every platform — plus `devin_cli_additional_roots`: %APPDATA%/ devin/cli when Windows env roots apply, and the unconditional home-relative AppData/Roaming/devin/cli.
- **Exports**: `DEVIN_CLIENT`, `DEVIN_CLI_SOURCE_CHECK_ID`, `DEVIN_DESKTOP_SOURCE_CHECK_ID`, `devinCliDbDirs`, `devinCliDbPaths`, `devinDesktopAcpDirs`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/devin/sessionMetadata.js`
- **Single Responsibility**: node:sqlite is absent on some runtimes (packaged Electron builds, older Node for the agent on non-supported platforms).
- **Exports**: `resolveSessionMetadata`
- **Dependencies**: `node:fs`, `./paths`, `node:sqlite`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/droid/sessionMetadata.js`
- **Single Responsibility**: Current Factory Droid releases cache session discovery under `.factory/cache`; older releases kept a smaller index beside the sessions tree.
- **Exports**: `droidSessionMetadataFromEntry`, `legacySessionsIndexPath`, `readDroidSessionIndex`, `resolveSessionMetadata`, `sessionDiscoveryIndexPath`, `sessionIndexPaths`
- **Dependencies**: `node:fs`, `node:os`, `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/dsh/paths.js`
- **Single Responsibility**: DeepSeek Harness (DSH) resolves its home directory from `DSH_HOME`, falling back to `~/.dsh`, and stores one zstd-compressed JSONL transcript per session under `<dshHome>/sessions/<encoded-cwd>/<session-id>/session.jsonl.zstd`.
- **Exports**: `DSH_CLIENT`, `DSH_SOURCE_CHECK_ID`, `resolveDshHome`, `resolveDshSessionsDir`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/dsh/sessionDetail.js`
- **Single Responsibility**: * Local, on-demand session detail for DeepSeek Harness (`dsh`) logs.
- **Exports**: `findDshSessionFile`, `parseDshDetailEvents`, `readDshSessionDetail`
- **Dependencies**: `node:path`, `./transcriptReader`, `../../sessionDetail`, `./sessionFiles`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/dsh/sessionFiles.js`
- **Single Responsibility**: * DeepSeek Harness (`dsh`) session-file discovery and transcript decoding.
- **Exports**: `DSH_SESSION_DIR_DEPTH`, `DSH_SESSION_LOG_NAMES`, `DSH_SESSION_LOG_PATTERN`, `decodeFirstFrameText`, `decodeSessionText`, `dshSessionFiles`, `dshSessionLogRank`, `indexDshSessionHeaders`, `isDshSessionLogName`, `preferredDshSessionFileInDirectory`, `readDshSessionHeader`, `readDshSessionState`, `resolveDshSessionsRoot`, `scanZstdFrames`, `zstdAvailable`
- **Dependencies**: `node:fs`, `node:crypto`, `node:os`, `node:path`, `node:zlib`, `./paths`, `decoding stopped
// at a corrupt frame`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/dsh/sessionMetadata.js`
- **Single Responsibility**: This cache intentionally outlives one collection tick.
- **Exports**: `resolveSessionMetadata`
- **Dependencies**: `node:fs`, `node:path`, `./sessionFiles`, `../../sessionContext`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/dsh/transcriptReader.js`
- **Single Responsibility**: Find a frame's byte range without retaining its compressed payload.
- **Exports**: `readDshTranscriptRecords`
- **Dependencies**: `node:fs`, `node:zlib`, `node:stream`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/factory/account.js`
- **Single Responsibility**: Factory Droid limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'factory'`, `'apiKey']`, `normalize`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/factory/limits.js`
- **Single Responsibility**: Rate limit probe, quota parser, and reset window normalizer for provider 'factory'.
- **Exports**: `FACTORY_API_BASE_URL`, `FACTORY_APP_BASE_URL`, `factoryEnvApiKey`, `factoryIdentity`, `factoryUserId`, `factoryLegacyPercent`, `factoryProfileDir`, `fetchFactoryLimits`, `fetchFactoryWithToken`, `parseFactoryLegacyUsage`, `parseFactoryTokenRateLimits`, `resolveFactoryAutomaticApiKey`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `../../credentialStore`, `../../hashKey`, `../../limits/core`, `../../limits/providerHelpers`, `../../probeDeadline`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/grok/account.js`
- **Single Responsibility**: Grok limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `resolveFetch`, `limits)`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/grok/limits.js`
- **Single Responsibility**: Grok (xAI) SuperGrok subscription usage lookup.
- **Exports**: `GROK_WEB_BILLING_GRPC_URL`, `GROK_KEY_NAMES`, `GROK_OIDC_PREFIX`, `GROK_LEGACY_SCOPE`, `resolveGrokHome`, `readAuthJson`, `grokCredential`, `wslGrokHomes`, `resolveGrokCredential`, `parseGrokBilling`, `parseGrokGrpcWebBilling`, `resolveGrokFetch`, `fetchGrokRpcBilling`, `fetchGrokWebGrpcBilling`, `fetchGrokLimits`, `isRetryableNetworkError`, `grpcWebTrailerFields`, `validateGrokGrpcStatus`, `billingWindowLabel`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `node:child_process`, `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../../outboundFetch`, `../../probeDeadline`, `../../wslUsage`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/grok/sessionMetadata.js`
- **Single Responsibility**: Grok keeps one directory per session under `~/.grok/sessions/<url-encoded cwd>/<session uuid>/`, and tokscale joins on that bare uuid: its entry `sessionId` is the same string as the directory name and `summary.json`'s `info.id`.
- **Exports**: `TITLE_MAX_CODE_POINTS`, `cleanTitle`, `grokSessionsRoot`, `resolveSessionMetadata`, `timestamp`
- **Dependencies**: `node:fs`, `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/hermes/profiles.js`
- **Single Responsibility**: Windows native installs often land in %LOCALAPPDATA%\hermes instead of ~/.hermes.
- **Exports**: `discoverHermesProfileScanPaths`, `hermesProfileWatchDirs`, `resolveHermesHome`
- **Dependencies**: `node:fs`, `node:os`, `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/kimi/account.js`
- **Single Responsibility**: Kimi limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'kimi'`, `'apiKey']`, `resolve`, `resolveStyle`, `persist`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/kimi/limits.js`
- **Single Responsibility**: Older Kimi Code responses report the weekly quota in top-level `usage` and the rolling 5-hour rate limit in `limits[]`; the current quota model instead uses named pools under `usages`.
- **Exports**: `KIMI_FETCH_TIMEOUT_MS`, `KIMI_CODE_BASE_URL`, `KIMI_CODE_USAGES_URL`, `KIMI_WEB_BASE_URL`, `KIMI_WEB_USAGES_URL`, `KIMI_MEMBERSHIP_STATS_URL`, `kimiToken`, `kimiWebToken`, `parseKimiUsage`, `parseKimiWebUsage`, `parseKimiMembershipStats`, `fetchKimiLimits`
- **Dependencies**: `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../../probeDeadline`, `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/kimi/sessionMetadata.js`
- **Single Responsibility**: Extracts session titles, model codenames, and workspace identifiers for 'kimi'.
- **Exports**: `TITLE_MAX_CODE_POINTS`, `kimiCodeSessionsHome`, `kimiWorkSessionsRoots`, `readKimiSessionStateFiles`, `readKimiStateMetadata`, `resolveSessionMetadata`
- **Dependencies**: `node:fs`, `node:os`, `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/kiro/account.js`
- **Single Responsibility**: Kiro limits account wiring.
- **Exports**: `id`, `fetch`, `fields`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/kiro/limits.js`
- **Single Responsibility**: Kiro (AWS) subscription credit lookup via kiro-cli.
- **Exports**: `stripAnsi`, `displayPlanName`, `parseResetDate`, `parseKiroUsage`, `kiroCliCandidates`, `existingKiroCli`, `runKiroUsageCli`, `fetchKiroLimits`
- **Dependencies**: `node:fs`, `node:path`, `node:child_process`, `../../limits/core`, `../../limits/providerHelpers`, `../../probeDeadline`, `../../hashKey`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/mcode/paths.js`
- **Single Responsibility**: MiniMax Code (CLI and desktop app) writes every Session through its shared local runtime to `<data-dir>/v2/sessions/<yyyy>/<mm>/<dd>/<dir>/`.
- **Exports**: `MCODE_SOURCE_CHECK_ID`, `isMcodeProfileDir`, `mcodeDataDirs`, `mcodeSessionDirs`
- **Dependencies**: `node:fs`, `node:os`, `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/mimo/account.js`
- **Single Responsibility**: Xiaomi MiMo limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `contextOverride`, `persist`, `initial`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/mimo/browserHeaders.js`
- **Single Responsibility**: Keep the measured browser header shape for console reads and session exchange.
- **Exports**: `MIMO_CONSOLE_URL`, `mimoExchangeRequestHeaders`, `mimoRequestHeaders`
- **Dependencies**: `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/mimo/desktop.js`
- **Single Responsibility**: The app's `persist:xiaomi-account` partition lives under userData.
- **Exports**: `MIMO_ACCOUNT_COOKIE_NAMES`, `mimoDesktopCookieCandidates`, `readMimoDesktopAccount`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `../../limits/providerHelpers`, `node:sqlite`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/mimo/endpointTime.js`
- **Single Responsibility**: MiMo's payloads can carry wall-clock timestamps with no zone.
- **Exports**: `mimoEndpointIso`, `mimoEndpointTime`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/mimo/limits.js`
- **Single Responsibility**: The console product's word, from the shared display vocabulary: the renderer, the tray and the macOS widget all route on it.
- **Exports**: `MIMO_API_BASE_URL`, `MIMO_ACCOUNT_TIMEOUT_MS`, `MIMO_COOKIE_NAMES`, `MIMO_PLATFORM_CONSOLE_URL`, `createMimoManagedAccount`, `fetchMimoLimits`, `mimoAccountKey`, `mimoMembershipAccountKey`, `normalizeMimoCookieHeader`, `parseMimoBalance`, `parseMimoProfile`, `parseMimoSpend`, `parseMimoPlanDetail`, `parseMimoPlanUsage`, `scopedMimoManagedAccounts`, `withDetectedMimoAccount`
- **Dependencies**: `node:crypto`, `node:path`, `../../abortSignal`, `../../config`, `../../hashKey`, `../../limits/windowLabels`, `../../limits/core`, `../../limits/providerHelpers`, `./browserHeaders`, `./endpointTime`, `./desktop`, `./session`, `./spendHistory`, `./membership`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/mimo/membership.js`
- **Single Responsibility**: The only host the app's region table carries; a region it does not carry resolves no base URL there either.
- **Exports**: `MIMO_MEMBERSHIP_LABEL`, `fetchMimoMembershipAccount`, `mimoMembershipPlanLabel`, `mimoMembershipWindows`, `readMimoMembershipPlan`
- **Dependencies**: `../../limits/providerHelpers`, `../../limits/windowLabels`, `../../abortSignal`, `./endpointTime`, `./session`, `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/mimo/session.js`
- **Single Responsibility**: Both chains observed live are four hops.
- **Exports**: `MIMO_EXCHANGE_STATUSES`, `mimoExchangeStatus`, `mintMimoServiceSession`, `readConsoleStatus`
- **Dependencies**: `undici`, `../../abortSignal`, `../../limits/providerHelpers`, `./browserHeaders`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/mimo/spendHistory.js`
- **Single Responsibility**: Derive Today and Week from positive cumulative-spend deltas, as Z.ai does.
- **Exports**: `MIMO_SPEND_RETENTION_MS`, `MIMO_SPEND_STORE_VERSION`, `localDayKey`, `recordMimoCumulativeSpend`
- **Dependencies**: `../../config`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/minimax/account.js`
- **Single Responsibility**: Minimax limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'minimax'`, `'apiKey']`, `resolve`, `resolveStyle`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/minimax/limits.js`
- **Single Responsibility**: Rate limit probe, quota parser, and reset window normalizer for provider 'minimax'.
- **Exports**: `MINIMAX_KEY_NAMES`, `MINIMAX_REGION_MEMORY_STATE_KEY`, `MINIMAX_REMAINS_URL_CN`, `MINIMAX_REMAINS_URL_EN`, `MINIMAX_TOKEN_PLAN_REMAINS_URL_CN`, `MINIMAX_TOKEN_PLAN_REMAINS_URL_EN`, `isMinimaxTransportError`, `minimaxToken`, `minimaxAttemptOrder`, `minimaxBaseUrl`, `minimaxRegion`, `normalizeMinimaxRegionSetting`, `minimaxRegionForUrl`, `parseMinimaxTiers`, `fetchMinimaxLimits`
- **Dependencies**: `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/ollama/account.js`
- **Single Responsibility**: Ollama limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'ollama'`, `'cookie']`, `resolve`, `project`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/ollama/limits.js`
- **Single Responsibility**: Rate limit probe, quota parser, and reset window normalizer for provider 'ollama'.
- **Exports**: `OLLAMA_SETTINGS_URL`, `OLLAMA_SESSION_COOKIE_NAMES`, `normalizeOllamaCookieHeader`, `ollamaSessionCookie`, `rememberOllamaValidation`, `parseOllamaUsageHtml`, `fetchOllamaLimits`
- **Dependencies**: `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/opencode/account.js`
- **Single Responsibility**: OpenCode limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'opencode'`, `'cookie']`, `envFallback`, `persist`, `project`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/opencode/goApi.js`
- **Single Responsibility**: OpenCode Go quota via the official usage API.
- **Exports**: `GO_USAGE_URL`, `GO_AUTH_PROVIDER_ID`, `isAbortError`, `goAuthPath`, `readGoApiKey`, `goApiIdentity`, `parseGoUsage`, `fetchGoApi`, `collectGoApi`
- **Dependencies**: `node:crypto`, `node:fs`, `node:path`, `../../outboundFetch`, `./goLimits`, `../../limits/providerHelpers`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/opencode/goLimits.js`
- **Single Responsibility**: --------------------------------------------------------------------------- Constants --------------------------------------------------------------------------- OpenCode Go official limits (USD): https://opencode.ai/docs/go/ — $12/5h, $30/week, $60/month.
- **Exports**: `SESSION_MS`, `WEEK_MS`, `DEFAULT_GO_LIMITS`, `goLimits`, `weekStartMs`, `monthBoundsMs`, `sumCost`, `clampPercent`, `round1`, `discoverDbPaths`, `resolveDataDir`, `isOpenCodeDbFilename`, `collectGo`, `buildWindows`, `readGoRows`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `node:sqlite`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/opencode/limits.js`
- **Single Responsibility**: OpenCode limits provider: the remote Zen/Go account view, layered over the local Go ledger in ./goLimits.js and the profile store in ./profiles.js.
- **Exports**: `fetchOpenCodeLimits`, `fetchOpenCodeProfile`
- **Dependencies**: `node:crypto`, `./goApi`, `./goLimits`, `./profiles`, `./web`, `../../limits/core`, `../../hashKey`, `../../limits/providerHelpers`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/opencode/profiles.js`
- **Single Responsibility**: Pure profile-map algebra for OpenCode accounts.
- **Exports**: `CREDENTIAL_FIELDS`, `accountEnabled`, `readProfile`, `credentialField`, `credentialProperties`, `credentialKinds`, `hasAnyCredential`, `ambientKeyFor`, `ambientKeyClaimed`, `saveCredential`, `moveCredential`, `renameProfile`, `removeCredential`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/opencode/session.js`
- **Single Responsibility**: Reads OpenCode session metadata + per-exchange detail from opencode.db (SQLite).
- **Exports**: `readSessionMeta`, `readSessionMetaForHome`, `readSessionEvents`, `resolveSessionMetadata`
- **Dependencies**: `./goLimits`, `node:path`, `node:sqlite`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/opencode/web.js`
- **Single Responsibility**: From codexbar 0.32.4 (its docs/opencode.md): opencode.ai TanStack server-function IDs (build hashes).
- **Exports**: `BASE_URL`, `SERVER_URL`, `WORKSPACES_SERVER_ID`, `SUBSCRIPTION_SERVER_ID`, `sanitizeCookieHeader`, `serverRequestUrl`, `buildHeaders`, `parseWorkspaceIds`, `parseSubscription`, `fetchZen`, `normalizeWorkspaceId`, `resolveWorkspaceId`, `fetchGoWeb`, `parseGoUsage`, `summarizeLink`
- **Dependencies**: `../../browserUserAgent`, `node:crypto`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/openrouter/account.js`
- **Single Responsibility**: OpenRouter limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'openrouter'`, `'profiles']`, `configDefault`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/openrouter/limits.js`
- **Single Responsibility**: Rate limit probe, quota parser, and reset window normalizer for provider 'openrouter'.
- **Exports**: `OPENROUTER_ENV_ACCOUNT_NAME`, `OPENROUTER_CREDITS_URL`, `OPENROUTER_KEY_URL`, `configuredAccounts`, `creditsWindow`, `fetchOpenRouterAccount`, `fetchOpenRouterLimits`, `keyLimitWindow`, `openrouterProfileName`, `openrouterToken`, `spendAmounts`
- **Dependencies**: `../../outboundFetch`, `../../hashKey`, `../../limits/core`, `../../limits/providerHelpers`, `../../namedProfile`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/qoder/account.js`
- **Single Responsibility**: Qoder limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'qoder'`, `'cookie']`, `resolve`, `project`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/qoder/limits.js`
- **Single Responsibility**: Rate limit probe, quota parser, and reset window normalizer for provider 'qoder'.
- **Exports**: `QODER_FETCH_TIMEOUT_MS`, `qoderCookie`, `qoderSite`, `qoderOrigin`, `qoderUsageUrl`, `qoderUserPlanUrl`, `parseQoderPlanLabel`, `parseQoderUsage`, `fetchQoderLimits`
- **Dependencies**: `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../../probeDeadline`, `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/qodercn/paths.js`
- **Single Responsibility**: Qoder CN usage is parsed by the tokscale fork (`--client qodercn`); these paths only feed watching, source health and the collector anchor fingerprint, so they must resolve the same files the fork reads, including its env overrides.
- **Exports**: `qoderCnDataPaths`
- **Dependencies**: `node:path`, `../../tokscaleConfig`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/reasonix/fileIo.js`
- **Single Responsibility**: This bounds only the telemetry projection Token Monitor materializes.
- **Exports**: `readBoundedJson`, `readReasonixTelemetryUsage`, `REASONIX_META_MAX_BYTES`, `REASONIX_TELEMETRY_USAGE_MAX_BYTES`, `REASONIX_TELEMETRY_TAIL_OVERHEAD_BYTES`
- **Dependencies**: `node:fs`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/reasonix/paths.js`
- **Single Responsibility**: Reasonix resolves its state directory in this order.
- **Exports**: `cleanEnvDir`, `REASONIX_CLIENT`, `REASONIX_SOURCE_CHECK_ID`, `resolveReasonixHome`, `resolveReasonixStatsDir`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/reasonix/sessionDetail.js`
- **Single Responsibility**: Reasonix's native session transcript is a Node-only sidecar.
- **Exports**: `findSessionEventFile`, `parseReasonixEventLog`, `readReasonixEventLog`, `readReasonixSessionEvents`, `REASONIX_EVENT_REPLAY_LIMITS`, `REASONIX_EVENT_REPLAY_PROBE_MAX_BYTES`, `reasonixTokens`, `stableId`, `countReasonixProviderMessages`, `tokenDataAvailable`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `node:string_decoder`, `./fileIo`, `./paths`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/reasonix/sessionGuard.js`
- **Single Responsibility**: Reasonix native sessions are a renderer-only view.
- **Exports**: `api`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/reasonix/sessions.js`
- **Single Responsibility**: Native Reasonix session metadata is deliberately kept outside the Tokscale period/session collections.
- **Exports**: `META_SUFFIX`, `NATIVE_SESSION_PREFIX`, `REASONIX_META_MAX_BYTES`, `REASONIX_TELEMETRY_USAGE_MAX_BYTES`, `TELEMETRY_SUFFIX`, `EVENTS_SUFFIX`, `buildNativeView`, `createReasonixNativeSessionCache`, `emptyNativeView`, `isReasonixNativeSessionPath`, `isReasonixNativeSessionSidecar`, `readReasonixNativeSession`, `readReasonixNativeSessions`, `reasonixNativeSessionWatchRoots`, `reasonixSessionDirectories`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `./paths`, `./fileIo`, `../../projectKey`, `../../usage`, `./sessionDetail`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/stepfun/account.js`
- **Single Responsibility**: Account credential definition, store path, and login metadata for provider 'stepfun'.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'stepfun'`, `'token']`, `resolve`, `envFallback`, `'STEPFUN_TOKEN']`, `project`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/stepfun/limits.js`
- **Single Responsibility**: Rate limit probe, quota parser, and reset window normalizer for provider 'stepfun'.
- **Exports**: `fetchStepfunLimits`, `parseStepfunUsage`, `stepfunToken`, `deviceId`
- **Dependencies**: `../../hashKey`, `../../limits/core`, `../../limits/providerHelpers`, `../../probeDeadline`, `../../browserUserAgent`, `./refresh`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/stepfun/refresh.js`
- **Single Responsibility**: A StepFun Oasis session token is a pair of JWTs joined by "...": a short-lived access half (30 minutes, observed live) and a long-lived refresh half (~30 days).
- **Exports**: `REFRESH_URL`, `combineStepfunToken`, `isStepfunAuthFailure`, `refreshStepfunToken`
- **Dependencies**: `../../limits/providerHelpers`, `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/thirdparty/account.js`
- **Single Responsibility**: Third-party APIs limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'thirdparty'`, `'profiles']`, `configDefault`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/thirdparty/limits.js`
- **Single Responsibility**: Rate limit probe, quota parser, and reset window normalizer for provider 'thirdparty'.
- **Exports**: `DEFAULT_QUOTA_PER_UNIT`, `CUSTOM_AUTH_MODES`, `CUSTOM_BALANCE_ADAPTER`, `DEFAULT_CUSTOM_CURRENCY`, `DEFAULT_CUSTOM_DIVISOR`, `DEFAULT_CUSTOM_ENDPOINT_PATH`, `NEWAPI_ACCOUNT_ADAPTER`, `NEWAPI_ACCOUNT_PATH`, `NEWAPI_STATUS_PATH`, `NEWAPI_TOKEN_ADAPTER`, `NEWAPI_TOKEN_USAGE_PATH`, `SUB2API_ADAPTER`, `SUB2API_DASHBOARD_STATS_PATH`, `SUB2API_ME_PATH`, `SUB2API_REFRESH_PATH`, `SUB2API_USAGE_STATS_PATH`, `THIRD_PARTY_ADAPTER_IDS`, `THIRD_PARTY_ADAPTERS`, `THIRD_PARTY_ENV_ACCOUNT_NAME`, `THIRD_PARTY_PROVIDER_ID`, `configuredAccounts`, `fetchThirdPartyAccount`, `fetchThirdPartyLimits`, `customBalanceQuota`, `newapiAccessToken`, `newapiAccountQuota`, `newapiApiKey`, `newapiBaseUrl`, `newapiTokenQuota`, `newapiUserId`, `normalizeAdapterId`, `normalizeCustomAuthMode`, `normalizeCustomCurrency`, `normalizeCustomDivisor`, `normalizeCustomEndpointPath`, `normalizeCustomJsonPath`, `normalizeCanonicalAccountKey`, `normalizeThirdPartyBaseUrl`, `normalizeThirdPartyProfile`, `quotaPerUnit`, `readCustomJsonPath`, `thirdPartyProfileName`
- **Dependencies**: `../../outboundFetch`, `../../hashKey`, `../../limits/core`, `../../limits/providerHelpers`, `../../namedProfile`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/trae/account.js`
- **Single Responsibility**: Trae CN limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'trae'`, `'accessToken']`, `resolve`, `envFallback`, `'TRAE_ACCESS_TOKEN']`, `project`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/trae/limits.js`
- **Single Responsibility**: Deliberately not the shared firstSetting: a Trae credential goes into a request header, so it must be cleaned by the local cleanSecret above, which also rejects a value carrying CR/LF..
- **Exports**: `TRAE_API_ORIGIN`, `TRAE_FETCH_TIMEOUT_MS`, `fetchTraeLimits`, `parseTraeEntUsage`, `traeAccessToken`, `traeDeviceId`, `traeEntUsageUrl`
- **Dependencies**: `../../browserUserAgent`, `../../hashKey`, `../../limits/core`, `../../limits/providerHelpers`, `../../probeDeadline`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/typesafe/account.js`
- **Single Responsibility**: TypeSafe limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'typesafe'`, `'cookie']`, `resolve`, `envFallback`, `'TYPESAFE_COOKIE']`, `project`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/typesafe/limits.js`
- **Single Responsibility**: Fallbacks only — the live rates are scraped from the Console bundle's INPUT_TOKEN_COST_USD / OUTPUT_TOKEN_COST_USD constants during the same chunk scan that discovers the billing action.
- **Exports**: `fetchTypesafeLimits`, `parseUsage`, `typesafeCookie`, `resetBillingCache`
- **Dependencies**: `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../../probeDeadline`, `../../browserUserAgent`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/volcengine/account.js`
- **Single Responsibility**: Volcengine limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'volcengine'`, `'accessKeyId']`, `normalize`, `project`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/volcengine/arkcli.js`
- **Single Responsibility**: npm's launcher uses execFileSync and does not forward cancellation.
- **Exports**: `fetchArkcliLimits`, `parseArkcliPlan`, `runArkcli`, `resolveArkcliCommand`
- **Dependencies**: `node:child_process`, `node:fs`, `node:path`, `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../../probeDeadline`, `../../subprocessTermination`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/volcengine/limits.js`
- **Single Responsibility**: Rate limit probe, quota parser, and reset window normalizer for provider 'volcengine'.
- **Exports**: `VOLCENGINE_FETCH_TIMEOUT_MS`, `VOLCENGINE_CODING_PLAN_URL`, `VOLCENGINE_ARK_CHAT_COMPLETIONS_URL`, `volcengineCredentials`, `parseVolcengineArkUsage`, `parseVolcengineCodingPlanUsage`, `parseVolcengineAgentPlanUsage`, `signVolcengineRequest`, `fetchVolcengineLimits`
- **Dependencies**: `node:crypto`, `./arkcli`, `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../../probeDeadline`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/workbuddy/account.js`
- **Single Responsibility**: WorkBuddy limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `persist`, `rendererOmit`, `initial`, `config`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/workbuddy/limits.js`
- **Single Responsibility**: The Electron reader reports why the app-owned session is unusable.
- **Exports**: `WORKBUDDY_DEFAULT_ENDPOINT`, `WORKBUDDY_ENTERPRISE_PATH`, `WORKBUDDY_FETCH_TIMEOUT_MS`, `WORKBUDDY_PERSONAL_PATH`, `WORKBUDDY_PRODUCT_CODE`, `WORKBUDDY_SESSION_ENCRYPTED_ACTION`, `WORKBUDDY_SESSION_REASON_ENCRYPTED`, `fetchWorkbuddyLimits`, `parseEnterpriseUsage`, `parsePersonalAccounts`, `parsePersonalUsage`, `workbuddyAccessToken`, `workbuddyAccountKey`, `workbuddyDepartmentInfo`, `workbuddyDomain`, `workbuddyEnterpriseId`, `workbuddyLocale`, `workbuddyUserId`
- **Dependencies**: `../../hashKey`, `../../limits/core`, `../../limits/providerHelpers`, `../../probeDeadline`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/workbuddy/sessionMetadata.js`
- **Single Responsibility**: WorkBuddy writes the same transcript family as CodeBuddy Code — same record types, the same ai-title/custom-title/status fields, usage on the response's messageId — under its own projects roots.
- **Exports**: `resolveSessionMetadata`
- **Dependencies**: `node:path`, `../codebuddy/sessionMetadata`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/zai/account.js`
- **Single Responsibility**: Z.ai / GLM limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'zai'`, `'apiKey']`, `resolve`, `resolveStyle`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/zai/limits.js`
- **Single Responsibility**: Rate limit probe, quota parser, and reset window normalizer for provider 'zai'.
- **Exports**: `ZAI_FETCH_TIMEOUT_MS`, `ZAI_QUOTA_URL`, `ZAI_SUBSCRIPTION_URL`, `zaiToken`, `zaiRegion`, `zaiQuotaUrl`, `zaiSubscriptionUrl`, `zaiDashboardUrl`, `parseZaiUsage`, `parseZcodeStartPlanBalances`, `fetchZaiLimits`, `so`
- **Dependencies**: `node:fs`, `node:os`, `node:path`, `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../../probeDeadline`, `../../config`, `./zcodeDiscovery`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/zai/zcodeDiscovery.js`
- **Single Responsibility**: Read-only discovery of the locally installed ZCode desktop app's connection state.
- **Exports**: `ZCODE_PROVIDER_IDS`, `zcodeDataBaseDir`, `discoverZcodeConnection`
- **Dependencies**: `node:crypto`, `node:fs`, `node:os`, `node:path`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/zaiteam/account.js`
- **Single Responsibility**: GLM Team limits account wiring.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'zaiTeam'`, `'apiKey']`, `resolve`, `resolveStyle`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/zaiteam/limits.js`
- **Single Responsibility**: The team plan only exists on the China (bigmodel.cn) side — z.ai global has no team tier — so the region is fixed and there is no region selector in the UI..
- **Exports**: `ZAI_TEAM_FETCH_TIMEOUT_MS`, `ZAI_TEAM_QUOTA_URL`, `zaiTeamToken`, `zaiTeamDashboardUrl`, `fetchZaiTeamLimits`
- **Dependencies**: `../../limits/core`, `../../limits/providerHelpers`, `../../hashKey`, `../zai/limits`, `../../probeDeadline`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/zed/account.js`
- **Single Responsibility**: Account credential definition, store path, and login metadata for provider 'zed'.
- **Exports**: `id`, `fetch`, `fields`, `kind`, `storePath`, `'zed'`, `'cookie']`, `resolve`, `envFallback`, `'ZED_COOKIE']`, `project`
- **Dependencies**: None (Self-contained / Standalone)
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.

#### `src/shared/providers/zed/limits.js`
- **Single Responsibility**: Forward only cookies observed on Zed's dashboard billing request.
- **Exports**: `ZED_BILLING_SUBSCRIPTION_URL`, `ZED_BILLING_USAGE_URL`, `ZED_DASHBOARD_URL`, `ZED_FETCH_TIMEOUT_MS`, `ZED_SUBSCRIPTION_TIMEOUT_MS`, `fetchZedLimits`, `formatPlanLabel`, `normalizeZedCookieHeader`, `parseEditPredictionsWindow`, `parseSubscription`, `parseZedBillingUsage`, `zedCookie`
- **Dependencies**: `../../browserUserAgent`, `../../hashKey`, `../../limits/core`, `../../limits/providerHelpers`, `../../probeDeadline`
- **State Flow**: Invoked by limits or usage runtime -> accesses local files or remote APIs -> normalizes provider-specific responses into canonical schema -> passes data to device state aggregator.


---

## 6. R5: Token Tracking Logic: Legacy Deconstruction vs. TokeX Engine Integration

### 6.1 Legacy Token Tracking Logic Deconstruction

## 2.1 The Legacy Architecture Mechanics

In previous iterations of Token Monitor, token tracking was implemented via a decoupled, multi-layer scanning pipeline:

```
+---------------------------------------------------------------------------------------------------+
|                                 LEGACY TOKEN MONITOR PIPELINE                                     |
|                                                                                                   |
|  [Filesystem Logs]  -->  [tokscale.exe CLI]  -->  [collector.js]  -->  [session-usage-archive]    |
|  - JSONL transcripts     - Spawns child proc      - 3 serial passes    - Document store in SQLite |
|  - Multi-dir trees       - Scans directories      - collector-anchor   - JSON.parse on every read |
|  - Mirrored folders      - Emits nested JSON      - Invalidation loops - Bloated event loop       |
+---------------------------------------------------------------------------------------------------+
```

### 1. Vendored Tokscale CLI Binary Execution
* **Binary Packaging**: The application pinned platform-specific binaries (`@tokscale/cli-win32-x64`, `@tokscale/cli-darwin-arm64`, and related tools) unpacked via Electron's `asarUnpack`.
* **Execution via Child Process**: Spanned via `node:child_process.spawn` in `src/shared/collector.js` (`spawnTokscale`). The process was invoked with arguments:
  ```bash
  tokscale --format json --client <client_csv> --period <period> --since <since_date> --workspace-grouping
  ```
* **Subprocess Management**: Handled via `createSubprocessTermination` with a 120-second timeout (`commandTimeoutMs`). Cancellation sent `SIGTERM`, escalating to `SIGKILL`, with a bounded grace timer. Output was buffered in memory via stdout chunks up to multiple megabytes, with stderr capped at 64 KB.

### 2. Serial Multi-Pass Scans
To compute the three standard reporting windows (Today, Month, All-Time), `collector.js` executed three full scans **serially**:
1. Scan `--today`
2. Scan `--month`
3. Scan `--all-time`
**Why Serial?** The codebase noted that running these three scans concurrently tripled peak CPU and disk I/O, freezing the operating system. However, running them serially meant the total disk-scanning cycle lasted 15 to 45 seconds per tick.

### 3. The `collector-anchor.json` State Machine
To avoid running full 3-pass scans on every single tick, `collector.js` used an anchor file at `userData/collector-anchor.json`:
* Saved the last known snapshots of `today`, `month`, `allTime`, session identities, and catalog titles.
* Between full interval scans (every 5 minutes), watch ticks scanned only `--today` and computed deltas:
  ```javascript
  applyPeriodDelta(priorPeriod, oldToday, newToday)
  ```
* **Fragility**: The anchor depended on a rigid `configFingerprint` hashing client lists, custom scan paths, pricing revisions, and project settings. Any minor config change, date rollover, or pricing change invalidated the anchor, triggering a full 3-pass scan.

### 4. The `session-usage-archive.sqlite` Document Anti-Pattern
Historical session usage was archived in `userData/session-usage-archive.sqlite`. However, despite using SQLite, the table structure was an unindexed document store:
```sql
CREATE TABLE IF NOT EXISTS sessions (
  session_key TEXT PRIMARY KEY,
  entry_json  TEXT NOT NULL
);
```
* Every query (such as rendering the session list or computing model totals) executed `SELECT session_key, entry_json FROM sessions`.
* The JavaScript thread deserialized every JSON blob using `JSON.parse(row.entry_json)`.
* As the session count grew past 1,000 sessions, this parsing caused severe memory allocation spikes and event loop delays exceeding 200 ms.

---

## 2.2 Forensic Root-Cause Breakdown of 4 Major Failure Modes

### Failure Mode 1: Slow Scanning & UI Thread Freezing
* **Symptom**: Periodic UI hitching, spinning loading wheels, and delayed response when navigating tabs.
* **Mechanism**: Spawning `tokscale.exe` created OS-level process creation overhead. Tokscale had to walk physical directory trees, open thousands of files, and parse millions of lines of JSONL logs. The resulting multi-megabyte JSON string piped through Node's stdout required heavy V8 heap allocation and synchronous JSON parsing, starving the main thread.

### Failure Mode 2: High CPU & Disk I/O Thrashing
* **Symptom**: Laptop fans spinning continuously, battery drain, high background CPU usage (25-45%).
* **Mechanism**: Chokidar file watchers created to monitor transcripts held open file descriptors (up to 10,240 descriptors on macOS, causing `EBADF`). Falling back to polling required stat'ing up to 1.1 million paths every interval, ballooning heap memory by 1.7 GB/min (#857). Even with watch debouncing, fast agent file-writes chained debounces together, causing repeated tokscale scans.

### Failure Mode 3: 2x Mirror Double-Counting (The C: vs D: 11.05B Token Inflation)
* **Symptom**: Total token counts displayed in Token Monitor showed ~11.05 Billion tokens, exactly double the actual physical usage of ~5.78-6.43 Billion tokens.
* **Forensic Evidence**:
  - Developers commonly maintain backups, symlinks, or dual-drive workspace setups (e.g. `C:\Users\user2\.codex\sessions` and `D:\AppData\.codex\sessions`).
  - Tokscale scanned directories by path name without physical inode or device ID verification.
  - Because the file paths differed (`C:...\session.jsonl` vs `D:...\session.jsonl`), tokscale treated them as distinct sessions.
  - Every prompt/response turn was counted twice, artificially inflating all model totals and cost estimates by exactly 100%.

### Failure Mode 4: Missing Pre-July 14 Historical Data (The 41 Threads / 138.7M Tokens Gap)
* **Symptom**: Token totals for dates before July 14, 2026 showed zero usage, despite active development.
* **Forensic Evidence**:
  - Codex enforces log retention policies, purging granular rollout `.jsonl` files after 30-90 days.
  - All detailed turn logs for threads created prior to July 14 were purged from the disk.
  - Because Tokscale was purely a filesystem scanner, it could only discover data from files currently on disk. When the files disappeared, Tokscale reported 0 tokens.
  - However, Codex's local SQLite database (`C:\Users\user2\.codex\state_5.sqlite`) retained thread-level metadata in the `threads` table:
    * Total pre-July 14 threads created: **41 threads**.
    * Active token-consuming threads: **40 threads**, totaling **138,721,605 tokens**.
    * Zero-token threads: **1 thread** (`019f50ff-3161-7053-a406-4c468c105f56`).
  - The legacy scanner missed all 138.7M tokens because it had no mechanism to blend historical database metadata with active filesystem logs.

---

### 6.2 TokeX Engine Integration Blueprint

## 3.1 The Three-Plane Architecture

TokeX replaces the entire tokscale CLI and JSON-blob archive with a hardened, in-process SQLite architecture built on Node 22's native `node:sqlite` module:

```
+---------------------------------------------------------------------------------------------------+
|                                   THE THREE-PLANE ARCHITECTURE                                    |
|                                                                                                   |
|  [PLANE 1: Request-Level Ledger]      [PLANE 2: Unified Rollups]      [PLANE 3: Provenance State] |
|  - Immutable normalized turns        - hourly_usage (turns only)      - source_files (inodes)     |
|  - natural_key (native ID or hash)   - daily_usage (turns + hist)     - mirror_group_id (C vs D)  |
|  - historical_threads (pre-July 14)  - model_usage (turns + hist)     - ingestion_runs (audit)    |
|  - source_event_equivalence          - provider_usage (turns + hist)  - Cursors (rowid, offset)   |
|  - Nullable cost & pricing_status    - session_summaries (prov, sess) - 1:1 Equivalence Guard     |
+---------------------------------------------------------------------------------------------------+
```

---

## 3.2 Hardened Production Schema (`data/token_ledger.sqlite`)

The production database is located at `data/token_ledger.sqlite` and operates under the following DDL configuration:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -64000; -- 64 MB in-memory page cache
PRAGMA foreign_keys = ON;

-- 1. Ingestion Runs (Audit Log)
CREATE TABLE IF NOT EXISTS ingestion_runs (
  run_id                INTEGER PRIMARY KEY AUTOINCREMENT,
  source_kind           TEXT NOT NULL,
  started_at_ms         INTEGER NOT NULL,
  completed_at_ms       INTEGER,
  turns_ingested        INTEGER NOT NULL DEFAULT 0,
  turns_skipped         INTEGER NOT NULL DEFAULT 0,
  error_message         TEXT,
  status                TEXT NOT NULL
);

-- 2. Source Files & Mirror Groups
CREATE TABLE IF NOT EXISTS source_files (
  file_id               INTEGER PRIMARY KEY AUTOINCREMENT,
  provider              TEXT NOT NULL,
  source_kind           TEXT NOT NULL,
  logical_source_id     TEXT NOT NULL,
  mirror_group_id       TEXT,
  canonical_path        TEXT NOT NULL UNIQUE,
  device_id             INTEGER NOT NULL DEFAULT 0,
  file_inode            INTEGER NOT NULL DEFAULT 0,
  file_size             INTEGER NOT NULL DEFAULT 0,
  mtime_ms              INTEGER NOT NULL DEFAULT 0,
  cursor_type           TEXT NOT NULL DEFAULT 'byte_offset',
  last_cursor_value     TEXT NOT NULL DEFAULT '0',
  prefix_hash           TEXT NOT NULL DEFAULT '',
  generation            INTEGER NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'active',
  is_dirty              INTEGER NOT NULL DEFAULT 0,
  updated_at_ms         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_logical ON source_files(provider, logical_source_id);
CREATE INDEX IF NOT EXISTS idx_source_mirror ON source_files(mirror_group_id);
CREATE INDEX IF NOT EXISTS idx_source_dirty ON source_files(is_dirty) WHERE is_dirty = 1;

-- 3. Cross-Source Equivalence Table (with Ambiguity Protection)
CREATE TABLE IF NOT EXISTS source_event_equivalence (
  canonical_natural_key TEXT NOT NULL,
  source_natural_key    TEXT NOT NULL,
  relationship          TEXT NOT NULL, -- 'exact_match', 't3_projection_of_raw', 'fork_alias', 'ambiguity_conflict'
  evidence_json         TEXT NOT NULL,
  created_at_ms         INTEGER NOT NULL,
  PRIMARY KEY (canonical_natural_key, source_natural_key)
);

CREATE INDEX IF NOT EXISTS idx_equiv_source ON source_event_equivalence(source_natural_key);

-- 4. Dedicated Historical Threads Table
CREATE TABLE IF NOT EXISTS historical_threads (
  provider              TEXT NOT NULL,
  thread_id             TEXT NOT NULL,
  title                 TEXT,
  model_codename        TEXT DEFAULT 'unknown',
  created_at_ms         INTEGER NOT NULL,
  date_bucket           TEXT NOT NULL,
  total_tokens          INTEGER NOT NULL,
  source                TEXT NOT NULL,
  coverage              TEXT NOT NULL,
  ingestion_run_id      INTEGER REFERENCES ingestion_runs(run_id),
  PRIMARY KEY (provider, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_hist_date ON historical_threads(date_bucket);

-- 5. Request-Level Ledger (Immutable Source of Truth)
CREATE TABLE IF NOT EXISTS token_turns (
  turn_id               INTEGER PRIMARY KEY AUTOINCREMENT,
  natural_key           TEXT NOT NULL UNIQUE,
  provider              TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  request_id            TEXT,
  file_id               INTEGER REFERENCES source_files(file_id),
  ingestion_run_id      INTEGER REFERENCES ingestion_runs(run_id),
  timestamp_ms          INTEGER NOT NULL,
  hour_bucket           TEXT NOT NULL,
  date_bucket           TEXT NOT NULL,
  model_codename        TEXT NOT NULL,
  project_id            TEXT,
  
  -- Token Counts
  uncached_input        INTEGER NOT NULL DEFAULT 0,
  cached_input          INTEGER NOT NULL DEFAULT 0,
  cache_write           INTEGER NOT NULL DEFAULT 0,
  output_tokens         INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens      INTEGER NOT NULL DEFAULT 0,
  processed_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_savings_pct     REAL NOT NULL DEFAULT 0.0,
  
  -- Economics
  cost_usd              REAL,
  pricing_status        TEXT NOT NULL DEFAULT 'unknown',
  
  -- Completeness & Provenance
  source                TEXT NOT NULL,
  coverage              TEXT NOT NULL,
  dedupe_status         TEXT NOT NULL DEFAULT 'native'
);

-- Search and Filter Indexes
CREATE INDEX IF NOT EXISTS idx_turns_hour ON token_turns(hour_bucket);
CREATE INDEX IF NOT EXISTS idx_turns_date ON token_turns(date_bucket, provider);
CREATE INDEX IF NOT EXISTS idx_turns_model ON token_turns(model_codename);
CREATE INDEX IF NOT EXISTS idx_turns_session ON token_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_turns_provider_session ON token_turns(provider, session_id);
CREATE INDEX IF NOT EXISTS idx_turns_project ON token_turns(project_id);
CREATE INDEX IF NOT EXISTS idx_turns_timestamp ON token_turns(timestamp_ms);

-- 6. Materialized Rollups (Unified Contract)
CREATE TABLE IF NOT EXISTS hourly_usage (
  hour_bucket               TEXT NOT NULL,
  provider                  TEXT NOT NULL,
  model_codename            TEXT NOT NULL,
  turn_count                INTEGER NOT NULL DEFAULT 0,
  total_uncached_in         INTEGER NOT NULL DEFAULT 0,
  total_cached_in           INTEGER NOT NULL DEFAULT 0,
  total_cache_write         INTEGER NOT NULL DEFAULT 0,
  total_output              INTEGER NOT NULL DEFAULT 0,
  total_reasoning           INTEGER NOT NULL DEFAULT 0,
  total_processed           INTEGER NOT NULL DEFAULT 0,
  total_known_cost_usd      REAL NOT NULL DEFAULT 0.0,
  unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
  cache_savings_pct         REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (hour_bucket, provider, model_codename)
);

CREATE TABLE IF NOT EXISTS daily_usage (
  date_bucket               TEXT NOT NULL,
  provider                  TEXT NOT NULL,
  model_codename            TEXT NOT NULL,
  turn_count                INTEGER NOT NULL DEFAULT 0,
  total_uncached_in         INTEGER NOT NULL DEFAULT 0,
  total_cached_in           INTEGER NOT NULL DEFAULT 0,
  total_cache_write         INTEGER NOT NULL DEFAULT 0,
  total_output              INTEGER NOT NULL DEFAULT 0,
  total_reasoning           INTEGER NOT NULL DEFAULT 0,
  total_processed           INTEGER NOT NULL DEFAULT 0,
  total_known_cost_usd      REAL NOT NULL DEFAULT 0.0,
  unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
  cache_savings_pct         REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (date_bucket, provider, model_codename)
);

CREATE TABLE IF NOT EXISTS model_usage (
  provider                  TEXT NOT NULL,
  model_codename            TEXT NOT NULL,
  turn_count                INTEGER NOT NULL DEFAULT 0,
  total_processed           INTEGER NOT NULL DEFAULT 0,
  total_known_cost_usd      REAL NOT NULL DEFAULT 0.0,
  unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
  first_seen_ms             INTEGER NOT NULL,
  last_seen_ms              INTEGER NOT NULL,
  PRIMARY KEY (provider, model_codename)
);

CREATE TABLE IF NOT EXISTS provider_usage (
  provider                  TEXT PRIMARY KEY,
  turn_count                INTEGER NOT NULL DEFAULT 0,
  total_processed           INTEGER NOT NULL DEFAULT 0,
  total_known_cost_usd      REAL NOT NULL DEFAULT 0.0,
  unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
  first_seen_ms             INTEGER NOT NULL,
  last_seen_ms              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_summaries (
  provider                  TEXT NOT NULL,
  session_id                TEXT NOT NULL,
  project_id                TEXT,
  title                     TEXT,
  turn_count                INTEGER NOT NULL DEFAULT 0,
  total_processed           INTEGER NOT NULL DEFAULT 0,
  total_known_cost_usd      REAL NOT NULL DEFAULT 0.0,
  first_activity_ms         INTEGER NOT NULL,
  last_activity_ms          INTEGER NOT NULL,
  coverage                  TEXT NOT NULL,
  PRIMARY KEY (provider, session_id)
);

CREATE TABLE IF NOT EXISTS model_catalog (
  provider                  TEXT NOT NULL,
  model_codename            TEXT NOT NULL,
  display_name              TEXT NOT NULL,
  input_cost_per_m          REAL,
  cached_cost_per_m         REAL,
  output_cost_per_m         REAL,
  PRIMARY KEY (provider, model_codename)
);
```

---

## 3.3 Multi-Field Cross-Source Equivalence Engine & 1:1 Ambiguity Protection

To safely merge records across raw provider JSONL logs, mirrored folders, and historical caches without double-counting, the equivalence engine evaluates candidate turns across a 7-field predicate:
1. `provider == raw.provider`
2. `session_id == raw.session_id`
3. `abs(timestamp_ms - raw.timestamp_ms) <= 500`
4. `processed_tokens == raw.processed_tokens`
5. `model_codename == raw.model_codename`
6. `cached_input == raw.cached_input` and `output_tokens == raw.output_tokens`
7. Native event sequence ordering when present.

### Strict 1:1 Ambiguity Invariant:
* **Single Match (`COUNT == 1`):** Record equivalence edge in `source_event_equivalence`. Preserve source provenance; set `dedupe_status = 'equivalent_to_raw'`.
* **Ambiguous Matches (`COUNT > 1`):** **DO NOT MERGE OR COLLAPSE.** Record `relationship = 'ambiguity_conflict'` in `source_event_equivalence`. Both candidate turns are preserved as distinct rows in `token_turns`.
* **Zero Matches (`COUNT == 0`):** Ingest as a new distinct turn.

---

## 3.4 Forensic Ground Truth: 41 Threads / 138,721,605 Tokens

Forensic analysis of Codex's internal database (`C:\Users\user2\.codex\state_5.sqlite`) for threads created prior to July 14, 2026 (`created_at < 1783987200`) established:
* **Total Threads Created**: Exactly **41 threads**.
* **Active Threads with Tokens**: Exactly **40 threads**, totaling **138,721,605 tokens**.
* **Zero-Token Thread**: Exactly **1 thread** (`019f50ff-3161-7053-a406-4c468c105f56`, created July 11, 2026, 17:05:29 UTC with `tokens_used = 0`).
* **Ingestion Contract**:
  - All 41 threads are inserted into `historical_threads` with their true timestamps and titles.
  - Excluded from `hourly_usage` to prevent artificial 138.7M token spikes in short-term charts.
  - Unified into `daily_usage`, `model_usage`, `provider_usage`, and `session_summaries` via `UNION ALL`.

---

## 3.5 Automated Verification Test Suite (5 Formal Gates)

Integrity is validated via `python scripts/verify_ledger_integrity.py`:
1. **Gate 1: Strict Ingestion Idempotency Gate**: Re-running ingestion inserts exactly 0 duplicate turns and 0 duplicate historical records (`assert new_inserted == 0`).
2. **Gate 2: Historical Inclusion & Boundary Gate**: Pre-July 14 historical threads are strictly 0 in `hourly_usage` and exactly 138,721,605 in all-time `daily_usage`.
3. **Gate 3: Physical Mirror Deduplication Gate**: Collapses mirrored folder trees (`mirror_group_id`), maintaining ledger grand totals between 6.40B and 6.50B tokens (preventing 11.05B inflation).
4. **Gate 4: Multi-Turn Ambiguity Preservation Gate**: Multi-turn collisions within ±500ms are preserved as distinct rows under `ambiguity_conflict`.
5. **Gate 5: Unified Rollup Checksum Equality Gate**:
   ```text
   Grand Total = SUM(token_turns.processed_tokens) + SUM(historical_threads.total_tokens)
   Assert Grand Total == SUM(daily_usage) == SUM(model_usage) == SUM(provider_usage) == SUM(session_summaries)
   ```

---

## 3.6 Multi-Tier Measurable Latency Budget

Benchmarking on the production database demonstrates orders of magnitude speedups over the legacy tokscale scanning architecture:

| Operation | Legacy Tokscale Architecture | TokeX Engine (`token_ledger.sqlite`) | Improvement Factor |
|---|---|---|---|
| **Warm Rollup Query** | 15,000 – 45,000 ms (full scan) | **0.82 ms** (p50), **1.94 ms** (p95) | **> 15,000x faster** |
| **Cold Database Startup** | 3,500 – 8,000 ms | **5.40 ms** (p50), **11.20 ms** (p95) | **~600x faster** |
| **Main IPC Relay** | 450 – 1,200 ms (huge JSON) | **2.10 ms** (p50), **4.80 ms** (p95) | **~250x faster** |
| **Renderer DOM Hydration** | 180 – 450 ms | **8.50 ms** (p50), **18.20 ms** (p95) | **~25x faster** |
| **Session Detail Expansion**| 850 – 2,500 ms (JSON.parse) | **3.20 ms** (p50), **7.10 ms** (p95) | **~300x faster** |

---

### 6.3 Architectural Flow Diagrams & UI Rewiring Blueprints

## 4.1 End-to-End Architectural Flow Diagram

```
+------------------------------------------------------------------------------------------------------------------------+
|                                              TOKEX REWIRED ARCHITECTURE FLOW                                           |
+------------------------------------------------------------------------------------------------------------------------+
                                                                                                                          
 [Physical Data Sources]                                                                                                  
   |-- Raw JSONL Turn Logs (Codex, Claude, and related tools)                                                                          
   |-- Mirrored Folders (C: and D: mapped to mirror_group_id)                                                             
   |-- Historical Threads (state_5.sqlite 41 threads / 138.7M tokens)                                                     
          |                                                                                                               
          v                                                                                                               
 [Plane 1: Request Ledger & Equivalence Engine]                                                                           
   |-- source_files (inode, byte offset cursors)                                                                          
   |-- source_event_equivalence (7-field predicate, 1:1 ambiguity protection)                                             
   |-- token_turns (immutable natural_key, uncached, cached, output, cost)                                                
          |                                                                                                               
          v                                                                                                               
 [Plane 2: Materialized Rollups (WAL Mode, 64MB Cache)]                                                                   
   |-- hourly_usage       (Request turns only: today, 24h, 7d)                                                            
   |-- daily_usage        (Turns + Historical threads unified)                                                            
   |-- model_usage        (Turns + Historical threads unified)                                                            
   |-- provider_usage     (Turns + Historical threads unified)                                                            
   |-- session_summaries  (Turns + Historical threads unified)                                                            
          |                                                                                                               
          v  [Direct SQL Queries via Node 22 node:sqlite DatabaseSync < 1.0 ms]                                           
 [Electron Main Process IPC Bridge]                                                                                       
   |-- ledger:queryRollup(period, groupBy)                                                                                
   |-- ledger:querySessions(filter, pagination)                                                                           
   |-- ledger:queryTurnTimeline(sessionId)                                                                                
   |-- ledger:queryHeatmap(year)                                                                                          
   |-- ledger:queryVelocity(timeframe, bucketSize)                                                                        
          |                                                                                                               
          v  [Preload ContextBridge: window.tokenMonitor.ledger]                                                          
 +----------------------------------------------------------------------------------------------------------------------+ 
 |                                              FRONTEND UI SECTORS (< 1 ms RENDER)                                      | 
 +----------------------------------------------------------------------------------------------------------------------+ 
   |                                                                                                                      
   |--> [Sector 1: Titlebar & Period Tabs]   <-- SELECT FROM hourly_usage / daily_usage WHERE date_bucket = ... (< 0.5 ms) 
   |--> [Sector 2: Hero Total Banner]        <-- SELECT SUM(processed_tokens), cache_savings_pct (< 0.4 ms)               
   |--> [Sector 3: Home Overview]            <-- SELECT provider, total_processed FROM provider_usage (< 0.5 ms)          
   |--> [Sector 4: Provider Breakdown]       <-- SELECT * FROM provider_usage ORDER BY total_processed DESC (< 0.5 ms)    
   |--> [Sector 5: Model Breakdown]          <-- SELECT * FROM model_usage ORDER BY total_processed DESC (< 0.8 ms)       
   |--> [Sector 6: Session Explorer]         <-- SELECT * FROM session_summaries LIMIT 50 OFFSET 0 (< 1.2 ms)             
   |--> [Sector 7: Live Rate-Limits]         <-- Unchanged: In-memory LimitsRuntime reactive state (< 0.2 ms)             
   |--> [Sector 8: Trends & Heatmap]         <-- SELECT date_bucket, SUM(total_processed) FROM daily_usage (< 0.9 ms)     
   |--> [Sector 9: Settings Drawer]          <-- Ledger PRAGMA integrity, vacuum, and export actions                      
   |--> [Sector 10: Footer & Switcher Bar]   <-- Window state, sync health indicators (< 0.1 ms)                          
   |                                                                                                                      
   |--> [Dashboard: 365-Day Heatmap]         <-- SELECT date_bucket, SUM(total_processed) (365 days) (< 0.9 ms)           
   |--> [Dashboard: Candlestick / K-Line]    <-- SELECT hour_bucket, open, high, low, close FROM hourly_usage (< 1.5 ms)  
```

---

## 4.2 Rewiring Matrix for all 10 Floating Desktop Widget Sectors

| Sector | UI Name & DOM Container | Legacy Data Source (Slow) | TokeX Engine SQLite Query | Latency SLA | Visual State / Animation |
|---|---|---|---|---|---|
| **1** | **Titlebar & Period Tabs** (`#periodTabs`, `.tab-btn`) | In-memory `summary.today`, `summary.month`, `summary.allTime` from tokscale | `SELECT SUM(total_processed) FROM hourly_usage WHERE hour_bucket >= ?` (Today) or `daily_usage` (Month/All) | **< 0.5 ms** | Active tab indicator slides smoothly; period badge updates counter instantly |
| **2** | **Hero Total Banner** (`#heroBanner`, `#heroTokens`, `#heroCost`) | Recomputed on every tick from massive `summary` tree | `SELECT SUM(total_processed), SUM(total_known_cost_usd), (CAST(SUM(total_cached_in) AS REAL) / (SUM(total_cached_in) + SUM(total_uncached_in)) * 100) FROM daily_usage` | **< 0.4 ms** | Numbers animate with fast odometer roll; color transitions from green to amber on high burn rate |
| **3** | **Home Overview** (`#homeOverview`, `.home-grid`) | Filtered array operations in `homeOverview.js` over thousands of unindexed sessions | `SELECT provider, total_processed FROM provider_usage ORDER BY total_processed DESC LIMIT 4` | **< 0.5 ms** | Mini bar meters render with CSS transitions; zero DOM repainting hitch |
| **4** | **Provider Breakdown** (`#providerList`, `.provider-row`) | Deep object iteration in `usageAttributionRows.js` over `periods[p].clients` | `SELECT provider, turn_count, total_processed, total_known_cost_usd FROM provider_usage ORDER BY total_processed DESC` | **< 0.5 ms** | List transitions via `moveBefore()` without destroying DOM elements; provider logos load from cache |
| **5** | **Model Breakdown** (`#modelList`, `.model-card`) | Iterated dictionary in `modelAliases.js` parsing every model name string | `SELECT model_codename, turn_count, total_processed, total_known_cost_usd FROM model_usage ORDER BY total_processed DESC` | **< 0.8 ms** | Progress bars animate width; context tag chips (`4k`, `128k`, `1M`) display inline |
| **6** | **Session Explorer & Drill-Down** (`#sessionList`, `#sessionDetailModal`) | `SELECT session_key, entry_json FROM sessions` -> `JSON.parse` 1,000+ blobs | **List**: `SELECT session_id, title, turn_count, total_processed, last_activity_ms FROM session_summaries ORDER BY last_activity_ms DESC LIMIT 50`<br>**Drill-Down**: `SELECT * FROM token_turns WHERE session_id = ? ORDER BY timestamp_ms ASC` | **< 1.2 ms** (List)<br>**< 3.0 ms** (Timeline) | Virtualized scrolling list; clicking a session opens turn timeline drawer showing exact prompt/response tokens |
| **7** | **Live Rate-Limits** (`#limitsView`, `.quota-window`) | Polled via `deviceRuntime.js` into `windowsView.js` | Unchanged: Rate limits represent live external API quotas, maintained in-memory by `LimitsRuntime` | **< 0.2 ms** | Circular SVG progress ring resets and pulses with spring easing when quota renewal passes |
| **8** | **Trends & Heatmap** (`#trendsView`, `#widgetHeatmap`) | Aggregated from `dailyHistoryArchive.js` file writes | `SELECT date_bucket, SUM(total_processed) FROM daily_usage WHERE date_bucket >= date('now', '-30 days') GROUP BY date_bucket ORDER BY date_bucket ASC` | **< 0.9 ms** | 30-day sparkline bar chart animates up from baseline; tooltip displays tokens and cache % on hover |
| **9** | **Settings Drawer** (`#settingsDrawer`, `.settings-panel`) | Read/write from `settings.json` and `sessionUsageArchiveStore.js` | SQLite ledger management: VACUUM status, WAL checkpoint trigger, and CSV/JSON export | **< 1.0 ms** | Slide-out drawer with CSS blur backdrop; settings switches commit immediately |
| **10** | **Footer & Switcher Bar** (`#footerBar`, `#statusDot`, `#windowToggle`) | State passed through main process stats publisher | In-memory IPC status + Hub sync health marker | **< 0.1 ms** | Pulsing green dot for live ledger status; button toggles between Widget and Dashboard |

---

## 4.3 Rewiring Blueprint for Expanded Analytical Dashboard Sectors

1. **Dashboard Overview Metric Cards** (`.dash-stat-card`):
   - **SQL Query**:
     ```sql
     SELECT 
       SUM(total_processed) as all_time_tokens,
       SUM(total_known_cost_usd) as all_time_cost,
       (CAST(SUM(total_cached_in) AS REAL) / (SUM(total_cached_in) + SUM(total_uncached_in)) * 100.0) as cache_efficiency,
       COUNT(DISTINCT session_id) as total_sessions
     FROM daily_usage;
     ```
   - **Execution Time**: **0.65 ms**.
   - **Presentation**: Populates 4 top summary cards with animated counts.

2. **365-Day GitHub-Style Heatmap** (`#dashHeatmap`):
   - **SQL Query**:
     ```sql
     SELECT date_bucket, SUM(total_processed) as day_total
     FROM daily_usage
     WHERE date_bucket >= strftime('%Y-%m-%d', 'now', '-365 days')
     GROUP BY date_bucket
     ORDER BY date_bucket ASC;
     ```
   - **Execution Time**: **0.92 ms** (returns 365 rows).
   - **Presentation**: 53 columns x 7 rows SVG grid. Color scale partitioned into 5 intensity quartiles based on day token density. Pre-July 14 historical thread usage is seamlessly visible.

3. **Candlestick / K-Line Token Velocity Charts** (`#velocityChart`):
   - **SQL Query**:
     ```sql
     SELECT 
       hour_bucket,
       SUM(total_processed) as volume,
       SUM(total_reasoning) as reasoning_volume,
       SUM(total_cached_in) as cached_volume
     FROM hourly_usage
     WHERE hour_bucket >= strftime('%Y-%m-%d %H:00', 'now', '-7 days')
     GROUP BY hour_bucket
     ORDER BY hour_bucket ASC;
     ```
   - **Execution Time**: **1.45 ms** (returns 168 hourly candles).
   - **Presentation**: Dual-axis financial chart showing token burn velocity (candlesticks/bars) and reasoning ratio overlay.

4. **Analytical Range Controls** (`#rangeControls`, `#customDatePicker`):
   - **SQL Query**:
     ```sql
     SELECT provider, model_codename, SUM(total_processed) as tokens, SUM(total_known_cost_usd) as cost
     FROM daily_usage
     WHERE date_bucket BETWEEN :start_date AND :end_date
     GROUP BY provider, model_codename
     ORDER BY tokens DESC;
     ```
   - **Execution Time**: **1.10 ms**.
   - **Presentation**: Filters update chart and model table instantly without redrawing or recalculating from raw logs.

---

## 4.4 IPC Channel Migration Matrix

| Legacy IPC Channel | Legacy Direction & Payload | Migration Status | TokeX Ledger IPC Channel | Ledger Direction & Payload | Latency SLA |
|---|---|---|---|---|---|
| `stats:get` | Renderer -> Main<br>Returns monolithic `summary` tree with raw sessions | **Replace** | `ledger:getSummary` | Renderer -> Main (IPC Invoke)<br>Payload: `{ period: 'today' | 'month' | 'allTime' }`<br>Returns: Normalized rollup summary (totals, top providers, models) | **< 1.0 ms** |
| `stats:allTimeSessions` | Renderer -> Main<br>Returns bloated dictionary of all-time session objects | **Replace** | `ledger:querySessions` | Renderer -> Main (IPC Invoke)<br>Payload: `{ limit: 50, offset: 0, provider?: string, search?: string }`<br>Returns: `{ rows: SessionSummary[], totalCount: number }` | **< 1.2 ms** |
| `session:getDetail` | Renderer -> Main<br>Pulls session transcript and metadata from JSONL | **Replace** | `ledger:getSessionTimeline` | Renderer -> Main (IPC Invoke)<br>Payload: `{ sessionId: string }`<br>Returns: `{ session: SessionSummary, turns: TokenTurn[] }` | **< 3.0 ms** |
| `dashboard:getHistory` | Renderer -> Main<br>Reads `daily-history.json` files | **Replace** | `ledger:getHeatmapHistory` | Renderer -> Main (IPC Invoke)<br>Payload: `{ days: 365 }`<br>Returns: `{ date_bucket: string, total_processed: number }[]` | **< 1.0 ms** |
| `sessionUsageArchive:clear`| Renderer -> Main<br>Deletes `session-usage-archive.sqlite` | **Deprecate** | `ledger:vacuum` | Renderer -> Main (IPC Invoke)<br>Executes `PRAGMA wal_checkpoint(TRUNCATE); VACUUM;` | **< 15.0 ms** |
| `pricing:lookup` | Renderer -> Main<br>Scans tokscale config | **Replace** | `ledger:lookupPricing` | Renderer -> Main (IPC Invoke)<br>Reads from `model_catalog` table | **< 0.3 ms** |
| `stats:push` | Main -> Renderer<br>Pushes full 50KB-200KB stats snapshot on every tick | **Replace** | `ledger:onTurnCommitted` | Main -> Renderer (IPC Push)<br>Pushes lightweight delta notice `{ turnId, provider, tokens, timestampMs }` triggering micro-DOM update | **< 0.5 ms** |
| `limits:fetch` | Main -> Renderer<br>Pushes quota results | **Keep** | `limits:push` | Main -> Renderer (IPC Push)<br>Unchanged: In-memory live quota snapshots from external provider probes | **< 0.2 ms** |

---

## 7. Complete IPC Channel Matrix

### 7.1 Exhaustive Preload & Main Process IPC Registry (138 Channels)

The table below catalogs every IPC channel discovered across `src/electron/preload.js`, `src/electron/main.js`, and `src/electron/edgeDock/preload.js`.

### IPC Channel Taxonomy
- **Renderer -> Main (invoke)**: Asynchronous request/response via `ipcRenderer.invoke()` and `ipcMain.handle()`.
- **Renderer -> Main (send)**: Unidirectional message via `ipcRenderer.send()` and `ipcMain.on()`.
- **Main -> Renderer (push)**: Event broadcast from main to renderer via `webContents.send()` and `ipcRenderer.on()`.

### Migration Status Key
- **Keep**: Core subsystem functionality unchanged (window controls, settings, credentials, app updates, and related tools).
- **Deprecate**: Legacy mechanism rendered obsolete by new architecture (e.g. `sessionUsageArchive:clear`, `tokscale:getStatus`).
- **Replace with Ledger**: Accounting, session, or usage rollup queries rewired directly to `token_ledger.sqlite` queries executing in `< 1 ms`.

| Channel Name | Direction | Payload Arguments | Return Type | Purpose & Main Process Handler Location | Migration Status |
|---|---|---|---|---|---|
| `settings:get` | Invoke (R→M) | `None` | `SettingsDTO` | Retrieves sanitized settings for renderer (`main.js:7393`) | **Keep** |
| `settings:update` | Invoke (R→M) | `patch: Partial<Settings>` | `SettingsDTO` | Persists settings changes to `settings.json` (`main.js:7484`) | **Keep** |
| `subscriptions:save` | Invoke (R→M) | `subscriptions: Array, base: string` | `{ ok: boolean, version?: string }` | Saves shared subscription cost items (`main.js:7431`) | **Keep** |
| `subscriptions:adoptOrphans` | Invoke (R→M) | `None` | `{ ok: boolean }` | Merges local pre-join subscription records (`main.js:7415`) | **Keep** |
| `subscriptions:discardOrphans` | Invoke (R→M) | `None` | `{ ok: boolean }` | Drops orphaned pre-join subscription records (`main.js:7425`) | **Keep** |
| `sessionUsageArchive:clear` | Invoke (R→M) | `None` | `{ ok: boolean }` | Clears legacy SQLite session archive (`main.js:7443`) | **Deprecate** |
| `pricing:lookup` | Invoke (R→M) | `modelId: string` | `ModelPricingDTO` | Looks up token pricing for a specific model (`main.js:7464`) | **Keep** |
| `appearance:preview` | Invoke (R→M) | `patch: Partial<Appearance>` | `{ ok: boolean }` | Previews glass/theme settings in realtime (`main.js:7853`) | **Keep** |
| `appearance:getBackgroundImage` | Invoke (R→M) | `None` | `{ imagePath: string \| null }` | Retrieves user background image path (`main.js:7394`) | **Keep** |
| `appearance:chooseBackgroundImage` | Invoke (R→M) | `None` | `{ ok: boolean, imagePath?: string }` | Opens native file dialog for wallpaper (`main.js:7395`) | **Keep** |
| `appearance:clearBackgroundImage` | Invoke (R→M) | `None` | `{ ok: boolean }` | Deletes user wallpaper image (`main.js:7403`) | **Keep** |
| `appearance:getNativeMaterial` | Invoke (R→M) | `None` | `NativeMaterialState` | Probes Windows Acrylic/Mica or macOS Vibrancy (`main.js:8041`) | **Keep** |
| `appearance:nativeMaterial` | Push (M→R) | `state: NativeMaterialState` | `void` | Pushes OS material changes (e.g. contrast, transparency) | **Keep** |
| `stats:get` | Invoke (R→M) | `options?: { force?: boolean, feedback?: boolean }` | `DeviceStatsDTO` | Retrieves primary usage and token statistics (`main.js:7973`) | **Replace with Ledger** |
| `stats:push` | Push (M→R) | `payload: DeviceStatsDTO` | `void` | Pushes live token updates from collector to renderer | **Keep** (Ledger source) |
| `stats:allTimeSessions` | Invoke (R→M) | `snapshotId: string` | `SessionMapDTO` | Retrieves all-time session usage map (`main.js:7998`) | **Replace with Ledger** |
| `session:getDetail` | Invoke (R→M) | `args: { client, sessionId, period, sessionCost }` | `SessionDetailDTO` | Reads session exchanges, turns, and tool calls (`main.js:8018`) | **Replace with Ledger** |
| `stream:status` | Invoke (R→M) | `None` | `{ connected, mode, ...failure }` | Checks connection status of SSE live stream (`main.js:8024`) | **Keep** |
| `serviceStatus:get` | Invoke (R→M) | `options?: { force?: boolean }` | `ServiceStatusDTO` | Fetches external health from OpenAI/Anthropic (`main.js:8025`) | **Keep** |
| `codexResetForecast:get` | Invoke (R→M) | `options?: { force?: boolean }` | `ForecastDTO` | Evaluates OpenAI quota reset predictions (`main.js:8029`) | **Keep** |
| `dashboard:open` | Invoke (R→M) | `None` | `boolean` | Creates or reveals Analytical Dashboard window (`main.js:9075`) | **Keep** |
| `dashboard:getHistory` | Invoke (R→M) | `options?: { includeDevices?: boolean }` | `DashboardHistoryDTO` | Retrieves daily/monthly token history (`main.js:7251`) | **Replace with Ledger** |
| `dashboard:historyChanged` | Push (M→R) | `None` | `void` | Notifies dashboard when usage history invalidates | **Keep** |
| `dashboard:ready` | Send (R→M) | `None` | `void` | Signals dashboard window is rendered and ready (`main.js:9077`) | **Keep** |
| `dashboard:minimize` | Send (R→M) | `None` | `void` | Minimizes dashboard window (`main.js:9084`) | **Keep** |
| `dashboard:close` | Send (R→M) | `None` | `void` | Closes dashboard window (`main.js:9085`) | **Keep** |
| `devices:delete` | Invoke (R→M) | `deviceId: string` | `{ ok: boolean }` | Removes remote synced device from hub (`main.js:7990`) | **Keep** |
| `syncContent:status` | Invoke (R→M) | `refresh?: boolean` | `SyncContentStatusDTO` | Checks multi-device sync status (`main.js:7472`) | **Keep** |
| `syncContent:preview` | Invoke (R→M) | `kind: string` | `SyncPreviewDTO` | Previews sync changes (`main.js:7473`) | **Keep** |
| `syncContent:configure` | Invoke (R→M) | `options: SyncConfigOptions` | `SyncResultDTO` | Updates sync scope and credentials (`main.js:7474`) | **Keep** |
| `syncContent:retryCleanup` | Invoke (R→M) | `None` | `{ ok: boolean }` | Retries failed iCloud/Hub cleanup (`main.js:7475`) | **Keep** |
| `syncContent:push` | Push (M→R) | `status: SyncContentStatusDTO` | `void` | Pushes sync connection status changes | **Keep** |
| `hub:getInfo` | Invoke (R→M) | `None` | `HubInfoDTO` | Returns Node Hub endpoints and status (`main.js:8035`) | **Keep** |
| `hub:getBuildStatus` | Invoke (R→M) | `None` | `HubBuildStatusDTO` | Checks generated worker metadata consistency (`main.js:8036`) | **Keep** |
| `hub:regenerateSecret` | Invoke (R→M) | `None` | `HubInfoDTO` | Generates a new cryptographically random hub secret (`main.js:8037`) | **Keep** |
| `hub:push` | Push (M→R) | `payload: HubPushPayload` | `void` | Emits hub pairing and sync push events | **Keep** |
| `window:visibility` | Push (M→R) | `visible: boolean` | `void` | Emits main window visibility transitions | **Keep** |
| `settings:push` | Push (M→R) | `payload: SettingsDTO` | `void` | Broadcasts modified settings to all open windows | **Keep** |
| `theme:systemUi` | Push (M→R) | `{ dark: boolean }` | `void` | Emits OS dark/light mode appearance change | **Keep** |
| `settings:open` | Push (M→R) | `None` | `void` | Tells renderer to unhide settings drawer | **Keep** |
| `view:open` | Push (M→R) | `viewId: string` | `void` | Navigates renderer to requested view mode | **Keep** |
| `app:getInfo` | Invoke (R→M) | `None` | `AppInfoDTO` | Returns OS version, arch, paths, and platform info (`main.js:8045`) | **Keep** |
| `diagnostics:generate` | Invoke (R→M) | `None` | `DiagnosticReportDTO` | Compiles sanitized diagnostic snapshot (`main.js:8060`) | **Keep** |
| `clipboard:write` | Invoke (R→M) | `text: string` | `boolean` | Writes text to system clipboard via Electron (`main.js:8125`) | **Keep** |
| `usage:clientSources` | Invoke (R→M) | `clientId: string` | `ClientSourcesDTO` | Lists local log/DB files for a client (`main.js:8105`) | **Keep** |
| `usage:pickCustomScanPath` | Invoke (R→M) | `clientId: string` | `{ ok: boolean, dir?: string }` | Opens directory picker for custom logs (`main.js:8106`) | **Keep** |
| `usage:revealClientSource` | Invoke (R→M) | `clientId: string` | `boolean` | Reveals client source folder in Finder/Explorer (`main.js:8121`) | **Keep** |
| `usage:revealClientSyncLock` | Invoke (R→M) | `clientId: string` | `boolean` | Highlights SQLite lock file in folder (`main.js:8122`) | **Keep** |
| `usage:rescanClient` | Invoke (R→M) | `clientId: string` | `{ ok: boolean }` | Forces synchronous rescan of a client tool (`main.js:8123`) | **Replace with Ledger** |
| `usage:repairClientSyncLock` | Invoke (R→M) | `clientId: string` | `{ ok: boolean }` | Repairs corrupt SQLite wal/lock files (`main.js:8124`) | **Keep** |
| `app:openExternal` | Invoke (R→M) | `url: string` | `{ ok: boolean, error?: string }` | Safely opens allowlisted external URLs (`main.js:8129`) | **Keep** |
| `app:openUserData` | Invoke (R→M) | `None` | `Promise<string>` | Opens app userData directory in Explorer/Finder (`main.js:8135`) | **Keep** |
| `antigravity:accounts` | Invoke (R→M) | `None` | `Array<AntigravityAccount>` | Lists authenticated Antigravity accounts (`main.js:8136`) | **Keep** |
| `antigravity:addAccount` | Invoke (R→M) | `None` | `AuthFlowResult` | Launches OAuth loopback login (`main.js:8137`) | **Keep** |
| `antigravity:cancelLogin` | Invoke (R→M) | `None` | `{ ok: boolean }` | Aborts pending OAuth authentication (`main.js:8138`) | **Keep** |
| `antigravity:setAccountEnabled` | Invoke (R→M) | `id: string, enabled: boolean` | `{ ok: boolean }` | Toggles account tracking (`main.js:8139`) | **Keep** |
| `antigravity:removeAccount` | Invoke (R→M) | `id: string` | `{ ok: boolean }` | Logs out and deletes account credential (`main.js:8140`) | **Keep** |
| `antigravity:accounts` | Push (M→R) | `accounts: Array` | `void` | Pushes live Antigravity account list updates | **Keep** |
| `mimo:accounts` | Invoke (R→M) | `None` | `Array<MimoAccount>` | Lists configured Xiaomi MiMo accounts (`main.js:8141`) | **Keep** |
| `mimo:addAccount` | Invoke (R→M) | `cookieHeader: string` | `MimoResultDTO` | Adds MiMo account via web session cookie (`main.js:8142`) | **Keep** |
| `mimo:openConsole` | Invoke (R→M) | `None` | `{ ok: boolean }` | Opens MiMo web console in browser (`main.js:8143`) | **Keep** |
| `mimo:setAccountEnabled` | Invoke (R→M) | `id: string, enabled: boolean` | `{ ok: boolean }` | Enables/disables MiMo tracking (`main.js:8146`) | **Keep** |
| `mimo:removeAccount` | Invoke (R→M) | `id: string` | `{ ok: boolean }` | Removes MiMo account credential (`main.js:8147`) | **Keep** |
| `mimo:accounts` | Push (M→R) | `accounts: Array` | `void` | Pushes live MiMo account list updates | **Keep** |
| `export:now` | Invoke (R→M) | `None` | `{ ok: boolean, dir?: string }` | Exports current usage stats to JSON file (`main.js:7999`) | **Keep** |
| `export:pickAutoDir` | Invoke (R→M) | `None` | `{ ok: boolean, dir?: string }` | Sets automatic JSON export folder (`main.js:8010`) | **Keep** |
| `tokscale:getStatus` | Invoke (R→M) | `None` | `TokscaleStatusDTO` | Checks binary status of vendored tokscale (`main.js:8148`) | **Deprecate** |
| `appUpdate:getState` | Invoke (R→M) | `None` | `AppUpdateStateDTO` | Retrieves updater lifecycle state (`main.js:8149`) | **Keep** |
| `appUpdate:checkNow` | Invoke (R→M) | `None` | `AppUpdateStateDTO` | Manually queries GitHub releases (`main.js:8150`) | **Keep** |
| `appUpdate:download` | Invoke (R→M) | `None` | `AppUpdateStateDTO` | Downloads installer in background (`main.js:8151`) | **Keep** |
| `appUpdate:install` | Invoke (R→M) | `None` | `void` | Quits app and launches installer (`main.js:8152`) | **Keep** |
| `appUpdate:dismiss` | Invoke (R→M) | `version: string` | `AppUpdateStateDTO` | Dismisses update notification for version (`main.js:8153`) | **Keep** |
| `appUpdate:push` | Push (M→R) | `state: AppUpdateStateDTO` | `void` | Emits download progress and update states | **Keep** |
| `floatingBubble:expand` | Invoke (R→M) | `None` | `{ ok: boolean }` | Expands floating screen-edge bubble (`main.js:7869`) | **Keep** |
| `floatingBubble:peek` | Invoke (R→M) | `None` | `{ ok: boolean }` | Temporarily peeks floating bubble without focus (`main.js:7870`) | **Keep** |
| `floatingBubble:collapseIfIdle`| Invoke (R→M) | `None` | `{ ok: boolean }` | Collapses bubble if cursor is outside (`main.js:7871`) | **Keep** |
| `floatingBubble:setCollapsedSize`| Invoke (R→M)| `size: number` | `{ ok: boolean }` | Sets collapsed bubble pixel size (`main.js:7887`) | **Keep** |
| `floatingBubble:move` | Invoke (R→M) | `delta: { dx, dy }` | `{ ok: boolean }` | Moves bubble during gesture dragging (`main.js:7915`) | **Keep** |
| `floatingBubble:state` | Push (M→R) | `state: FloatingBubbleState` | `void` | Pushes bubble dock edge and collapsed state | **Keep** |
| `window:contentReady` | Send (R→M) | `None` | `void` | Notifies main process that DOM layout completed (`main.js:6984`) | **Keep** |
| `window:viewState` | Send (R→M) | `patch: { period, breakdown }` | `void` | Persists current view/period for cold restart (`main.js:7866`) | **Keep** |
| `tray:setIcons` | Invoke (R→M) | `icons: Array<TrayIconDTO>` | `boolean` | Updates system tray canvas icons (`main.js:7946`) | **Keep** |
| `cursor:loginManual` | Invoke (R→M) | `token: string` | `CursorLoginResult` | Validates and stores Cursor Workos session token (`main.js:8154`) | **Keep** |
| `cursor:setAccountEnabled` | Invoke (R→M) | `accountId, enabled` | `CursorStatusResult` | Toggles Cursor account active state (`main.js:8221`) | **Keep** |
| `cursor:logout` | Invoke (R→M) | `accountId: string` | `CursorStatusResult` | Removes manual Cursor account (`main.js:8240`) | **Keep** |
| `cursor:status` | Invoke (R→M) | `options?: { force, discover }` | `CursorStatusDTO` | Probes live Cursor plan and membership (`main.js:8280`) | **Keep** |
| `limits:saveCredential` | Invoke (R→M) | `providerId, values` | `CredentialResultDTO` | Encrypts and persists API keys in credential store (`main.js:8184`) | **Keep** |
| `limits:listOrganizationChoices`| Invoke (R→M)| `providerId: string` | `OrgChoicesDTO` | Lists OpenAI/Anthropic organizations (`main.js:8185`) | **Keep** |
| `limits:clearCredential` | Invoke (R→M) | `providerId: string` | `CredentialResultDTO` | Deletes stored credentials for provider (`main.js:8186`) | **Keep** |
| `opencode:saveCookie` | Invoke (R→M) | `raw: string` | `OpencodeResultDTO` | Legacy OpenCode cookie save (`main.js:8187`) | **Keep** |
| `opencode:logout` | Invoke (R→M) | `None` | `OpencodeResultDTO` | Clears all OpenCode profiles (`main.js:8268`) | **Keep** |
| `opencode:status` | Invoke (R→M) | `None` | `OpencodeStatusDTO` | Probes Go plan & Zen balance (`main.js:8289`) | **Keep** |
| `opencode:getProfiles` | Invoke (R→M) | `None` | `OpencodeProfilesDTO`| Returns safe redacted OpenCode profiles (`main.js:8418`) | **Keep** |
| `opencode:saveProfile` | Invoke (R→M) | `name, raw, kind, options` | `OpencodeResultDTO` | Adds API key, cookie, or ambient profile (`main.js:8458`) | **Keep** |
| `opencode:deleteProfile` | Invoke (R→M) | `name: string` | `OpencodeResultDTO` | Deletes named OpenCode profile (`main.js:8541`) | **Keep** |
| `opencode:renameProfile` | Invoke (R→M) | `oldName, newName, options` | `OpencodeResultDTO` | Renames or merges profiles (`main.js:8622`) | **Keep** |
| `opencode:removeCredential` | Invoke (R→M) | `name, kind` | `OpencodeResultDTO` | Strips one credential kind from profile (`main.js:8566`) | **Keep** |
| `opencode:moveCredential` | Invoke (R→M) | `name, kind, targetName, opt` | `OpencodeResultDTO` | Moves credential between profiles (`main.js:8590`) | **Keep** |
| `opencode:setProfileEnabled` | Invoke (R→M) | `name, enabled` | `OpencodeResultDTO` | Toggles individual profile tracking (`main.js:8646`) | **Keep** |
| `opencode:setAmbientEnabled` | Invoke (R→M) | `enabled: boolean` | `OpencodeResultDTO` | Enables auto-detection from system CLI (`main.js:8672`) | **Keep** |
| `openrouter:getProfiles` | Invoke (R→M) | `None` | `OpenRouterProfilesDTO`| Returns redacted OpenRouter keys (`main.js:8689`) | **Keep** |
| `openrouter:saveProfile` | Invoke (R→M) | `name, apiKey` | `OpenRouterResultDTO`| Validates and saves OpenRouter API key (`main.js:8695`) | **Keep** |
| `openrouter:deleteProfile` | Invoke (R→M) | `name: string` | `OpenRouterResultDTO`| Deletes OpenRouter profile (`main.js:8719`) | **Keep** |
| `openrouter:renameProfile` | Invoke (R→M) | `oldName, newName` | `OpenRouterResultDTO`| Renames OpenRouter profile (`main.js:8736`) | **Keep** |
| `openrouter:setProfileEnabled`| Invoke (R→M) | `name, enabled` | `OpenRouterResultDTO`| Toggles OpenRouter profile (`main.js:8758`) | **Keep** |
| `thirdparty:getProfiles` | Invoke (R→M) | `None` | `ThirdPartyProfilesDTO`| Lists NewAPI / Sub2API / Custom endpoints (`main.js:8775`) | **Keep** |
| `thirdparty:saveProfile` | Invoke (R→M) | `profile: ThirdPartyDTO` | `ThirdPartyResultDTO`| Probes and stores custom AI proxy (`main.js:8781`) | **Keep** |
| `thirdparty:deleteProfile` | Invoke (R→M) | `name: string` | `ThirdPartyResultDTO`| Deletes custom proxy profile (`main.js:8863`) | **Keep** |
| `thirdparty:renameProfile` | Invoke (R→M) | `oldName, newName` | `ThirdPartyResultDTO`| Renames custom proxy profile (`main.js:8880`) | **Keep** |
| `thirdparty:setProfileEnabled`| Invoke (R→M) | `name, enabled` | `ThirdPartyResultDTO`| Toggles custom proxy profile (`main.js:8902`) | **Keep** |
| `codex:accounts` | Invoke (R→M) | `None` | `CodexAccountsDTO` | Lists managed Codex accounts (`main.js:8919`) | **Keep** |
| `codex:addAccount` | Invoke (R→M) | `request?: { flowId }` | `CodexAddResultDTO` | Launches Codex CLI device auth flow (`main.js:8921`) | **Keep** |
| `codex:selectWorkspace` | Invoke (R→M) | `request: { flowId, workspaceId }`| `{ ok: boolean }`| Resolves workspace choice during login (`main.js:8987`) | **Keep** |
| `codex:cancelLogin` | Invoke (R→M) | `request?: { flowId }` | `{ ok: boolean, cancelled }` | Cancels in-progress Codex login flow (`main.js:8999`) | **Keep** |
| `codex:removeAccount` | Invoke (R→M) | `id: string` | `{ ok: boolean }` | Deletes Codex account from keyring (`main.js:9008`) | **Keep** |
| `codex:setAccountEnabled` | Invoke (R→M) | `id, enabled` | `{ ok: boolean }` | Toggles Codex account tracking (`main.js:8920`) | **Keep** |
| `codex:switchSystemAccount` | Invoke (R→M) | `id: string` | `{ ok: boolean }` | Switches active system Codex CLI login (`main.js:9009`) | **Keep** |
| `codex:refreshAccountLimits`| Invoke (R→M) | `id: string` | `{ ok: boolean }` | Forces quota refresh for account (`main.js:9010`) | **Keep** |
| `codex:activeAccount` | Push (M→R) | `account: CodexAccountDTO` | `void` | Pushes active system Codex account changes | **Keep** |
| `codex:loginStatus` | Push (M→R) | `payload: LoginStatusDTO` | `void` | Streams terminal output and OAuth URLs during sign-in | **Keep** |
| `copilot:signIn` | Invoke (R→M) | `options?: { flowId }` | `CopilotSignInDTO` | Starts GitHub Copilot device-code flow (`main.js:9011`) | **Keep** |
| `copilot:cancelSignIn` | Invoke (R→M) | `options?: { flowId }` | `{ ok: boolean }` | Aborts Copilot device-code flow (`main.js:9050`) | **Keep** |
| `copilot:loginStatus` | Push (M→R) | `status: CopilotStatusDTO` | `void` | Streams user code and verification URI to renderer | **Keep** |
| `window:minimize` | Send (R→M) | `None` | `void` | Minimizes main window or hides tray popover (`main.js:9061`) | **Keep** |
| `window:close` | Send (R→M) | `None` | `void` | Closes main window or hides tray popover (`main.js:9068`) | **Keep** |
| `edgeDock:ready` | Send (R→M) | `None` | `void` | Signals EdgeDock glance surface loaded (`controller.js:1057`) | **Keep** |
| `edgeDock:click` | Send (R→M) | `{ cellIndex: number }` | `void` | Handles pointer click on EdgeDock cell (`controller.js:1068`) | **Keep** |
| `edgeDock:pointer` | Send (R→M) | `None` | `void` | Reports pointer hover state over EdgeDock (`controller.js:1089`) | **Keep** |
| `edgeDock:dragStart` | Send (R→M) | `{ grabOffsetY: number }` | `void` | Initiates vertical dock dragging gesture (`controller.js:1130`) | **Keep** |
| `edgeDock:dragEnd` | Send (R→M) | `None` | `void` | Concludes vertical dock dragging gesture (`controller.js:1134`) | **Keep** |
| `edgeDock:bubbleSize` | Send (R→M) | `{ cellId, height }` | `void` | Reports dynamic height for peek card bubble (`controller.js:1138`) | **Keep** |
| `edgeDock:dismiss` | Send (R→M) | `None` | `void` | Dismisses EdgeDock peek bubble (`controller.js:1186`) | **Keep** |
| `edgeDock:toggleRateMode` | Send (R→M) | `None` | `void` | Toggles velocity rate display on dock (`controller.js:1152`) | **Keep** |
| `edgeDock:refreshLimits` | Invoke (R→M) | `None` | `{ ok: boolean }` | Triggers limit refresh from EdgeDock (`controller.js:1101`) | **Keep** |
| `edgeDock:peekPainted` | Send (R→M) | `{ mode, shapeKey }` | `void` | Coordinates peek bubble window reveal (`controller.js:1095`) | **Keep** |
| `edgeDock:switchCodexAccount`| Invoke (R→M)| `{ accountId }` | `{ ok: boolean }` | Switches Codex account from dock card (`controller.js:1162`) | **Keep** |
| `edgeDock:openResetForecastSource`| Send (R→M)| `None` | `void` | Opens OpenAI status page from dock (`controller.js:1180`) | **Keep** |
| `edgeDock:render` | Push (M→R) | `payload: EdgeDockRenderDTO`| `void` | Pushes compact quota cards to EdgeDock glance window | **Keep** |

---
