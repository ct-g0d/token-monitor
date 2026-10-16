# Token Monitor 代码库上手手册

> 面向:第一次接手本仓库的 AI 模型 / 工程师。目标:不读完整代码库,也能在 10 分钟内定位模块、安全地改代码。
> 基线:commit `478ec910`(2026-10-12),Windows + PowerShell。文中行号以基线为准,漂移后按符号名搜索。
> 建议阅读顺序:本页(速览 → 地图 → 数据流 → 流程 → tripwire)→ 目标章节(01–06)→ 需要深挖时读 `docs/architecture.md`。

## 30 秒速览

- 产品:常驻桌面小组件,实时显示本机多种 AI 编程工具(Claude Code、Codex、Cursor、DSH、Reasonix、Devin 等)的 token 用量、费用与订阅限额余额;可选多设备同步。
- 四个形态:① Electron Widget(主窗口 + Edge Dock 悬浮条)② headless Agent ③ Node Hub(默认端口 17321)④ Cloudflare Worker。前三者在本仓库,Worker 是独立部署单元。
- 用量真相源是 Rust 二进制 tokscale(vendored、平台锁定、SHA 校验);JS 侧只做调度、聚合与展示。
- 两条互相独立的循环:**用量采集**(collector tick)与**限额采集**(limits collector)。本地 token 用量永远不触发限额刷新(Tripwire 6)。

## 仓库地图

| 目录 | 是什么 |
|---|---|
| `src/shared/` | 采集、聚合、限额、wire 等跨形态共享的纯逻辑源头(Worker 用的是它的同步副本) |
| `src/electron/` | Electron 主进程(main.js 很大)、preload、渲染端(renderer/)、限额轮询桌面前端(limits/、providers/)、Edge Dock |
| `src/agent/` | headless 采集代理(collect → POST /api/ingest) |
| `src/hub/` | Node Hub 服务端(默认端口 17321) |
| `worker/` | Cloudflare Worker 多端同步(HubDO);独立部署单元,禁止向上 import |
| `scripts/` | 工具链:worker 同步、hub build marker、tokscale 下载校验等 |
| `tests/` | node:test 套件(`npm test`) |
| `docs/` | `architecture.md`(深水区)、`API.md`(wire + 端点)、`providers/README.md`、`frontend-code-map.md`(前端文件级地图)、本手册 |
| `assets/` `site/` `dist/` | 周边与产物,改代码时忽略 |

## 总数据流

```
各 AI 客户端日志(~/.claude、~/.codex、~/.cursor、DSH zstd 帧等)
   │
   ▼  tokscale(Rust 子进程,vendored,--json)
src/shared/collector.js 调度 tick
   │  全量:今日/月/全期【串行】;watch:仅 --today + 精确 delta
   ▼
src/shared/usage.js 聚合与分区维护(锚点、历史归档、agent.pid 写权让渡)
   ├─ Electron:src/shared/usage/usageHost.js + usageWorker.js(独立 Worker 线程)
   │     → src/electron/main.js → IPC/preload → 主窗口 + Edge Dock(rail/bubble/peek 三窗口)
   ├─ Agent:src/agent/runtime.js → POST /api/ingest(1 MiB 预算、超限 6 级削峰)
   │     → Hub(src/hub/server.js 或 worker/ HubDO)→ SSE / freshness 增量 → 其他设备
   └─ Limits 采集(独立循环,不被本地用量触发):src/shared/limits + src/electron/limits
         各 provider limits.js(惰性加载)→ 账号凭据(仅主进程)→ 限额卡片 / 余额(credits)
```

## 开发循环与运行环境(Windows)

- 前端零构建:渲染层是磁盘上的原生 HTML/CSS/JS,Electron 直接 `loadFile`,没有 Webpack/Vite/tsc。
- `npm start` = `ensure:tokscale`(vendored 时就地校验,离线秒过)后 `electron .`。
- 刷新矩阵:
  - 主窗口渲染层改动 → 聚焦主窗口按 `Ctrl+R`(Electron 默认菜单;`Ctrl+Shift+I` 开 DevTools)。
  - Edge Dock 渲染层改动 → Dock 窗口 `focusable:false` 收不到快捷键;在设置/托盘将 Edge Dock 关开一次,触发销毁重建。
  - 主进程代码及被主进程 require 的模块(如 `renderer/edgeDock/{presentation,items,shapes}.js`)→ 必须重启 `npm start`。
- 单实例锁:`main.js` 的 `requestSingleInstanceLock()`;开发版与已安装版共用 `%APPDATA%\Token Monitor`,开发版会被静默 `app.exit(0)`。开发前先托盘退出正式版。
- 本机环境(截至 2026-10-16):Electron 运行时已装(`node_modules/electron/dist`);koffi 原生绑定可 require(npm 11 allowScripts 门禁下的修法见 06 章);在注入 `ELECTRON_RUN_AS_NODE` 的终端里启动前先 `Remove-Item Env:ELECTRON_RUN_AS_NODE`。
- 验证入口:`npm run verify`(lint + node:test;Node ≥ 22.15,DSH 解码依赖内建 zstd)。

## 修改任务推荐流程

1. 用「仓库地图」+ 目标章节定位改动落点(文件 + 符号)。
2. 对照 Tripwire 与 `docs/architecture.md` 相应小节,确认不破坏契约。
3. 改代码,跑 `npm run verify`(或章节「验证方式」里的定向测试命令)。
4. 若动了 `src/shared/` 中 Worker 闭包或 Hub 核心:按 Tripwire 1/2 同步副本与 build marker。
5. 契约移动了就同步文档:`architecture.md` / `API.md` / `providers/README.md`。

## Tripwire 操作版(动 X → 必须 Y)

1. **Worker 闭包**:`worker/` 不能 import 上层;共享模块只改 `src/shared/`,再 `npm run sync:worker`;该闭包禁用 Node 内置模块;CI 查漂移。
2. **Hub build marker**:Hub/shared 最终改动后跑一次 `npm run update:hub-build`;`limits/providers.js` 属于 core 清单,增删改限额 provider 会移动 marker;勿手改生成物。
3. **tokscale 二进制**:只有 app / agent / 打包入口可跑 `ensure:tokscale`;install / hub / lint / test / verify 绝不下载。
4. **采集**:全量 tick 必须串行(并发曾致 CPU 飙至 500%);watch tick 只扫 `--today`,月/全期用精确 delta 推导(只追加日志下的代数恒等式,勿改估算);无冷却(re-arm 防抖);勿监听自同步 tokscale 缓存目录(会自触发死循环)。
5. **客户端 id 是分区键**:`normalizeClientName()` 固定点、别名 filter 收敛到父 id、绝不产出 `synthetic`(破坏 → 分区清空 / 负差额 / 退化为全量扫描)。
6. **Limits 刷新**:本地 token 用量永不触发限额刷新;`burn-rate` 不得进入 `COOLDOWN_BYPASS_REASONS`。
7. **Electron 出站**:用注入的 transport;Chromium 下不设 `Host` 头、`credentials:'omit'`、带路径的跨域 `Referer` 会被取消。
8. **凭据只留主进程**:渲染端默认拒绝 + 显式 allowlist;新固定凭据在 provider `account.js` 声明 `storePath`(`CREDENTIAL_SETTING_PATHS` 由此推导);不在 `credentialStore.js` 写字面量、不建 provider 专属 store;limits 侧 account 叶子保持 require-free;渲染端 DTO 只暴露显示/动作元数据。
9. **公共统计保持公共**:订阅版本戳只经 `statsWithSubscriptionVersion()` 走鉴权路径,勿并入 `getStats()`(`/api/public/stats` 未鉴权,会泄漏)。
10. **余额配额**:按 `windows[].metric === 'credits'` 走 `limits/balanceDisplay.js`,不要按 provider 白名单;display-only 百分比不进 wire。
11. **设置键**:新增/修改必须在 main.js 三处同步(`defaultSettings()` 默认 / `ensureSettingsLoaded()` 加载合并 / `applySettingsPatch()`(由 `settings:update` 调用) 清洗回推),漏一处会状态回弹或丢配置。
12. **前端共享模块**:`renderer/edgeDock/{presentation,items,shapes}.js` 被主进程直接 require;`src/electron/{windowShortcut,motionPreference}.js` 主进程 + 渲染端共用;保持环境无关(纯函数,平台差异由调用方注入),改完按「重启」验证。
13. **兼容面**:设置键、环境变量、CLI 参数、Hub 端点、wire 形状都有外部用户;改动按破坏性变更规划迁移。

## 先验文档索引

- `AGENTS.md` — 命令、tripwire、提交 / PR 约定(全项目入口)。
- `docs/architecture.md` — 边界、采集管道、Watching、Limits collector、出站 transport、设置与凭据、订阅、余额配额等权威文档。
- `docs/API.md` — device wire 形状与 Hub 端点。
- `docs/providers/README.md` — 客户端 / 限额 provider 注册清单与分区不变量。
- `docs/configuration.md` — 配置面:GUI 设置与 `.env` 环境变量的优先级与清单。
- `docs/frontend-code-map.md` — 前端(主窗口 + Edge Dock)文件级地图。
- 本手册 01–06 章 — 各子系统的模型视角走读;上述文档是规范,本文是导览。

## 章节导航

- [01 采集管道与 Agent](#01-采集管道与-agent)
- [02 Hub、Wire 协议与 Worker](#02-hubwire-协议与-worker)
- [03 追踪客户端 Provider](#03-追踪客户端-provider)
- [04 限额采集与账号/凭据](#04-限额采集与账号凭据)
- [05 Electron 窗口与前端](#05-electron-窗口与前端)
- [06 构建、开发循环、测试与发布](#06-构建开发循环测试与发布)

# 01 采集管道与 Agent

## 职责概览

面向第一次接触本仓库、准备修改用量采集管道或无头代理（Headless Agent）的模型：
- **采集管道 (`src/shared/usage/**`, `src/shared/collector.js`)**：仓库核心底座，负责调度下游定制二进制 `tokscale` 扫描本地各 AI 编程工具（Cursor、Claude Code、Codex、OpenCode、Antigravity、Mcode 等）的会话记录与 SQLite 数据库；在内存中构建 Today / Month / AllTime 用量时间窗；以非阻塞方式提取会话标题、项目归属与上下文缓存；并将数据增量归档入 SQLite 数据库，同时封装为规范的线协议记录（Wire Device Record）。
- **无头代理 (`src/agent/**`)**：面向无 GUI 宿主（Linux 服务器、SSH 开发机、WSL 环境、容器）的轻量采集程序。复用核心设备运行时与采集器，无 UI 渲染开销，采集后通过 HTTP POST 投递至 Hub（桌面内置 Node Hub、独立 Node Hub 或 Cloudflare Worker）。
- **双宿主执行差异**：
  - **Electron 桌面端**：采集器与用量转换默认运行在独立的 Worker 线程中（`src/shared/usage/usageHost.js` -> `usageWorker.js`），彻底将耗时的转录本同步读写与 SQLite 归档从主线程（驱动 UI 渲染和交互的主循环）剥离，防止用户操作出现几秒钟的界面掉帧/卡顿。
  - **Headless Agent 端**：作为独立 Node.js 进程，直接在进程内以单线程方式驱动采集器（`src/agent/runtime.js` 调用 `startCollector`），无 Worker 线程中转，依靠操作系统进程级调度保持最小内存占用。

## 入口与关键文件

| 文件 | 关键符号 | 作用 |
|---|---|---|
| `src/electron/main.js` | `createElectronUsageRuntime`(~L2791), `deviceRuntimeHandle` | Electron 端主接线：实例化 `createUsageHost`，并将其实例作为依赖注入 `createDeviceRuntime` |
| `src/shared/usage/deviceRuntime.js` | `createDeviceRuntime`, `reconfigureUsage`, `tick`, `reconfigureLimits` | 设备级总控门面：组装并协调 `UsageRuntime`、`LimitsRuntime` 与 `DeviceState`，对外暴露统一操作接口 |
| `src/shared/usage/deviceState.js` | `createDeviceState`, `updateUsage`, `updateLimits`, `onRecord` | 维护设备状态 epoch、用量与限额快照，将状态转换为 Wire Device Record (`syncPayload.js`) 并触发通知 |
| `src/shared/usage/usageHost.js` | `createUsageHost`, `createUsageHostCoordinator`, `fallBack` | 采集 Worker 宿主：主进程侧 IPC 协调器，负责向 Worker 派发调用、缓冲待决请求、同步设置及崩溃平滑降级 |
| `src/shared/usage/usageWorker.js` | `startCollector`, `transformed`, `call`, `stop` | Worker 线程入口：承载 Collector 实例、UsageTransform 与 SessionUsageArchiveStore，产出预转换摘要 |
| `src/shared/usage/usageTransform.js` | `createUsageTransform`, `transform` | 管道末端修饰：按设置过滤客户端/会话、覆盖价格、捕获会话转录本存入 SQLite 并计算项目级汇总 |
| `src/shared/usage/usageRuntime.js` | `createUsageRuntime` | 采集器轻量包装：直接调用 `startCollector(options)`，供进程内（Agent）环境直接使用 |
| `src/shared/usage/sessionUsageArchiveStore.js` | `createSessionUsageArchiveStore`, `capture` | 基于 `node:sqlite` 的持久化存储引擎，负责增量写入会话与轮次历史数据 |
| `src/shared/usage/sessionUsageArchive.js` | `applySessionUsageArchive`, `updateSessionUsageArchive` | 会话归档数据结构定义、表结构初始化与增量修饰计算 |
| `src/shared/usage/clientUsageArchive.js` | `pruneArchivedClientUsage` | 历史客户端日/月级别用量归档维护与过期数据修剪 |
| `src/shared/usage/agentPid.js` | `externalAgentActive` | Agent PID 互斥探测：检查外部 Agent 运行状态，驱动 Widget 让渡历史归档写锁 |
| `src/shared/collector.js` | `startCollector`, `collectUsageOnce`, `scheduleTick`, `runTokscale` | 核心采集引擎：编排自同步、调用 tokscale、文件监听与防抖、增量周期计算与 WSL 扫描 |
| `src/shared/usage.js` | `applyPeriodDelta`, `extractUsageBundleFromTokscale`, `mergePeriods` | 管道数据模型：解析 tokscale JSON、代数增量计算、周期合并与空模型定义 |
| `src/shared/selfSyncThrottle.js` | `createSelfSyncThrottle`, `minIntervalForTick` | 进程级自同步限流器：管理 Cursor / Antigravity 的闲时与事件驱动自同步频率 |
| `src/shared/wslUsage.js` | `collectWslUsage`, `listRunningWslDistros`, `isWslInstalled` | Windows 运行态 WSL 检测与只读扫描，排除不支持客户端并在 Watch Tick 间冻结快照 |
| `src/agent/agent.js` | `main`, `deliver`, `postUsage`, `registerPidFile` | Headless Agent CLI 入口：解析 `.env`/CLI 参数、注册 PID 文件、启动采集并投递 Hub |
| `src/agent/runtime.js` | `createAgentDeviceRuntime`, `runAgent`, `runAgentOnce` | Agent 运行时封装：创建有序 Sink，支持常驻模式与单次运行（`--once`）的 Promise 汇聚 |
| `src/agent/seedClients.js` | `seedAgentClients` | 替代 `settings.json` 的无头迁移标记器：在 `seeded-client-splits.json` 记录拆分迁移状态 |
| `src/agent/titleSync.js` | `createAgentTitleSync` | 多设备同步中会话标题隐私协商器：处理 Hub 许可与本地文件锁（`.locks`）|
| `scripts/ensure-vendored-tokscale.js` | `ensureVendoredTokscale`, `downloadAsset` | 离线安装保障：下载并校验 `scripts/vendor/tokscale.json` 锁定的下游构建二进制 |

## 数据流

```
[触发源: 启动 / 轮询定时器 / 文件监听防抖 / 用户手动刷新]
                   │
                   ▼ (Electron 跨线程调用 / Agent 进程内调用)
┌────────────────────────────────────────────────────────────────────────┐
│ src/shared/collector.js : collectUsageOnce()                           │
│                                                                        │
│ 1. 检查取消信号: throwIfAborted(options.signal)                         │
│ 2. 自同步前置: maybeSyncCursor / maybeSyncAntigravity                   │
│    └─ 受 src/shared/selfSyncThrottle.js 限流控制 (5min闲时 / 10s事件)   │
│ 3. 驱动 tokscale CLI (src/shared/collector.js : runTokscale):          │
│    ├─ 全量 Tick (首次/跨日/强制):                                      │
│    │    串行调用 3 次 tokscale CLI: --today, --month, --since allTime  │
│    └─ Watch Tick (监听触发且锚点有效):                                 │
│         仅调用 1 次 tokscale CLI: --today (带目标客户端过滤)           │
│ 4. 解析输出: parseJsonOutput() -> extractUsageBundleFromTokscale()     │
│ 5. 增量合成:                                                           │
│    ├─ Watch Tick: applyPeriodDelta() 基于锚点严格代数叠加              │
│    └─ Full Tick: 保存当前状态为 anchor (todayPartitions, today...)     │
│ 6. 本地转录本修饰: decorateLocalPeriods() 读本地目录提取会话标题与项目  │
│ 7. WSL 用量融合: Windows 下执行 collectWslUsage() (Watch Tick 复用快照)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ src/shared/usage/usageTransform.js : transform()                       │
│                                                                        │
│ 1. 过滤客户端及隐藏设置                                                │
│ 2. 写入持久化存储: sessionUsageArchiveStore.js (SQLite 归档)           │
│ 3. 计算项目汇总: applyProjectRollups()                                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼ (Electron: usageHost.js 接收 IPC)             ▼ (Agent: agent.js 接收)
┌───────────────────────────────────────┐   ┌────────────────────────────────────┐
│ src/shared/usage/deviceState.js       │   │ src/agent/titleSync.js             │
│ 1. 更新 Snapshot (usage, limits, rev) │   │ 1. 协商会话标题同步策略            │
│ 2. 生成 Wire Device Record 载荷       │   │ 2. syncPayload.js: postSyncPayload │
│ 3. 广播给 Electron 渲染进程窗口       │   └─────────────────┬──────────────────┘
└───────────────────────────────────────┘                     │ HTTP POST /api/ingest
                                                              ▼
                                            ┌────────────────────────────────────┐
                                            │ Node Hub / Cloudflare Worker Hub   │
                                            └────────────────────────────────────┘
```

## 关键机制

### 1. Electron 采集接线与一次 Tick 的完整执行全景
- **接线关系**：
  - `src/electron/main.js` L2791 实现 `createElectronUsageRuntime(options)`，内部调用 `createUsageHost(options, { agentPidPath, transformSettings })`。
  - 在 `main.js` L4332、L4414 等处，`createElectronUsageRuntime` 作为 `deps.createUsageRuntime` 注入 `createDeviceRuntime`。
  - `DeviceRuntime` 将统一的 `tick`、`refreshClient`、`stop` 委托给 `UsageHost`，`UsageHost` 通过 Worker IPC 发送至 `usageWorker.js` 线程中的 `startCollector` 实例。
- **一次完整 Tick 的执行链路**：
  1. **发起**：定时器到期（`intervalMs`）、文件监听防抖触发（`scheduleTick`）或渲染进程请求（`deviceRuntimeHandle.tick()`）。
  2. **Worker 派发**：`usageHost.js` 生成自增调用 `id`，将 `{ type: 'call', method: 'tick', args, id }` 发送给 Worker 线程。
  3. **自同步前置检查**：Worker 内 `collector.js` 执行 `collectUsageOnce`，首先检查 Cursor 与 Antigravity 的自同步状态，在节流窗口许可时生成转录本缓存。
  4. **派生扫描**：调用 `runTokscale` 执行下游二进制命令（参数见机制 8），完成 stdout 容错解析与结构化打包。
  5. **增量合成与转录本读取**：依据当前是否具备有效锚点，走全量扫描串行流程或 Watch Tick 增量流程；读取本地转录本补全会话标题、项目路径与上下文缓存。
  6. **数据变换与 SQLite 归档**：进入 `usageTransform.js`，应用过滤偏好，调用 `sessionUsageArchiveStore.js` 写入 SQLite，计算项目级汇总。
  7. **回传与更新**：Worker 线程向宿主线程 post `update` 消息；`UsageHost` 回调 `deviceRuntime.js:onUpdate`；`deviceState.js` 记录最新快照、自增 revision，并触发 `onRecord`；最终推送给渲染窗口及多设备同步模块。

### 2. 全量 Tick（串行）vs Watch Tick（精确 Delta 恒等式）
- **全量 Tick (`!anchorUsed`)**：
  - **触发条件**：进程初次启动、本地跨越午夜（`dateKey` 变更）、用户执行全量刷新、或配置项指纹变更（价格覆盖、追踪客户端变动等）。
  - **串行扫描实现**：`src/shared/collector.js` L1053-1080 依次 `await` 执行 3 次 tokscale：`--today`、`--month`、`--since <allTimeSince>`。
  - **禁止并行依据**：`collector.js` L1053 注释明确警告：并发执行 3 次扫描会使峰值 CPU 和磁盘 I/O 瞬间翻三倍，在会话库庞大时会使 tokscale CPU 飙至 500%（Issue #15 故障根因）。
- **Watch Tick (`anchorUsed`)**：
  - **触发条件**：本地日期与锚点匹配（`anchor.dateKey === localTodayKey`），且客户端分区满足可靶向更新条件。
  - **增量扫描实现**：仅执行 1 次带 `--today` 的 tokscale 扫描（若为特定文件变更，仅扫描受影响的 `targetClients` 分区）。
  - **精确 Delta 恒等式**：
    - `month = applyPeriodDelta(anchor.month, today, anchor.today)`
    - `allTime = applyPeriodDelta(anchor.allTime, today, anchor.today)`
  - **禁止变估计依据**：`src/shared/usage.js` L1901 及 `docs/architecture.md`：本地 AI 客户端的转录本日志是**只追加（append-only）**的。今天发生的新 Token，在数学上必然全量计入本月与全期；因此 `base + (freshToday - anchorToday)` 是严密的代数恒等式，绝不可为优化性能引入平滑估计或概率估算，否则会导致长周期账目漂移；日期翻转时锚点自动失效，由全量 Tick 纠偏。

### 3. 文件监听：Chokidar 进程隔离、Debounce 重武装与无冷却（No Cooldown）
- **子进程隔离架构 (`src/shared/watcherHost.js`)**：
  - Chokidar 文件监听器运行在独立的 Fork 子进程中，与主进程通过 IPC 通信。
  - **依据**：macOS 下每个监听文件占用独立描述符，极易打满 `OPEN_MAX` (10240) 导致后续进程派生抛出 `EBADF`（#520）；同时 Chokidar 同步 `close()` 会阻塞线程约 1 秒。子进程方案隔离了描述符与原生内存，退出时随 IPC 断开自动销毁。
- **Debounce 重武装（Re-arm）与上限保护**：
  - `src/shared/collector.js` L3270 `scheduleTick`：事件到达触发防抖定时器，默认延迟 `watchDebounceMs` (1500ms)。
  - 为防止持续写日志导致防抖永远被推迟（饥饿死锁），引入最大等待上限 `watchMaxWaitMs` (5000ms)，到达上限必须触发。
  - **重武装机制**：当防抖到期且此时有扫描正在进行（`tickInFlight`），代码**绝不**将任务压入队列立刻排队执行，而是再次调用 `scheduleTick(reason)` 重新武装计时器。
- **无额外冷却（No Cooldown）**：
  - `collector.js` L3291 明文规定：「There is deliberately no cooldown on top of the debounce」。产品对用户承诺 3~5 秒实时响应，若在防抖后叠加冷却期会破坏时效；重武装机制已天然避免背靠背连续死循环。

### 4. 自同步缓存目录剔除与 Issue #15 死循环规避
- **问题根源**：Cursor 和 Antigravity 的原始转录本不能被 tokscale 直接完整读取，需要本项目的 self-sync 模块（机制 5）读取原生日志并转换写出到 tokscale 专用的缓存目录中。
- **代码实现**：
  - `src/shared/collector.js` L1456 `watchClientRootsForClients`：遍历待监听路径时，对 `SELF_SYNCED_CLIENTS`（`cursor`、`antigravity`）执行过滤，**显式剔除其默认数据缓存目录**，仅保留用户显式指定的自定义扫描路径。
  - L1432 `selfSyncSourceRootsForClients`：转而将监听挂载在两者的**原生源文件目录**上（如 Cursor 的工作区状态 DB、Antigravity 的 conversations 目录）。
- **死循环规避**：若误监听了自同步缓存目录，自同步写缓存 -> 触发文件监听 -> 触发 Tick -> 执行自同步写缓存 -> 再次触发监听，形成灾难性的 CPU 100% 自触发死循环（Issue #15 self-trigger loop）。

### 5. Self-sync 机制与进程级节流阀（Cursor / Antigravity）
- **核心文件**：`src/shared/selfSyncThrottle.js`，与 `providers/cursor/selfSync.js`、`providers/antigravity/selfSync.js` 联动。
- **双重生命周期设计**：
  - 限流状态机（`throttle`）：作为进程级单例创建于 `collector.js` 模块顶层，确保因配置修改而重建 Collector 时，配额不会被重置刷新。
  - 事件排队队列（`sourceSyncQueue`）：归属于单个 Collector 实例，生命周期随 Collector 销毁而终结。
- **阶梯节流规则**：
  - **静默/闲时周期**：`SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000`（5 分钟），避免无变更时反复派生自同步子进程。
  - **源文件驱动周期**：原生目录发生变更后，允许执行间隔下调至短地板 `SYNC_SOURCE_EVENT_MIN_INTERVAL_MS = 10 * 1000`（10 秒），兼顾秒级响应与进程开销。

### 6. WSL 运行态只读探测与增量冻结
- **核心文件**：`src/shared/wslUsage.js`（仅 Windows 平台生效，跨平台 CI 通过依赖注入模拟）。
- **非侵入式探测**：
  - 必须首先通过 `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss` 检验注册表，若无该键直接退出，**绝不直接调用 `wsl.exe`**（避免未安装 WSL 时系统弹出交互式安装引导对话框）。
  - 执行 `wsl.exe --list --quiet --running` 列出当前处于**运行中**的发行版，严禁拉起处于停止状态的 WSL 实例。
- **路径与客户端过滤**：
  - 遍历 `\\wsl$\{distro}\home\{user}` 与 `\\wsl$\{distro}\root`，通过 `WSL_DATA_MARKERS` 判定客户端存在性。
  - `WSL_EXCLUDED_CLIENTS` 强制排除 `reasonix`、`catpaw`、`qodercn`（因 Windows 宿主路径与 Linux 内部路径冲突，或存在跨环境重复计算）。
- **增量冻结**：WSL 扫描开销极大，因此仅在全量 Tick 时串行扫描各发行版；在 Watch Tick 期间直接冻结并复用 `wslAnchor`，确保 Windows 侧本地 Delta 恒等式不受网络路径波动干扰。

### 7. Usage Worker 线程协议、生命周期与崩溃优雅降级
- **架构职责 (`src/shared/usage/usageHost.js` & `usageWorker.js`)**：
  - Worker 线程承载整个 `collector.js`、`usageTransform.js` 以及 `sessionUsageArchiveStore.js`。主线程向其同步配置，Worker 处理完后回传预转换好的快照，主线程不再执行任何重计算。
- **通信协议**：
  - `Host -> Worker`: `call`（派发 `tick`、`refreshClient`、`whenIdle`）、`transformSettings`（应用动态设置变更）、`stop`。
  - `Worker -> Host`: `update`（完整用量变更）、`preview`、`activity`、`diagnostic`、`result`、`transformSettingsApplied`、`stopped`。
- **子进程追踪与停机保护**：
  - Worker 派生的所有子进程注册在与主线程共享的 `liveSubprocesses` 表中（`src/shared/subprocessTermination.js`）。主进程退出或强制终止时，`terminateUsageHostSubprocesses` 能立即向未退出的 tokscale 发送 `SIGTERM`。
  - 停机宽限期设为 5000ms（`STOP_GRACE_MS`），超时未确认直接调用 `worker.terminate()`。
- **崩溃平滑降级（Graceful Fallback）**：
  - 若 Worker 触发 `error` 或非预期退出，宿主发射 `usage-worker-failed` 诊断，标记 `workerDisabled = true`；
  - 自动回退至当前主线程就地调用 `startInProcess(options)`，并将 `pending` 中未完成的调用全量重放；该进程后续所有周期均保持主线程进程内采集。可通过环境变量 `TOKEN_MONITOR_USAGE_WORKER=0` 强制全局禁用 Worker。

### 8. Headless Agent：代码复用、Hub 投递流程与特有组件
- **核心复用**：Agent 与 Widget 100% 共享底层的 `deviceRuntime.js`、`deviceState.js`、`collector.js`、`sessionUsageArchiveStore.js` 以及 `limits/` 配额体系。
- **执行差异**：
  - Agent 不启动 Worker 线程，直接在主流程调用 `runtime.js:createAgentDeviceRuntime`；
  - 禁用活动轮询（`sessionActivityPolling: false`），由 `createOrderedSink` 托管投递队列。
- **PID 竞争协调 (`src/shared/usage/agentPid.js`)**：
  - Agent 启动时在数据目录登记 `agent.pid`。
  - Widget 在启动或运行中通过 `externalAgentActive(AGENT_PID_PATH)` 探测外部 Agent；若探测到存活的外部 Agent，Widget 自动关闭自身的历史归档写入权（`dailyHistoryArchiveWriteEnabled: () => !isExternalAgentActive()`），彻底消除多实例并发写入 SQLite 的死锁风险。
- **特有组件**：
  - `src/agent/seedClients.js`：由于无 GUI 配置文件 `settings.json`，命令行传入的 `--clients` 每次启动都是独立的声明；该模块通过持久化 `seeded-client-splits.json` 记录历史拆分迁移，防止迁移逻辑反复覆盖操作员特意剔除的客户端。
  - `src/agent/titleSync.js`：会话标题属敏感信息，该模块向 Hub 协商 `syncSessionTitles` 权限，并在本地使用独占文件锁（`agent-sync-credentials.json.locks`）保证多实例环境凭据安全。
- **CLI 运行场景**：
  - `npm run agent`：常驻运行，包含文件监听与定时全量 rescan，自动 POST 到 Hub。
  - `npm run agent:once -- --dry-run`：单次采集预览，不写 PID、不写 SQLite 归档、不请求 Hub，直接格式化打印采集结果至 stdout。

### 9. tokscale CLI 调用契约与 ensure-vendored-tokscale.js
- **CLI 调用参数组合**：
  - 由 `src/shared/collector.js:runTokscale` 统一拼装：
    `['--json', '--client', clientFilter, '--group-by', grouping, ...flags]`
  - `grouping`：默认采用 `client,workspace,session,model`；若被当前二进制报错拒绝，自动回退到 `client,session,model` 并记录在能力缓存中。
  - `flags`：携带 `--today`、`--month`、`--since <date>` 以及 WSL 扫描时专用的 `--home <wslPath>`。
- **JSON 健壮性解析**：
  - `src/shared/collector.js:parseJsonOutput` 负责第一道防线：优先 `JSON.parse`；若失败（如第三方日志混入 stdout），自动向后扫描首个 `{` 或 `[` 截断重试。
  - `src/shared/usage.js` 负责第二道防线：深度遍历 JSON 结构树，对字段缺失、意外 null 赋予防御性默认值。
- **ensure-vendored-tokscale.js 一句话**：确保从 `scripts/vendor/tokscale.json` 下载平台锁定的 downstream tokscale 二进制包并校验 SHA-256 及版本冒烟，与 npm install/test 完全解耦以保持离线。

## 修改场景速查

| 我想改… | 主要动这些文件 | 联动/注意事项 |
|---|---|---|
| 新增或调整被监控客户端的源目录与监听策略 | `src/shared/collector.js`<br>`src/shared/clientSources.js` | 若属于自同步客户端，必须加入 `SELF_SYNCED_CLIENTS` 并在 `watchClientRootsForClients` 中剔除生成缓存目录，防止自触发死循环 |
| 调整采集防抖或轮询节奏 | `src/shared/collector.js` (`scheduleTick`)<br>`src/shared/config.js` | 严禁增加 cooldown；修改 `watchDebounceMs` 时必须注意与 `watchMaxWaitMs` 的极值限制 |
| 修改会话元数据（标题/项目/缓存状态）推导 | `src/shared/collector.js` (`decorateLocalPeriods`)<br>`src/shared/localSessions.js` | 必须保证在 Watch Tick 中只修饰 Today，历史会话仅传递已解析属性，避免重复读取巨量转录本引起界面掉帧 |
| 调整会话归档持久化结构或字段 | `src/shared/usage/sessionUsageArchive*.js`<br>`src/shared/usage/usageTransform.js` | Worker 线程持有 SQLite 句柄，注意表结构版本兼容；且 Agent dry-run 下严禁落盘 |
| 调整 WSL 采集范围或过滤项 | `src/shared/wslUsage.js` | 注意检查 `WSL_EXCLUDED_CLIENTS`；严禁在 Watch Tick 中解冻 WSL 重新扫描 |
| 调整 Headless Agent 投递载荷或协议头 | `src/agent/agent.js`<br>`src/shared/syncPayload.js` | 必须保持与 Cloudflare Worker (`worker/src/index.js`) 协议一致，检查 `HUB_RESPONSE_HEADER` 与最小化响应要求 |
| 升级 downstream tokscale 二进制依赖 | `scripts/vendor/tokscale.json`<br>`scripts/ensure-vendored-tokscale.js` | 更新 manifest 的 releaseTag 与 sha256；不得将下载逻辑写入 package.json 的 postinstall 等默认生命周期 |

## 陷阱

1. **并发扫描拖垮 CPU**：全量 Tick 必须保证 `--today`、`--month`、`--since` 串行执行，严禁改用 `Promise.all` 并发，否则会导致 CPU/IO 峰值暴涨（Issue #15 故障）。
2. **Delta 篡改为估算**：`applyPeriodDelta` 是基于会话日志只追加特性的严格代数恒等式，严禁引入基于时间推算的平滑或概率估算。
3. **监听防抖乱加冷却**：严禁在防抖之上堆叠冷却时间（cooldown），遇正在执行中的扫描必须通过 `scheduleTick` 进行重武装（re-arm）。
4. **监听自同步生成缓存**：绝不能把 Cursor 或 Antigravity 的 tokscale 缓存生成目录放进 Watcher 监听路径，否则自同步写缓存必定触发无限自调用死循环。
5. **盲目调用 wsl.exe**：Windows 环境下探测 WSL 必须先查注册表 `Lxss` 键，未安装时直接调用 `wsl.exe` 会弹出 Windows 提示安装弹窗阻断自动化。
6. **Worker 跨线程传递不可克隆对象**：`usageHost.js` 向 `usageWorker.js` 传递参数时只支持结构化克隆数据，函数型配置（如归档让渡闭包）必须通过标记或 PID 路径在 Worker 内重建。
7. **Agent 试跑污染持久化状态**：Agent 在 `--dry-run` 模式下严禁写入 `agent.pid`、严禁写入 `seeded-client-splits.json`、严禁连接真实 SQLite 归档库。

## 验证方式

1. **静态代码风格校验**：
   ```bash
   npm run lint
   ```
2. **采集器核心与增量计算单测**：
   ```bash
   node --test "tests/shared/collector*.test.js"
   node --test "tests/shared/usage*.test.js"
   ```
3. **Agent 离线试跑验证**：
   ```bash
   # 验证 dry-run 输出合法 JSON 结构且不产生磁盘与网络副作用
   npm run agent:once -- --dry-run
   ```
4. **Worker 降级路径验证**：
   ```bash
   # 强制关闭 worker 验证主线程采集回退机制
   TOKEN_MONITOR_USAGE_WORKER=0 npm start
   ```

# 02 Hub、Wire 协议与 Worker

## 职责概览

面向第一次接触本仓库、准备修改集中聚合 Hub、Cloudflare Worker 或线上同步协议的模型：
- **Node Hub (`src/hub/server.js`)**：基于 Node.js 原生 `node:http` 实现的轻量级多设备状态聚合服务。负责接收多端上报（ingest），在内存维护设备与订阅状态，原子持久化至本地 JSON 文件（默认 `data/devices.json` 或 `userData/hub-devices.json`），并通过 Server-Sent Events (SSE) 向订阅客户端广播实时统计。
- **Cloudflare Worker Hub (`worker/`)**：运行在 Cloudflare 边缘的无服务器 Hub 实例。基于 Durable Objects (`HubDO`，采用 SQLite 存储引擎)，对外提供与 Node Hub 几乎完全一致的 REST 和 SSE 端点，并可选开放经严格脱敏的公共展示统计站 (`/api/public/stats`)。
- **Wire 协议 (`src/shared/hubProtocol.js`, `src/shared/syncPayload.js`, `src/shared/usage.js`)**：定义 Agent/Widget 与 Hub 之间的通信规约。包括统一设备记录格式（Wire Device Record）、1 MiB 载荷预算下的自适应字段裁剪、基于协商的 Freshness 增量 SSE 广播、以及基于版本控制的 CAS 共享订阅与配置同步。
- **端形态与拓扑差异**：Widget 桌面端可作为独立采集器（`hubMode='local'`）、连接外部 Hub 的客户端（`hubMode='client'`）或内嵌 Hub 宿主（`hubMode='host'`）；Headless Agent 则专注于无人值守的后台采集并向指定 Hub POST 上报。

## 入口与关键文件

| 文件 | 关键符号 | 作用 |
|---|---|---|
| `src/hub/server.js` | `createHub`, `handleRequest`, `ingest`, `broadcastStats` | Node Hub 实现：原生 HTTP 路由分发、SSE 客户端管理与原子持久化 |
| `worker/src/index.js` | `HubDO`, `fetch`, `statsWithSubscriptionVersion` | Worker Hub 实现：Durable Object 状态机、SQLite 存储及公私统计路由分流 |
| `worker/wrangler.toml` | `[durable_objects]`, `[vars]` | Worker 配置文件：定义 `HubDO` 绑定、SQLite 迁移标记与环境常量 |
| `worker/src/shared/` | `@generated` 文件副本 | `npm run sync:worker` 自动从 `src/shared/` 同步的依赖闭包，保证 Worker 完全自闭合 |
| `src/shared/hubProtocol.js` | `hubStatsContentKey`, `freshnessEvent`, `HUB_STREAM_VERSION` | Wire 协议常量、SSE 载荷压缩检测与轻量 Freshness 增量事件判定 |
| `src/shared/syncPayload.js` | `serializeSyncPayload`, `buildSyncPayload`, `postSyncPayload` | 上报载荷自适应裁剪与尺寸预算（< 1 MiB）熔断控制 |
| `src/shared/usage.js` | `normalizeDeviceRecord`, `mergeSyncDeviceRecord` | 设备上报记录规范化、向前兼容清洗、标题脱敏与多设备历史聚合 |
| `src/shared/subscriptionDisplay.js` | `subscriptionDocument`, `isStaleSubscriptionWrite` | 跨设备共享订阅文档结构、货币校验与乐观并发锁（CAS）版本对比 |
| `src/shared/syncContent.js` | `syncContentCapability`, `nextTitlePolicy` | 共享配置（模型别名、自定义定价）及设备会话标题同步策略协商门禁 |
| `src/shared/hubBuildIdentity.js` | `currentHubBuild`, `buildRegistry` | 运行时版本构建标识生成与注册表绑定 |
| `src/shared/hubBuildComparison.js` | `compareHubBuild` | 客户端探活与 Hub 版本兼容性评估（current/updateAvailable/remoteNewer/legacy） |
| `scripts/hub-build-manifest.js` | `WORKER_SHARED_MODULES`, `currentHubSourceBuildIds` | Hub 核心与 Worker 闭包清单定义及源码 SHA-256 哈希计算 |
| `scripts/update-hub-build.js` | `updatedRegistry` | 自动化增量更新 `hubBuildRegistry.json` 版本标记 |
| `scripts/sync-worker-shared.js` | `syncWorkerShared` | 将 Hub 核心代码闭包复制同步至 `worker/src/shared/` |
| `src/electron/main.js` | `effectiveHubConfig`, `startMode`, `startEmbeddedHub`, `postToHub` | Widget 模式切换、内置 Hub 编排与同步/流式长连接维护 |
| `src/agent/agent.js` | `postUsage`, `deliver`, `titleSyncNegotiator` | Headless Agent 上报主流程、标题同步协商与 Secret 鉴权注入 |

## 数据流

```
[Agent 独立进程]                      [Widget 桌面端 (Client 模式)]
(src/agent/agent.js)                   (src/electron/main.js)
        │                                     │
        │ postUsage()                         │ postToHub()
        ▼                                     ▼
(src/shared/syncPayload.js)           (src/shared/syncPayload.js)
  - 1 MiB 尺寸预算阶梯削峰               - 1 MiB 尺寸预算阶梯削峰
  - 标题脱敏 & 会话过滤                  - 标题脱敏 & 会话过滤
        │                                     │
        │ HTTP POST /api/ingest               │ HTTP POST /api/ingest
        │ Header: Authorization: Bearer       │ Header: Authorization: Bearer
        │ Header: x-token-monitor-response    │ Header: x-token-monitor-response
        └─────────────────┬───────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ Hub 接收端 (Node Hub: src/hub/server.js / Worker: worker/src/index.js) │
│                                                                 │
│ 1. 鉴权校验: isAuthorized(req, secret)                           │
│ 2. 规范化: normalizeDeviceRecord() (src/shared/usage.js)        │
│ 3. 标题门禁: mergeSyncDeviceRecord() 校验 sessionTitleSyncGen    │
│ 4. 原子持久化:                                                  │
│    - Node Hub: writePrivateJsonAtomic -> devices.json           │
│    - Worker: this.state.storage.put('dev:*') (SQLite DO)        │
│ 5. 多设备聚合: aggregateDevices() 刷新全局用量与额度状态          │
│ 6. 广播评估: hubStatsContentKey() 计算指纹对比                   │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                   SSE 广播 (/api/stats/stream)
     ┌────────────────────────────┴─────────────────────────────┐
     ▼ (全量统计快照 stats)                                      ▼ (仅时间戳变动 freshness)
[Widget: main.js -> startStatsStream()]           [Widget: main.js -> startStatsStream()]
  - parseSseBlock()                                 - applyFreshnessEvent()
  - composeLocalSyncSummary()                       - 更新本地时效缓存
  - sendPush() -> 渲染层 UI                         - sendPush() -> 渲染层 UI
```

## 关键机制

### 1. HTTP 端点总表与鉴权矩阵 (`src/hub/server.js`)

Node Hub 基于原生 `node:http` 构建，统一通过 `handleRequest(req, res)` 进行路由分发。除健康检查外，所有数据端点均通过 `isAuthorized(req, secret)` 统一拦截（详细请求体与响应字段参见 `docs/API.md`）：

| 方法 | 路径 | 鉴权要求 | 一句话作用 | 状态码与异常 |
|---|---|---|---|---|
| `OPTIONS` | `*` | 免鉴权 | CORS 跨域预检响应 | 204 No Content |
| `GET` | `/api/health` | **免鉴权** | 探活与状态探测：返回 runtime、hubBuild、设备数及 secretRequired 标记 | 200 OK |
| `GET` | `/api/sync/content` | **需鉴权** | 能力协商：返回 Hub 支持的特性（会话标题同步开关、共享配置项能力） | 200 OK, 401 |
| `GET` | `/api/sync/settings/:kind` | **需鉴权** | 获取共享设置（`modelAliases` 或 `customPricing`）的当前版本与内容 | 200 OK, 401 |
| `PUT` | `/api/sync/settings/:kind` | **需鉴权** | CAS 更新共享设置，带基线 `baseRevision` | 200 OK, 400, 401, 409 `stale_write` |
| `PUT` | `/api/sync/titles/:deviceId` | **需鉴权** | 设备向 Hub 声明开启或关闭会话标题同步策略 (`{ enabled: boolean }`) | 200 OK, 400, 401 |
| `GET` | `/api/stats` | **需鉴权** | 获取全量多设备聚合统计（包含 today/month/allTime、limits、historyPreview） | 200 OK, 401 |
| `GET` | `/api/devices` | **需鉴权** | 获取当前 Hub 记录的全部单设备原始数据数组 | 200 OK, 401 |
| `GET` | `/api/history` | **需鉴权** | 获取多设备聚合的长期历史每日与每月用量趋势 | 200 OK, 401 |
| `GET` | `/api/stats/stream` | **需鉴权** | 建立 SSE 长连接，按需下发 `snapshot`、`stats` 或 `freshness` 事件及心跳 | 200 text/event-stream, 401 |
| `POST` | `/api/ingest` | **需鉴权** | 设备上报数据入口。支持 `x-token-monitor-response: minimal` 减少下行流量 | 200 OK, 400, 401, 413 |
| `GET` | `/api/subscriptions` | **需鉴权** | 读取跨设备共享订阅文档 (`{ ok, version, updatedAt, subscriptions }`) | 200 OK, 401 |
| `PUT` | `/api/subscriptions` | **需鉴权** | CAS 更新订阅列表，基于 `baseUpdatedAt` 乐观锁防多端覆写冲突 | 200 OK, 400, 401, 409 `stale_write` |
| `DELETE` | `/api/devices/:id` | **需鉴权** | 显式注销并删除指定设备记录，同步清理其标题同步策略墓碑 | 200 OK, 401 |

**鉴权实现细节 (`src/shared/http.js`)**：
- 请求头提取：检查 `authorization: Bearer <secret>` 或 `x-token-monitor-secret: <secret>`。
- Node Hub **绝对禁止 URL Query 传递秘钥**。若服务端未配置 Secret，Hub 启动时通过 `resolveBindHost()` 强制绑定 `127.0.0.1` 本地回环，并在日志输出安全警告。

### 2. Widget 的 `hubMode` 接线差异与凭证来源 (`src/electron/main.js`)

Widget 桌面端通过 `settings.hubMode` 支持四种拓扑模式，由 `startMode()` 负责互斥编排与生命周期销毁：

| 维度 | `local` (单机模式) | `client` (外部 Hub) | `host` (嵌入式 Hub) | `icloud` (macOS 专属) |
|---|---|---|---|---|
| **启动采集器** | `startLocalCollector()` | `startSyncCollector()` | `startHostCollector()` | `startIcloudCollector()` |
| **数据输出目标 (Sink)** | 直接推送本地渲染层与托盘 | `postToHub()` HTTP POST | 进程内调用 `embeddedHub.hub.ingest()` | 文件系统写入 iCloud Drive |
| **统计数据来源** | `composeLocalOnlySummary()` | SSE `/api/stats/stream` + 本地即时合成 | 挂接 `embeddedHub.hub.onStats()` | iCloud 状态机多设备对账 |
| **网络传输特性** | 无网络连接 | 远端 HTTP/SSE 长连接 | **纯进程内内存调用，不走网络** | 本地文件系统原子读写 |
| **订阅数据归属** | 本地 `settings.subscriptions` | 远端 Hub CAS 共享同步 | 内置 Hub CAS 共享同步 | iCloud 版本账本同步 |

**凭据与环境变量来源**：
- 默认配置源自 `defaultSettings()`：
  - `hubMode`：若环境变量 `TOKEN_MONITOR_HUB_URL` 存在且非空则默认为 `'client'`，否则默认为 `'local'`。
  - `hubHostPort`：读取环境变量 `TOKEN_MONITOR_PORT`，校验有效端口范围 `1..65535`，缺省为 `17321`。
  - `hubHostSecret` / `secret`：读取环境变量 `TOKEN_MONITOR_SECRET`。
- **自动秘钥生成**：若用户在 UI 中切换到 `host` 模式而 `settings.hubHostSecret` 为空，`startEmbeddedHub()` 会调用 `generateHubSecret()`（`crypto.randomBytes(32).toString('hex')`）自动生成并持久化秘钥。
- **配置求值 `effectiveHubConfig(settings)`**：
  - 当 `hubMode === 'host'` 时，返回 `{ url: 'http://127.0.0.1:${port}', secret: hubHostSecret }`；
  - 当 `hubMode === 'client'` 时，返回 `{ url: settings.hubUrl, secret: settings.secret }`；
  - 其他模式返回 `{ url: null, secret: '' }`。
- **Host 模式免回环接线**：`startHostCollector()` 的 sink 直接调用 `embeddedHub.hub.ingest(payload)`，`startHostStats()` 直接挂接 `embeddedHub.hub.onStats((stats) => emit(stats))`。此设计极其关键：彻底避开了本地代理（VPN）、防火墙或 Loopback 路由干扰导致 Widget 自身数据丢失的隐患。

### 3. Agent 到 Hub 的投递与认证协议 (`src/agent/agent.js`)

1. **投递主流程**：
   - **进程级互斥声明**：进程启动时调用 `registerPidFile()` 注册 PID 文件（`agentPid.js`），在同机运行 Widget 时通知其让渡归档写入权。
   - **本地扫描与归档**：采集器通过 `runAgent`（定时轮询）或 `runAgentOnce`（单次）采集多客户端用量与限额，并通过 `summaryWithSessionUsageArchive` 补充本地 SQLite 归档与项目汇总。
   - **标题同步协商**：若启用了 `syncSessionTitles`，通过 `titleSyncNegotiator.negotiate()` 探测 Hub 能力并更新 `/api/sync/titles/:deviceId`。
   - **载荷构造与自适应削峰**：调用 `postSyncPayload()` 对记录执行标题脱敏、Reasonix 合成会话剔除，并在 1 MiB 载荷预算限制下执行阶梯削峰。
   - **HTTP 发送**：发起 HTTP POST 到 `${hubUrl}/api/ingest`，携带头 `x-token-monitor-response: minimal`，声明不需要 Hub 回传完整统计以节省下行流量。
2. **认证与秘钥交换机制**：
   - Agent 从 `--secret` 参数或 `process.env.TOKEN_MONITOR_SECRET` 提取秘钥。
   - 发送标准请求头：`Authorization: Bearer <secret>`。
   - **Node Hub 验证逻辑 (`src/shared/http.js`)**：
     - 校验请求头 `authorization` 或 `x-token-monitor-secret`；
     - 严禁 URL Query 传参；若服务端未配置 Secret，仅允许回环请求通过。
   - **Worker Hub 验证逻辑 (`worker/src/index.js`)**：
     - 使用 `crypto.subtle.digest('SHA-256')` 对比秘钥哈希，通过恒定时间异或循环 `timingSafeEqualText` 杜绝时序攻击；
     - 仅对 iOS 小组件等受限客户端保留兼容用的 `?secret=` 降级。

### 4. 订阅机制与公私统计隔离防线 (`worker/src/index.js`)

1. **跨设备共享订阅（CAS 乐观并发控制）**：
   - 订阅记录包含用户填写的账单周期、月付/年付金额与币种，是极其敏感的资产数据。
   - `PUT /api/subscriptions` 必须携带 `baseUpdatedAt`。
   - 服务端先校验当前 `store.subscriptions.updatedAt === baseUpdatedAt`。若不一致，立即拒绝并抛出 409 `stale_write`，并在响应中回传当前最新文档供客户端 rebase，杜绝并发覆盖。
   - 数据写入前通过 `CURRENCY_CODES` 严格校验货币类型，防止非标准币种被强制转换为 USD 导致金额失真。
2. **`statsWithSubscriptionVersion()` 为什么必须仅挂在认证路由（AGENTS.md tripwire）**：
   - **设计定位**：客户端只需感知订阅是否有变动（`subscriptionsUpdatedAt` 时间戳），仅在时间戳落后时才发起单独的 `/api/subscriptions` 请求拉取完整明细，避免高频轮询浪费流量或每帧传递隐私开销。
   - **防线机制**：
     - Cloudflare Worker 拥有唯一的无鉴权公共路由 `/api/public/stats`（供公共看板或 Badge 使用）。
     - 代码中 `/api/public/stats` 的实现方式为 `const stats = await this.getStats(); return jsonResponse(200, { ...stats, ... });`。
     - 若将 `subscriptionsUpdatedAt` 或 `syncSettingsRevisions` 并入 `getStats()`，则未鉴权的公共端点将直接对外泄露用户是否存在订阅、订阅更新时机以及私有配置版本！
     - 因此，`statsWithSubscriptionVersion()`（定位：`worker/src/index.js` L259）作为装饰函数，**只挂在受鉴权保护的私有路由上**（`/api/stats`、SSE `snapshot/broadcast` 以及 `/api/ingest` 的响应），公有路由天然不碰订阅字段。

### 5. Worker 架构、隔离规则与闭包复制

1. **Wrangler 配置与职责 (`worker/wrangler.toml`, `worker/src/index.js`)**：
   - 配置 `main = "src/index.js"`, `name = "token-monitor-hub"`。
   - 声明 Durable Object `HubDO` 并绑定 SQLite 后端（`new_sqlite_classes = ["HubDO"]`），在边缘提供强一致性并发写事务（`mutate` / `withStorageTransaction`）。
   - **存储键规划**：
     - `dev:${deviceId}`：单设备上报记录 JSON；
     - `hub:subscriptions`：共享订阅文档 JSON；
     - `hub:settings:${kind}`：共享设置分组 JSON；
     - `hub:title-policy:${deviceId}`：设备会话标题同步策略标记。
   - **职责定位**：作为公网边缘中心 Hub，承载跨网络设备的用量收集、多设备状态汇聚、实时 SSE 广播分发，以及可选的公共脱敏统计看板。**它不负责客户端版本更新检查**（更新检查由客户端探测 GitHub Release 和构建注册表处理）。
2. **`@generated` worker/src/shared 副本**：
   - Cloudflare 官方的 "Deploy to Cloudflare" 一键部署按钮会将 `worker/` 目录隔离为独立无父级的临时仓库。
   - **隔离铁律**：Worker 源码**绝对禁止 `import` 上层目录**（如 `../../src/shared` 会导致部署构建彻底失败），且运行在 V8 Isolate 中，**无法使用 Node 原生内置模块**（如 `node:fs`、`node:child_process`、`node:crypto` 的特定私有 API）。
   - 唯一真理源是根目录 `src/shared/`，通过 `npm run sync:worker`（执行 `scripts/sync-worker-shared.js`）自动提取闭包并注入头部注释写入 `worker/src/shared/`。
3. **`WORKER_SHARED_MODULES` 闭包清单 (`scripts/hub-build-manifest.js`)**：
   - `limits/providers.js`: Limit Provider 列表与元数据定义
   - `limits/core.js`: 限额数据归一化、过期剔除与聚合逻辑
   - `usage.js`: 设备用量记录归一化、增量应用与历史聚合核心
   - `sessionLive.js`: 实时活跃会话状态评估与超时判断
   - `sessionActivityProviders.js`: 会话活跃度计算适配器
   - `history.js`: 每日/每月用量趋势历史合并与版本指纹
   - `providers/reasonix/paths.js`: Reasonix 专用探测路径与检测 ID
   - `providers/reasonix/sessionGuard.js`: Reasonix 合成会话识别与清理守卫
   - `providers/dsh/paths.js`: Dsh (DeepSeek Helper) 探针检测 ID
   - `providers/devin/paths.js`: Devin CLI 与 Desktop 专属检测 ID
   - `projectKey.js`: 项目归属键规范化生成
   - `syncUploadInterval.js`: 同步上报间隔常量与默认时效窗口
   - `subscriptionDisplay.js`: 订阅文档构造、币种转换与 CAS 判定
   - `currency.js`: 货币汇率标准化与支持币种校验表
   - `clientHealth.js`: 客户端健康状态机（healthy/waiting/attention/unavailable/unknown）
   - `hubProtocol.js`: 线上协议标头常量、压缩检测与 ContentKey 指纹
   - `syncContent.js`: 共享设置版本增量与会话标题同步策略状态机
   - `hubBuildIdentity.js`: 运行时版本指纹与构建信息构建
4. **为什么只复制 `limits/` 与 `devin/dsh/reasonix` 三个 Provider？**：
   - **推断 ❓**：Hub 本身是纯聚合汇聚节点，不运行本机 CLI 探测或文件扫描，因此无需包含其他 20 多个工具的采集解析器；
   - 但 Hub 在执行 `normalizeDeviceRecord` 与 `mergeSyncDeviceRecord` 时，依赖 `src/shared/clientHealth.js` 校验各客户端探测健康度，该文件显式引用了 `devin/paths`、`dsh/paths`、`reasonix/paths` 的专用探针常量；
   - 同时 `src/shared/usage.js` 依赖 `reasonix/sessionGuard.js` 剔除其合成会话。因此仅这三个 provider 的纯路径/守卫模块构成了 Hub 边缘运行时的最小代码依赖闭包。

### 6. Hub Build Marker 机制 (`scripts/update-hub-build.js`)

1. **机制原理**：
   - 维持 Hub 服务端实现与客户端认知一致性的指纹注册机制。
   - `scripts/hub-build-manifest.js` 计算三组源码的 SHA-256 哈希值：
     - `core`：`WORKER_SHARED_MODULES` 中定义的所有共享纯模块；
     - `node-hub`：`src/hub/server.js` 及 Node 端 HTTP 依赖；
     - `cloudflare-worker`：`worker/src/index.js` 及 `wrangler.toml` 等。
   - 结果持久化在 `src/shared/hubBuildRegistry.json`，维护递增的 `revision` 与 `buildId`。
2. **何时必须执行**：
   - 任何改动触及 Hub 核心逻辑、Node 路由、Worker 逻辑或上报数据结构时；
   - **AGENTS.md tripwire**：`src/shared/limits/providers.js` 属于 `core` 组成部分。**新增、删除或调整 Limit Provider 会直接改变 core 哈希**，必须运行 `npm run update:hub-build` 递增注册表，随后执行 `npm run sync:worker` 同步至 Worker，否则 CI 测试（`tests/shared/hubBuild.test.js`）将因构建指纹漂移而直接判负。
3. **客户端版本比对 (`src/shared/hubBuildComparison.js`)**：
   - 客户端请求 `/api/health` 获得服务端的 `hubBuild`，调用 `compareHubBuild()` 判断：
     - `current`：版本匹配；
     - `updateAvailable`：远程 Hub 落后于本地预期，UI 提示用户重新部署 Worker 或更新 Hub；
     - `remoteNewer`：远程 Hub 领先；
     - `legacy`：远程为旧版无指纹 Hub。

### 7. Wire Record 结构与向前兼容设计

1. **设备记录标准形状 (Wire Device Record)**：
   - **元数据**：`deviceId`, `hostname`, `platform`, `osName`, `osVersion`, `updatedAt`, `receivedAt`, `agentVersion`, `agentRuntime`。
   - **用量周期 (`periods`)**：包含 `today`, `month`, `allTime` 三个周期快照。每个周期包含 `totalTokens`, `costs`, `models`, `clientModels`, `clientModelCosts`，以及细粒度缓存计数（`modelCacheReads`, `modelCacheWrites`, `modelOutputs`, `modelUnclassifiedTokens`）。
   - **额度汇总 (`limits`)**：各 Provider 剩余额度、用量百分比、重置倒计时与状态状态机。
   - **诊断与状态**：`clientStatus`, `clientHealth`, `wslStatus`, `trackedClients`, `periodWindows`, `history`。

```json
{
  "deviceId": "macbook-m3-pro",
  "hostname": "workstation",
  "platform": "darwin",
  "updatedAt": "2026-10-12T08:00:00.000Z",
  "receivedAt": "2026-10-12T08:00:01.000Z",
  "agentVersion": "0.18.2",
  "agentRuntime": "desktop-widget",
  "periods": {
    "today": { "totalTokens": 125000, "costs": 0.42, "models": { "claude-3-7-sonnet": 125000 } },
    "month": { "totalTokens": 3400000, "costs": 12.8, "models": {} },
    "allTime": { "totalTokens": 89000000, "costs": 240.5, "models": {} }
  },
  "limits": {
    "updatedAt": "2026-10-12T08:00:00.000Z",
    "providers": [ { "id": "claude", "status": "active" } ]
  }
}
```

2. **向前兼容性处理准则 (`src/shared/usage.js`)**：
   - **字段存在性守卫**：Hub 端通过 `hasOwn(record, key)` 判断可选字段，未传输时不盲目赋予默认空值破坏语义。
   - **封闭枚举与安全降级**：如 `clientHealth` 中的状态，遇到未识别的新枚举值自动降级为 `'unknown'`，绝不将非法结构透传给渲染层。
   - **敏感字段主动脱敏**：`stripSessionTextFromDeviceRecord` 默认擦除所有会话标题与预览文本，仅在协商通过代次校验（`sessionTitleSyncGeneration`）时才予以保留。
3. **尺寸预算管理（1 MiB 载荷熔断机制）**：
   - `MAX_JSON_BODY_BYTES = 1024 * 1024`，安全预算 `SYNC_PAYLOAD_BUDGET_BYTES`（扣除 16 KiB 预留量）。
   - `serializeSyncPayload` 采用**自适应分级熔断算法**：若载荷超标，按严重程度依次降级：
     - 阶段 1：剔除 `modelThroughput` 实时吞吐率；
     - 阶段 2：剔除 30 天以外的 `history` Token 组件拆分；
     - 阶段 3：剔除 `allTime.projects` 长期项目汇总（标记 `allTimeProjectsOmitted = true`）；
     - 阶段 4：二分法裁剪 `month` 详细会话记录（`fitRecentSessionEntries`，标记 `sessionDetailsOmitted.month`）；
     - 阶段 5：剔除 `month.projects` 项目列表；
     - 阶段 6：裁剪 `today` 会话记录。
4. **传输效率协商**：
   - 客户端通过请求头 `x-token-monitor-stream: 2` 声明支持 Freshness 增量刷新。
   - 当 Hub 判定用量与额度没有实质变化（`hubStatsContentKey` 相同）而仅时间戳推进时，只广播极小的 `freshness` 事件替代全量 `stats` 快照。

## 修改场景速查

| 我想改… | 主要动这些文件 | 联动/注意事项 |
|---|---|---|
| 新增 Hub HTTP 接口 | `src/hub/server.js`, `worker/src/index.js`, `docs/API.md` | 同步维护两套运行时路由；确认新路由是否需鉴权；更新 API 文档 |
| 调整 Wire Device Record 字段 | `src/shared/usage.js`, `src/shared/syncPayload.js` | 维护 `normalizeDeviceRecord` 与 `serializeSyncPayload` 预算裁剪；执行 `npm run sync:worker` |
| 新增或修改 Limits Provider | `src/shared/limits/providers.js`, 各 provider 实现 | **触发 tripwire**：必须依次执行 `npm run update:hub-build` 与 `npm run sync:worker` |
| 修改 Worker 存储或 Durable Object 逻辑 | `worker/src/index.js`, `worker/wrangler.toml` | 涉及数据结构变更需维护 `withStorageTransaction`；如变更类需检查 wrangler 迁移标记 |
| 调整跨设备共享订阅或同步设置 | `src/shared/subscriptionDisplay.js`, `src/shared/syncContent.js` | 严格保证 `baseUpdatedAt` / `baseRevision` CAS 语义；更新后执行 `npm run sync:worker` |
| 修改 Widget 的 Hub 连线与渲染逻辑 | `src/electron/main.js`, `src/electron/diagnosticSnapshot.js` | 检查 `hubMode` 切换时的生命周期清理，保证 `startMode` 队列互斥与 generation 判定 |

## 陷阱

1. **Worker 跨层 import 与本地内置库依赖**：在 `worker/` 下绝不能使用相对路径引入外层模块，也绝不能调用 `fs` / `path` 等 Node 专属库。所有共享代码必须经由 `npm run sync:worker` 复制进 `worker/src/shared/`。
2. **公共统计路由泄露财务隐私**：千万不要将 `subscriptionsUpdatedAt` 或 `syncSettingsRevisions` 并入 `getStats()`，否则会被 Worker 的无鉴权 `/api/public/stats` 端点直接暴露。
3. **遗忘更新 Hub Build Marker**：修改 `WORKER_SHARED_MODULES` 涉及的文件（尤其是 `limits/providers.js`）后若未运行 `npm run update:hub-build`，会导致 `hubBuildRegistry.json` 不匹配，CI 阶段直接挂掉。
4. **嵌入式 Host 模式误发 HTTP 回环请求**：Widget 的 `host` 模式必须使用进程内方法直接写入与监听（`embeddedHub.hub.ingest` / `onStats`），不得走 `127.0.0.1` 网络层，避免被本地代理软件重定向导致同步失效。
5. **并发订阅修改静默覆盖**：向 `/api/subscriptions` 提交更新时必须带上正确的 `baseUpdatedAt`，否则发生并发碰撞时若无 409 拦截将导致多端记账丢失。
6. **URL Query Secret 传输漏洞**：除 Worker 对旧版 iOS 小组件保留 `?secret=` 兼容外，Node Hub 及新客户端严禁将秘钥写在 URL query 中。

## 验证方式

- **Node Hub 核心与路由测试**：
  ```powershell
  node --test tests/hub/*.test.js
  ```
- **Cloudflare Worker 状态机与订阅测试**：
  ```powershell
  node --test tests/worker/*.test.js
  ```
- **Wire 协议、载荷裁剪与构建标记一致性校验**：
  ```powershell
  node --test tests/shared/hubBuild.test.js tests/shared/hubProtocol.test.js
  ```
- **Worker 闭包同步与代码漂移校验**：
  ```powershell
  npm run sync:worker
  git diff --exit-code worker/src/shared/
  ```

# 03 追踪客户端 Provider

## 职责概览

本仓库中的「Provider」具备双重面相，按技术职责严格区分为两类系统，但代码组织上按厂商聚合于 `src/shared/providers/<id>/` 目录（桌面端特化逻辑位于 `src/electron/providers/<id>/`）：
1. **追踪客户端 (Tracked Client)**：被动采集本地 AI 编程工具产生的 Token 消耗、费用与会话历史。核心解析工作下推给 Rust 编写的底层二进制 `tokscale`，JS 侧 Provider 主要负责数据源路径探测、会话元数据（标题、父子调用关系、上下文窗口容量）富化及实时运行状态（Session Activity）监听。
2. **限额提供方 (Limits Provider)**：主动轮询各大平台或本地网关获取实时配额余额、消耗窗口（5h/7d 周期）及重置倒计时的账户适配器。

目前 `src/shared/providers/` 下包含 37 个厂商目录（加上父目录共 38 个目录）。目录按照业务角色分布如下：
- **双向 Provider（既追踪 Token 又监控配额）**：`claude`, `codex`, `opencode`, `cursor`, `antigravity`, `cline`, `kimi`, `grok`, `copilot`, `zed`, `commandcode`, `mimo`, `kiro`, `workbuddy`, `devin` 等。
- **纯追踪客户端 (Tracked Client Only)**：`catpaw`, `codebuddy`, `droid`, `dsh`, `hermes`, `mcode`, `qodercn`, `reasonix` 等。
- **纯配额提供方 (Limits Provider Only)**：`alibaba`, `deepseek`, `factory`, `minimax`, `ollama`, `openrouter`, `qoder`, `stepfun`, `thirdparty`, `trae`, `typesafe`, `volcengine`, `zai`, `zaiteam` 等。

典型目录文件结构及命名规律归纳：
- `account.js`：【Limits 声明】必须为无 Node 内建依赖的纯数据叶子模块，声明配置项字段（`fields`）、前端面板规格（`form`）、凭证存储路径（`storePath`）及 URL 策略。
- `limits.js`：【Limits 采集】实现 `fetch<Provider>Limits(transport, credentials, options)` 接口，处理 API 请求、状态重试与配额归一化。
- `paths.js`：【路径解析】解析客户端在宿主机与 WSL 环境下的日志、配置、SQLite 或转储根路径，暴露 Source Check ID 常量。
- `sessionMetadata.js`：【会话富化】按需解析转储首尾记录，提取会话标题、T3 关联、`contextTokens`/`contextWindow` 上下文及 Prompt Cache 存活时间。
- `sessionActivity.js`：【实时活动】实现进程存活性检验与 T3 任务监听，提供 `readActivity`、`projectActivity` 与 `activityWatchTargets`。
- `selfSync.js`：【自同步缓存】针对 Cursor、Antigravity 等闭源/私有格式客户端，在扫描前主动将本地数据库转换为 tokscale 兼容缓存。
- `sessionDetail.js` / `transcriptReader.js`：【会话详情】支持按需解压读取多轮对话、工具调用与 Token 明细（如 DSH 的 zstd 解码）。
- 厂商专属机制：如 `login.js`、`oauth.js`（Codex/Antigravity 认证）、`deviceFlow.js`（Copilot 设备流）、`arkcli.js`（火山 CLI 接入）。

---

## 入口与关键文件

| 文件 | 关键符号 | 作用 |
|---|---|---|
| `src/shared/clientCatalog.js` | `CLIENT_CATALOG`, `CLIENT_IDS` | 追踪客户端唯一标识单点真相，定义显示次序、默认开启状态与 `forkOnly` 标记 |
| `src/shared/clientTracking.js` | `DEFAULT_CLIENTS`, `KNOWN_CLIENTS` | 派生自 catalog 的逗号分隔客户端 ID 列表，作为持久化配置与扫描的底座 |
| `src/shared/tokscaleClientMapping.js` | `TOKSCALE_CLIENT_GROUPS`, `TOKSCALE_CLIENT_ALIASES` | 定义聚合客户端的子源别名（如 `mimo` $\to$ `micode`, `micode-desktop`）与定制扫描参数 |
| `src/shared/usage.js` | `normalizeClientName`, `normalizePeriod` | 客户端名称归一化、Token 统计汇总与周期增量合并，保障标识符固定点约束 |
| `src/shared/collector.js` | `tokscaleClientFilter`, `clientSourceRoots`, `replaceTodayPartitions` | 采集调度引擎：运行 tokscale 子进程、监听文件变更触发定向增量扫描 |
| `src/shared/clientSourceRegistration.js` | `CLIENT_SOURCE_REGISTRATIONS` | 跨平台/WSL 共享的家目录数据源根目录声明式映射表 |
| `src/shared/clientSources.js` | `clientSourceRoots`, `clientWatchCandidates` | 聚合环境/平台特定路径，投影数据源检测点与文件监听候选集 |
| `src/shared/clientHealth.js` | `CLIENT_SOURCE_CHECK_IDS`, `normalizeClientHealth` | 客户端健康探针稳定 Check ID 白名单（严格字母序）及同步错误状态码归一化 |
| `src/shared/sessionMetadata.js` | `SESSION_METADATA_RESOLVERS`, `applyTokscaleSessionMetadata` | 会话元数据富化注册表，分发会话标题、项目识别与上下文容量解析 |
| `src/shared/sessionContext.js` | `shouldReadSessionContext`, `normalizeSessionContext` | 会话上下文门控与容量校验，从日志尾部提取 `contextTokens` / `contextWindow` |
| `src/shared/sessionActivityRegistry.js` | `SESSION_ACTIVITY_REGISTRY`, `refreshSessionActivity` | 实时活动状态适配器懒加载注册表与周期刷新调度 |
| `src/shared/sessionActivityProviders.js` | `SESSION_ACTIVITY_PROVIDERS` | 纯数据层声明具备 Live Activity 能力的客户端 ID 与元数据依赖 Key |
| `src/shared/t3SessionIdentity.js` | `supportsT3SessionClient`, `nativeAccountingId` | T3 协同编程环境与本地会话 ID 的强类型映射 |
| `src/shared/limits/providers.js` | `LIMIT_PROVIDER_CATALOG`, `LIMIT_PROVIDER_BY_CLIENT` | Limits 提供方目录与客户端至 Limits 账户映射关系定义 |
| `src/shared/limits/accounts.js` | `LIMIT_PROVIDER_ACCOUNTS`, `registerProvider` | 静态声明 Limits 账户元数据叶子节点与 `limits.js` 懒加载闭包 |
| `src/shared/limits/registry.js` | `LIMIT_PROVIDER_MODULES`, `bindField` | 绑定账户规范与 limits 模块，构建派生设置解析器与验证矩阵 |
| `src/shared/limits/collector.js` | `fetchLimitsForProvider`, `collectLimits` | Limits 轮询调度器，注入 outbound 传输层与并发控制 |
| `scripts/sync-worker-shared.js` | `WORKER_SHARED_MODULES` | 拷贝共享代码闭包至 Cloudflare Worker 运行时的构建脚本 |
| `src/shared/providers/codex/sessionMetadata.js` | `resolveSessionMetadata` | Codex 线程库及 T3 Code 标题查找，会话类型标记（`background-review`） |
| `src/shared/providers/codex/localUsageSource.js` | `createCodexLocalUsageSource` | Codex 本地 Dots 任务 WebSocket 采集与 SQLite 暂存 |
| `src/shared/providers/claude/sessionMetadata.js` | `resolveSessionMetadata` | Claude 会话转储标题解析（`custom-title` 优先）与 200K/1M 窗口判定 |
| `src/shared/providers/claude/sessionActivity.js` | `readActivity`, `projectActivity` | Claude 本地进程 PID 存活性校验与等待状态检测 |
| `src/shared/providers/dsh/sessionFiles.js` | `scanZstdFrames`, `preferredDshSessionFileInDirectory` | DSH zstd 帧魔数探测、版本分代选择与头部元数据解析 |
| `src/shared/providers/dsh/transcriptReader.js` | `readDshTranscriptRecords` | DSH 会话详情流式 zstd 解码与单行 16 MiB 保护 |
| `src/shared/providers/reasonix/sessionGuard.js` | `filterReasonixSyntheticSessions` | 过滤并剥离 Reasonix 本地虚拟会话，防范敏感路径上传 |
| `src/shared/providers/cursor/selfSync.js` | `syncCursorWorkspaces` | Cursor 状态转储生成器，将 state.vscdb 导出为 tokscale 兼容缓存 |
| `src/shared/providers/antigravity/selfSync.js` | `syncAntigravityWorkspaces` | Antigravity 状态转储生成器，将私有格式转换为中间格式 |

---

## 数据流

### 1. 通用用量与元数据采集流

```
[磁盘数据源] (会话转储 / 日志 / SQLite)
  │
  ▼
[src/shared/collector.js]
  ├─ 1. watch 触发 -> clientWatchCandidates() 映射变动文件到客户端 ID
  ├─ 2. tokscaleClientFilter() 展开别名 (如 devin -> devin-cli,devin-desktop)
  └─ 3. spawnTokscaleJson() 唤起 tokscale (Rust) 子进程执行扫描
        │
        ▼ (解析输出 JSON entries)
[src/shared/collector.js (extractUsageFromTokscale)]
        │
        ▼ (名称归一化 & 分区刷新)
[src/shared/usage.js (normalizeClientName / normalizePeriod)]
  ├─ 别名折回父 ID: normalizeClientName('antigravity-cli') -> 'antigravity'
  └─ replaceTodayPartitions() 重写指定客户端分区并向 month/allTime 累加精确差额
        │
        ▼ (会话补充元数据富化)
[src/shared/sessionMetadata.js (sessionMetadataMap)]
  ├─ SESSION_METADATA_RESOLVERS 针对活跃 sessionIds 触发对应 provider 适配器
  ├─ 提取会话标题、T3 任务引用、项目目录 hash
  └─ sessionContext.js 读取 transcripts 尾部解析 contextTokens / contextWindow
        │
        ▼ (组装完成)
[主进程聚合 / 状态推送] -> 通过 IPC 发往渲染器，或经 Wire Record 发往 Hub / Worker
```

### 2. 代表型客户端特异数据流

```
【Codex 标准型】
~/.codex/sessions/**/*.jsonl ──> tokscale (Rust) ──> extractUsageFromTokscale ──> usage.js
                                                              ▲
~/.codex/auth.json ──> localUsageSource.js (WebSocket) ───────┘ (可选 Dots 任务入库 sqlite)
~/.codex SQLite / T3 statev2.sqlite ──> codex/sessionMetadata.js ──> 注入会话标题
rollout 尾部 token_count ──> sessionContext.js ──> 注入实时上下文占用与 Prompt Cache TTL

【Claude 大型】
~/.claude/projects/**/*.jsonl ──> tokscale (Rust) ──> extractUsageFromTokscale ──> usage.js
~/.claude/sessions/<pid>.json ──> claude/sessionActivity.js ──> 校验 OS 进程 ──> 注入 liveActivity
Web sessionKey / OAuth ──> claude/limits.js ──> Electron 原生 Fetch ──> 抓取 cedar_ember 券

【DSH 特殊 zstd 型】
~/.dsh/sessions/**/session.v*.jsonl.zstd ──> tokscale fork (Rust dsh.rs) ──> usage.js (汇总计数)
                                   │
                                   ├──> dsh/sessionFiles.js (Node 22.15+ zlib.zstdDecompressSync)
                                   │     └─ 帧扫描 (0xFD2FB528) -> 提取首部 startedAt 与最新 title
                                   │
                                   └──> dsh/transcriptReader.js (zlib.createZstdDecompress)
                                         └─ Session Detail 按需流式解压 64 KiB -> 提取多轮对话
```

---

## 关键机制

### 1. 通用模式与双重接口契约
Provider 目录按厂商收敛，技术上划分为两套互相解耦的接口契约：
- **Limits 契约**：
  - `account.js` 必须导出符合规范的纯数据对象：
    - `id`: 厂商唯一标识（与目录名一致）。
    - `fields`: 配置项字段数组，明确每个字段的 `storePath`（凭据持久化路径）与 `resolve`（环境与设置解析器）。
    - `form`: 前端设置面板渲染规格 DSL。
    - `status`: Limits 状态归一化字段映射。
    - `urlPolicy`: 允许外联的请求域名白名单。
  - `limits.js` 必须导出 `fetch<Provider>Limits(transport, credentials, options)`。必须支持外部注入的 `transport`（在 Chromium/Electron 下绕过受限 Header），并对 401/403/429 给出明确的状态分类（`unauthorized`、`rate-limited` 等）。
- **Tracked Client 契约**：
  - 本地不提供统一的 JS 扫描入口函数（全量及增量扫描完全由底层 `tokscale` Rust 二进制承担）。
  - 若客户端具备自定义会话逻辑，需在 `sessionMetadata.js` 中导出 `resolveSessionMetadata(sessionIds, context)` 返回 `Map<sessionId, metadata>`。
  - 若支持实时状态，需在 `sessionActivity.js` 中导出 `readActivity(summary, options)`、`projectActivity(summary, activity, now)` 与 `activityWatchTargets(options)`。

### 2. 静态注册与懒加载机制
全仓严禁通过 `fs.readdir` 或动态字符串在运行时探测 Provider，所有绑定均显式静态编码：
- **Limits 注册表**：位于 `src/shared/limits/accounts.js`，通过 `registerProvider(require('../providers/<id>/account'), () => require('../providers/<id>/limits'))` 收集到只读数组 `LIMIT_PROVIDER_ACCOUNTS`。`account.js` 必须为 Require-free 叶子节点，其惰性闭包确保在凭证加载阶段不会过早引用含有网络或重型依赖的 `limits.js`。在 `src/shared/limits/registry.js` 中求值求得 `LIMIT_PROVIDER_MODULES`。
- **Client 目录单点真相**：在 `src/shared/clientCatalog.js` 的 `CLIENT_CATALOG` 数组中严格按展现顺序声明对象 `{ id, label, defaultTracked, forkOnly }`。
- **元数据与活动映射**：`src/shared/sessionMetadata.js` 内建 `SESSION_METADATA_RESOLVERS` Map，显式映射 client ID 到对应模块的 `resolveSessionMetadata`；`src/shared/sessionActivityRegistry.js` 静态绑定懒加载函数。

### 3. 追踪客户端 ID 三大不变量
针对秒级变动检测的定向增量扫描（Targeted Watch Ticks，`--client <target> --today`），Collector 依赖客户端 ID 保持两路扫描逻辑的完全收敛（由 `tests/shared/clientPartitionInvariants.test.js` 强制守卫）：

```javascript
// 1. 固定点不变量 (tests/shared/clientPartitionInvariants.test.js)
assert.equal(normalizeClientName(client), client);

// 2. 别名收敛不变量
assert.equal(normalizeClientName(alias), client);

// 3. 严禁合成标记不变量
assert.ok(!tokscaleClientFilter([client]).includes('synthetic'));
```

1. **不动点性 (Fixed Point)**：对所有受管客户端 ID，`normalizeClientName(client) === client`。
   - *运行机理*：`collector.js` 在接收到变更后，首先根据变动目录映射出目标 `client` 并清空其当期分区（`replaceTodayPartitions`）。若 tokscale 返回的记录被 `normalizeClientName` 归一化为其他名称，原目标分区将永久变空，在 `applyPeriodDelta` 计算中向月度/历史累计注入负差额，污染统计数据。
2. **别名收敛性 (Alias Normalization)**：`TOKSCALE_CLIENT_ALIASES` 中的所有子源别名经过 `normalizeClientName(alias)` 必须归一化为父 `client`；且 `tokscaleClientFilter(client)` 必须将父客户端展开为所有包含的子扫描 ID。
   - *运行机理*：当子工具（如 `antigravity-cli`）写入时，扫描父级 `antigravity` 必须自动通过 filter 扩展为包含 CLI 的参数；返回的行必须收敛至父级分区，避免子数据丢失。
3. **严禁泄漏合成标识 (No Synthetic Emission)**：`tokscaleClientFilter` 绝对不可产出包含 `'synthetic'` 的字符串。
   - *运行机理*：Tokscale 内部参数若含有 `synthetic`，会触发内部 `include_synthetic` 分支进而唤醒全部客户端的扫描器。这不会导致数据错误，但会导致秒级轻量局部增量扫描退化为高 CPU 消耗的全量扫描。

### 4. 三大代表客户端走读

#### 4.1 Codex（标准型）
- *文件分布*：`src/shared/providers/codex/` 下含 `sessionMetadata.js`, `sessionContext.js`, `sessionActivity.js`, `localUsageSource.js`, `limits.js` 等。
- *数据流解析*：
  1. Tokscale 原生读取 `~/.codex/sessions/**/*.jsonl`，按首行 header 验证 `session_meta.id`，输出会话级分组用量。
  2. `sessionMetadata.js` 将 rollout 会话与本地 Codex SQLite 线程库进行 join；若关联到 T3 Code，通过 `src/shared/t3SessionMetadata.js` 查询 `statev2.sqlite` 中 `nativeThreadRef.nativeId` 获取标题，保留 `background-review` 的 `sessionKind`。
  3. `sessionContext.js` 从日志尾部最多读取 1 MiB 提取最新 `token_count` 事件，将 `info.last_token_usage` 识别为实时占用，`info.model_context_window` 识别为容量上限；若存在有效缓存读写，计算 30 分钟固定 TTL 的 Prompt Cache 倒计时。
  4. 针对本地 Dots 任务，`localUsageSource.js` 通过 30 秒可续约租约与本地 `codex exec-server` WebSocket 通信，将增量写入 `codex-local-usage.sqlite`，优先以 native rollout 会话覆盖 Dots 避免重复统计。

#### 4.2 Claude（大型复杂型）
- *文件分布*：`src/shared/providers/claude/` 下含 `sessionMetadata.js`, `sessionActivity.js`, `limits.js` 等。
- *数据流解析*：
  1. Tokscale 递归扫描 `~/.claude/projects/` 与 `transcripts/` 中的 JSONL 转储文件。
  2. `sessionMetadata.js` 仅采信 `custom-title` 与 `ai-title` 记录，由最新 assistant `stop_reason` 与紧随的用户 prompt 驱动 Turn 状态机；解析上下文用量时，只从 `message.usage` 提取 `input_tokens + cache_creation + cache_read`，排除 `output_tokens`；识别 `[1m]` 标记映射到 1M 窗口，其余默认为 200K。
  3. `sessionActivity.js` 检查 `<configDir>/sessions/<pid>.json`，结合宿主平台（Linux 校验 `/proc/<pid>/stat` 字段 22 启动时间戳）剔除已死亡 PID，避免僵尸进程误报。
  4. `limits.js` 支持三级回退（Web Key $\to$ OAuth $\to$ CLI），并在请求中携带 `cedar_ember=1` 抓取 Anthropic 额度重置卡券，规避将 `Fable weekly`（仅模型周限额）误判为通用限额。

#### 4.3 DSH / DeepSeek Harness（特殊 zstd 型）
- *文件分布*：`src/shared/providers/dsh/` 下含 `paths.js`, `sessionFiles.js`, `sessionMetadata.js`, `sessionDetail.js`, `transcriptReader.js`。
- *数据流解析*：
  1. 用量汇总完全交由专有 tokscale fork（`dsh.rs`）在子进程内通过 Rust 流式解压 `session.v*.jsonl.zstd` 并根据消息指纹去重。
  2. 本地会话富化（`sessionFiles.js`）调用 Node 22.15+ 内建 `node:zlib` API，`scanZstdFrames` 根据魔数 `0xFD2FB528` 与段描述符定位 Zstd 帧；对于进行中的会话，末尾未写完的残帧通过 `zlib.zstdDecompressSync(tail, { finishFlush: zlib.constants.ZSTD_e_flush })` 容错跳过，从首帧提取 `startedAt` 并从末尾提取最新 `session/title`。
  3. 会话详情（`transcriptReader.js`）按需流式调用 `zlib.createZstdDecompress`，限制单行最大 16 MiB（超限抛出 `SESSION_DETAIL_LINE_TOO_LARGE`），在分叉会话中跳过 `session/end-seed` 前的继承数据，并将 `outputTokens` 原样保留（因 DSH reasoning 为 output 子集）。

### 5. 新增 Tracked Client 逐步清单（对比 docs/providers/README.md）
新增一个 Tracked Client 必须按序完成以下点位配置：
1. `src/shared/clientCatalog.js`：在 `CLIENT_CATALOG` 数组适当显示位置插入 `{ id, label, defaultTracked, forkOnly }`。
2. `src/shared/tokscaleClientMapping.js`：若存在多子源/别名，声明 `TOKSCALE_CLIENT_GROUPS`（*注：docs/providers/README.md 的 checklist 表格中遗漏了此显式文件项，但在 Partition Invariants 中有提及*）。
3. `src/shared/usage.js`：在 `normalizeClientName` 中加入前缀/特征匹配分支，确保满足固定点与别名收敛。
4. `src/shared/clientSourceRegistration.js`：若有家目录规范路径，登记 `{ marker, client, hostCheckId }`。
5. `src/shared/clientSources.js`：若为平台相关或特定单文件路径，在 `clientSourceRoots()` 中通过 `add(...)` 显式注册。
6. `src/shared/clientHealth.js`：将对应的 `checkId` 按**严格字母序**加入 `CLIENT_SOURCE_CHECK_IDS`，并运行 `npm run sync:worker`。
7. `src/shared/vendorPresentation.js`：在 `VENDOR_PRESENTATION` 登记品牌色、图标名与小组件对比色。
8. 静态图标：放置 `assets/icons/<id>.svg` 与 `.github/assets/tools-icon/<id>.png`。
9. `src/shared/sessionMetadata.js`：若客户端日志带有会话标题或自定义上下文，在 `SESSION_METADATA_RESOLVERS` 注册解析器。
10. `src/shared/sessionActivityProviders.js`：若客户端支持实时活动探针，在 `SESSION_ACTIVITY_PROVIDERS` 和 `sessionActivityRegistry.js` 声明适配器。
11. `scripts/verify-vendored-tokscale.js`：在 `TOKEN_CONTRACT_CASES` 提供测试样本，并在 `tests/shared/tokscaleTokenContracts.test.js` 验证。
12. `tests/shared/clientCatalog.test.js` & `clientTracking.test.js`：更新固化比对字符串 `KNOWN_CLIENTS` 与 `DEFAULT_CLIENTS`。
13. 文档更新：更新 `README.md` 与多语言 `README.*.md` 支持列表，同步更新 `.env.example`。

### 6. Cloudflare Worker 仅收录三家 Provider 副本的成因
Worker 代码由 `scripts/sync-worker-shared.js` 根据 `scripts/hub-build-manifest.js` 的 `WORKER_SHARED_MODULES` 列表同步。在 37 个 Provider 中，仅 `devin/paths.js`、`dsh/paths.js`、`reasonix/paths.js` 与 `reasonix/sessionGuard.js` 存在副本：
- *架构原因*：Cloudflare Worker 属于云端无状态中继/多端聚合服务，**不执行任何本地文件系统扫描**（无 tokscale 进程、无 JSONL/SQLite 磁盘读取）。因此 34+ 客户端纯本地的采集/会话解析代码均无需打包至 Worker。
- *依赖闭包推断*：
  1. `worker/src/index.js` 引用 `usage.js`，`usage.js` 引用 `clientHealth.js`。
  2. `clientHealth.js` 引用了 `REASONIX_SOURCE_CHECK_ID`、`DSH_SOURCE_CHECK_ID`、`DEVIN_CLI_SOURCE_CHECK_ID`、`DEVIN_DESKTOP_SOURCE_CHECK_ID`。历史实现中这三家将 check ID 定义在其 `paths.js` 中导出，而其余客户端均直接写为字符串字面量 ❓。
  3. `usage.js` 引用了 `reasonix/sessionGuard.js` 中的 `filterReasonixSyntheticSessions`，这是为了清洗从客户端同步过来的 Reasonix 虚拟会话（防止本地绝对路径泄漏到公网数据库）。

---

## 修改场景速查

| 我想改… | 主要动这些文件 | 联动/注意事项 |
|---|---|---|
| 新增 Tracked Client (上游 Tokscale 已支持) | `src/shared/clientCatalog.js`<br>`src/shared/clientSourceRegistration.js`<br>`src/shared/clientHealth.js`<br>`src/shared/usage.js`<br>`src/shared/vendorPresentation.js` | 1. `clientHealth.js` 的 `CLIENT_SOURCE_CHECK_IDS` 必须按字母序插入！<br>2. 运行 `npm run sync:worker` 保持 Worker 闭包一致。<br>3. `tests/shared/clientCatalog.test.js` 更新固化字面量。 |
| 新增 Fork-only 专属客户端 | 上述文件 + 本仓库 tokscale fork (`crates/tokscale-core/...`) | 在 `CLIENT_CATALOG` 标记 `forkOnly: true`，在 `scripts/verify-vendored-tokscale.js` 添加合约契约测试用例。 |
| 添加/调整客户端别名映射 | `src/shared/tokscaleClientMapping.js`<br>`src/shared/usage.js` | 必须验证 `normalizeClientName` 不动点与别名收敛测试，严禁泄漏 `synthetic`。 |
| 增强会话元数据（标题/上下文） | `src/shared/providers/<id>/sessionMetadata.js`<br>`src/shared/sessionMetadata.js` | 解析上下文容量必须通过 `src/shared/sessionContext.js` 统一门控，禁止凭空由模型名推测。 |
| 新增/修改 Limits 供应商 | `src/shared/limits/providers.js`<br>`src/shared/limits/accounts.js`<br>`src/shared/providers/<id>/account.js`<br>`src/shared/providers/<id>/limits.js` | 1. `account.js` 必须保持 Require-free。<br>2. 修改了 `limits/providers.js` 必须执行 `npm run update:hub-build` 更新 Hub 校验指纹！ |
| 修改云端 Worker 同步协议 | `src/shared/` 对应文件<br>`scripts/hub-build-manifest.js` | 禁止直接修改 `worker/` 下生成文件，必须修改 `src/shared/` 后运行 `npm run sync:worker`。 |
| 调整客户端健康检查与排障项 | `src/shared/clientHealth.js`<br>`src/shared/clientSources.js` | 保持 Check ID 字母序，检查枚举值收敛，避免私网路径进入公共状态数据。 |
| 修改模型计费定价解析 | `src/shared/collector.js`<br>`src/shared/providers/codex/localUsageSource.js` | 定价使用 `tokscale pricing <model> --json`；查询失败保留先前有效价格，禁止假设未定价模型为免费。 |

---

## 陷阱

1. **增量分区被意外清空**：修改 `normalizeClientName` 时若未保证固定点，或将未知输入错误映射，会导致秒级 watch tick 归零整个客户端分区，在 `applyPeriodDelta` 计算中引入负差额污染。
2. **Watch 目录死循环**：自同步类客户端（`cursor`、`antigravity`）生成的 tokscale 缓存目录绝对不可加入 Watch 列表，否则会引发“文件变更 $\to$ 触发同步写缓存 $\to$ 再次触发变更”的死循环。
3. **Limits account.js 出现 Require**：`account.js` 一旦 require 其他非叶子模块（尤其是凭证存储或自身 limits.js），会导致循环引用或使脱机凭证扫描阶段过早载入昂贵的网络/进程探测模块。
4. **Hub Build Marker 失效**：`src/shared/limits/providers.js` 属于 Hub Core 校验清单。只要改动该文件（包括仅调整显示 Label 或增删枚举），都必须运行 `npm run update:hub-build`，否则 CI 和 Hub 启动将直接校验失败。
5. **Worker 目录手动编辑**：`worker/src/shared/` 下所有文件均为构建自动同步生成，手工编辑会在下次 `sync:worker` 或 CI 检查中被无情覆盖并导致构建中断。
6. **zstd 解码环境假设**：DSH 会话解码深度依赖 Node 22.15+ 内建 `node:zlib` 原生解压能力，在低版本 Node 环境下无法启动桌面端与测试套件。
7. **客户端健康检查白名单遗漏**：`clientSources.js` 新增了数据源 Check ID，若忘记同步加入 `CLIENT_SOURCE_CHECK_IDS`，`normalizeClientHealth` 会将该客户端的整组健康状态直接丢弃，而非仅仅忽略未知检查点。
8. **跨域 Referer 与 Chromium 传输限制**：在 Electron 渲染器与底层请求中，禁止显式伪造 `Host` Header，跨域 Referer 携带路径会被取消，且 Limits 采集调用必须传递上下文注入的 `transport`。

---

## 验证方式

执行以下测试命令验证 Provider 相关修改：

```bash
# 1. 验证客户端目录定义、别名收敛及分区三大不变量
node --test tests/shared/clientCatalog.test.js tests/shared/clientTracking.test.js tests/shared/clientPartitionInvariants.test.js

# 2. 验证客户端健康检查 ID 与 WSL 扫描源一致性
node --test tests/shared/clientHealth.test.js tests/shared/clientSources.test.js

# 3. 验证 Tokscale 契约与会话元数据解析
node --test tests/shared/tokscaleTokenContracts.test.js tests/shared/sessionMetadata.test.js tests/shared/sessionContext.test.js

# 4. 重点客户端专属测试（Codex, Claude, DSH）
node --test tests/shared/codex*.test.js tests/shared/claude*.test.js tests/shared/dsh*.test.js

# 5. 验证 Limits 账户注册表与依赖闭包
node --test tests/shared/limitCollector*.test.js tests/shared/hubBuild.test.js

# 6. 单独验证客户端 ID 目录顺序与不可变集合
node --test tests/shared/clientCatalog.test.js

# 7. 验证全部 shared 测试集合（回归基准）
node --test tests/shared/*.test.js
```

# 04 限额采集与账号/凭据

## 职责概览

面向第一次接触本仓库、准备修改限额采集机制或账号凭据体系的开发者：

- **限额采集体系 (`src/shared/limits/**`)**：
  - 与本地 Token 用量采集（tokscale）完全正交、独立调度的额度状态系统。
  - 负责统一调度各 AI 服务商（Claude、Codex、OpenCode、Cursor、Antigravity、Zed、Mimo 等）的在线配额与用量窗口查询。
  - 在内存中维护每个 Provider 的独立请求泳道（Lane）、并发信号量（默认上限 3）、最新覆盖（Latest-wins）、指数退避重试，以及自适应速率监测与重置时钟边界对齐。
  - 保留并维护 `lastGood`（最后一次成功快照）与 `lastAttempt`（最后一次尝试信息）双轨状态，防止网络暂态故障导致 UI 彻底白屏。
  - 将规范化后的摘要通过 `src/shared/syncPayload.js` 封装为跨端同构的 Wire Device Record，供本地展示或同步至 Hub / Cloudflare Worker。

- **主进程凭据与桥接 (`src/electron/limits/**`)**：
  - 负责 Electron 主进程环境下的凭据生命周期与网络请求分发。
  - 基于各 Provider 的无依赖叶子声明自动派生凭据路径；执行默认拒绝（Default-Deny）的渲染器数据脱敏。
  - 在受限网络栈中拦截并抹除破坏性请求头；管理本地单文件凭据持久化（`credentials.json`）。
  - 处理 `limits:saveCredential` 等核心 IPC 交互，在持久化前先行试跑探针，避免写入损坏无效的凭据。

- **平台特定与供应商扩展 (`src/electron/providers/{antigravity,claude,codex,mimo,workbuddy}`)**：
  - 隔离必须依赖 Electron 或操作系统本地特权的供应商逻辑。
  - 涵盖 Antigravity 本地回环 OAuth 回调服务器与 PKCE 握手。
  - 涵盖 Claude 经 `advapi32.dll` 对 Windows Credential Manager 的本地凭据直读与会话 Cookie 热更新。
  - 涵盖 MiMo 基于 SQLite WAL 文件状态戳秒级检测多账号切换、以及基于 Undici 与系统 PAC 代理路由的 OAuth 穿透。
  - 涵盖 Codex 弹出层状态控制器与第三方重置预测接口。
  - 涵盖 WorkBuddy 本地桌面加密会话（`$wbEncrypted`）安全探测与标头保护。

- **前端展现与表单 (`src/electron/renderer/limits/**`)**：
  - 纯无状态的 UI 展现层。
  - 仅消费主进程下发的脱敏数据（`set` 标记、通用 Form DTO）。
  - 通过元驱动引擎动态构建各 Provider 的凭据输入框与余额进度条，严禁直连底座凭据与原生网络层。

---

## 入口与关键文件

| 文件 | 关键符号 | 作用 |
|---|---|---|
| `src/shared/limits/runtime.js` | `LimitsRuntime`, `COOLDOWN_BYPASS_REASONS`, `dispatchIntent` | 限额运行时代谢中枢：调度刷新节拍、过滤冷却绕过原因、管理并发信号量、Provider 独立泳道与退避重试 |
| `src/shared/limits/collector.js` | `collectLimitsOnce`, `probeLimitProvider`, `LIMITS_MAX_CONCURRENCY` | 采集调度总线：受控并发（默认并发上限 3）的 Provider 查询分发器，处理单 Provider 采集结果规范化与异常收敛 |
| `src/shared/limits/core.js` | `normalizeLimitProvider`, `normalizeLimitsSummary` | 核心规约层：定义 Provider 限额结构骨架、统一网络状态枚举（ok/unauthorized/rateLimited/unavailable/error） |
| `src/shared/limits/accounts.js` | `LIMIT_PROVIDER_ACCOUNTS`, `providerCredentialSettingPaths`, `limitProviderSettingKeys` | 静态账号声明索引：挂载各 Provider require-free 的 `account.js`，动态推导凭据与监控设置路径 |
| `src/shared/limits/registry.js` | `LIMIT_PROVIDER_REGISTRY`, `bindProviderRegistry` | 动态注册表：运行时将账号声明与其懒加载的 `limits.js` 探针绑定，对外暴露统一能力接口 |
| `src/shared/limits/providers.js` | `LIMIT_PROVIDER_CATALOG`, `LIMIT_PROVIDER_BY_CLIENT` | 供应商目录：单一真实来源，定义 Provider 排序、ID 映射及关联客户端配置 |
| `src/shared/limits/balanceDisplay.js` | `isCreditsWindow`, `creditsMeterPercent`, `formatCompactMoney` | 资金配额显示逻辑：按 `metric === 'credits'` 动态识别余额窗口，推算前端展示专用进度百分比 |
| `src/shared/limits/burnRate.js` | `nextLimitsUrgencyRefresh`, `recordLimitsSample`, `createLimitsBurnState` | 自适应刷新计算：根据额度消耗速度（燃尽率）推导自适应刷新紧急程度，驱动紧凑轮询 |
| `src/shared/limits/resetBoundary.js` | `nextLimitsResetBoundary` | 重置边界探测：监听额度窗口重置时间点，在配额刷新瞬时精准安排定时刷新 |
| `src/shared/limits/retryPolicy.js` | `computeRetryDelayMs`, `isRetryableLimitStatus` | 指数退避策略：针对限流（429）或服务端宕机计算退避时间阶梯与抖动因子 |
| `src/shared/limits/usageItems.js` | `limitUsageItemId` | 细粒度条目标识：为各配额窗口及计费项生成确定性 Checksum，驱动前端隐藏/展示状态持久化 |
| `src/shared/credentialStore.js` | `ensureCredentialStore`, `CREDENTIAL_SETTING_PATHS`, `credentialSettingsForRenderer` | 凭据存储底座：单文件 `credentials.json` 读写，严禁包含 Provider 字面量，驱动默认拒绝脱敏 |
| `src/shared/providers/claude/limits.js` | `loadWinCredApi`, `readWindowsCredentialSecret` | Claude 凭据读取：动态按需加载 `advapi32.dll` 并调用 `CredReadW` 获取 Windows 凭据管理器密文 |
| `src/electron/limits/accountSettings.js` | `normalizeAccountPatch`, `finalAccountSettings`, `accountFieldProjection`, `limitAccountFormsForRenderer` | 主进程设置桥接：自动连接账号声明与 settings，负责写时清理、初始值填充、DTO 脱敏映射 |
| `src/electron/limits/credentialCommands.js` | `registerCredentialCommands`, `saveCredentialDraft` | 凭据指令总控：响应 IPC 凭据修改指令，执行预检探测、原子保存与增量配置同步 |
| `src/electron/limits/fetch.js` | `createElectronLimitsFetch`, `createElectronNetFetch` | 出站传输守卫：配置 Electron `net.fetch` 适配系统代理，强制 `credentials: 'omit'` 与 `cache: 'no-store'` |
| `src/electron/limits/outboundFetch.js` | `createOutboundFetch`, `resolveProxyConfig` | 备用出站传输：在配置显式代理环境变量（`HTTP_PROXY` 等）时回退至 Node 原生代理栈 |
| `src/electron/limits/statsPresentation.js` | `presentLimitsStats` | 数据表现装配：将底座聚合统计转化为桌面悬浮气泡、托盘和多窗口适用的渲染载荷 |
| `src/electron/providers/claude/webFetch.js` | `createClaudeWebFetch` | Claude 专用网络层：基于 Electron `net.request` 捕获 Set-Cookie，处理会话热更新 |
| `src/electron/providers/antigravity/oauthLogin.js` | `runAntigravityOAuthLogin` | Antigravity OAuth 登录：主进程临时 Loopback HTTP 伺服器，配合 PKCE 与系统浏览器登录 |
| `src/electron/providers/codex/accountControl.js` | `createCodexAccountController` | Codex 账号切换：多账号选择下拉浮层状态与会话快速切换管理器 |
| `src/electron/providers/codex/resetForecast.js` | `fetchCodexResetForecast` | 外部预测集成：向第三方服务获取全网 Codex 额度重置预测与状态广播 |
| `src/electron/providers/mimo/accountMetadata.js` | `createMimoAccountMetadataReader` | MiMo 账号特征感知：基于 SQLite WAL 文件状态戳秒级检测多账号切换，避免昂贵的完整查询 |
| `src/electron/providers/mimo/exchangeFetch.js` | `createMimoExchangeFetch` | MiMo 认证流网络层：基于 PAC 代理路由与 Undici，避免 Chromium 拦截手动重定向跳转 |
| `src/electron/providers/workbuddy/localAuth.js` | `readWorkbuddyLocalSession` | WorkBuddy 本地鉴权：读取桌面客户端 `workbuddy-desktop.info`，安全识别 `$wbEncrypted` 密文信封 |
| `src/electron/renderer/limits/accountPanels.js` | `renderAccountPanel` | 动态表单渲染引擎：根据主进程生成的表单 DTO 渲染标准密码框、选择框与说明链接 |
| `src/electron/renderer/limits/windowsView.js` | `renderWindowsView`, `tagUsageItem` | 配额视图渲染：挂载 `limitUsageItemId`，驱动卡片条目隐藏与金额/百分比混合排版 |
| `src/electron/renderer/limits/providerPresentation.js` | `CAPABILITY_TAGS`, `PROVIDER_SOURCE_LABELS` | 表现层元数据：Provider 功能标签（如支持多账号、支持重置预测）与数据来源文本映射 |

---

## 数据流

```
[触发源: 间隔定时器(interval) / 重置边界(reset-boundary) / 自适应燃尽率(burn-rate) / 凭据变更 / 手动点击]
                                           │
                                           ▼ (本地 Token 用量更新绝对不触发此处!)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ src/shared/limits/runtime.js : LimitsRuntime.refresh(scope, reason)                    │
│                                                                                        │
│ 1. 理由过滤: 检查 reason 是否属于 COOLDOWN_BYPASS_REASONS (注意: 严格排除 burn-rate!)    │
│ 2. 泳道分配: 按 providerId 划分独立 Lane; 若已有在途请求且 scope 相同，触发 Latest-Wins│
│ 3. 退避校验: 若处于退避冷却且未绕过，进入 scheduleRetryTimer(lane)，拒绝无意义穿透       │
│ 4. 并发控制: 排队进入信号量池 (默认上限 DEFAULT_LIMITS_MAX_CONCURRENCY = 3)             │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ src/shared/limits/collector.js : probeLimitProvider(provider, options)                 │
│                                                                                        │
│ 1. 凭据与传输组装:                                                                      │
│    ├─ 主进程内存/系统凭据库 (Windows Credential Manager / credentials.json)            │
│    └─ 注入传输器: src/electron/limits/fetch.js : createElectronLimitsFetch()           │
│         ├─ 剥除 Host 标头 (避免 Chromium net::ERR_INVALID_ARGUMENT 崩溃)                │
│         ├─ 强制 credentials: 'omit' (防止全局 Cookie Jar 污染 Provider 显式 Cookie)   │
│         └─ 强制 cache: 'no-store' (防止 HTTP 缓存响应陈旧配额)                          │
│ 2. 调用 Provider 探针: LIMIT_PROVIDER_REGISTRY[id].limits.fetchLimits()                │
│    └─ (若为 Claude: 经 koffi / advapi32.dll CredReadW 读取 Windows 系统凭据)           │
│ 3. 结果规范化: src/shared/limits/core.js : normalizeLimitProvider()                   │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ src/shared/usage/deviceState.js : updateLimits(summary)                                │
│                                                                                        │
│ 1. 保留 lastGood / lastAttempt 状态，更新 DeviceState                                  │
│ 2. 调度下游计时器: scheduleUrgencyTimer (burnRate.js) & scheduleResetTimer (reset.js) │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 渲染层通知与脱敏投影                                                                    │
│                                                                                        │
│ 1. 主进程设置广播: src/electron/main.js : pushSettingsToRenderer()                      │
│    ├─ 脱敏过滤: credentialSettingsForRenderer(settings, { expose: ['hubHostSecret'] }) │
│    ├─ 表单 DTO: limitAccountFormsForRenderer() (仅传递 set/空标记与输入框元数据)       │
│    └─ 状态投影: accountStatusProjection() (派生 *Configured / *Source 状态)            │
│ 2. 渲染器渲染:                                                                         │
│    ├─ 表单呈现: src/electron/renderer/limits/accountPanels.js (纯 DTO 驱动，零密码接触)│
│    └─ 配额呈现: src/shared/limits/balanceDisplay.js                                    │
│         ├─ 依据 window.metric === 'credits' 渲染货币符号与余额 (不查 Provider 白名单) │
│         └─ 计算 creditsMeterPercent 用于前端进度条 (纯 Display 衍生，绝不写入 Wire)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 关键机制

### 1. 四层分层体系与边界原则

本仓库限额体系严格划分为四层，边界分明：

1. **同构业务核心 (`src/shared/limits/**`)**：
   - 包含运行时状态机（`runtime.js`）、并发采集器（`collector.js`）、账号声明索引（`accounts.js`）、动态绑定注册表（`registry.js`）、自适应速率计算（`burnRate.js`）、余额计算展示（`balanceDisplay.js`）等。
   - 完全与环境解耦，可在 Electron 主进程、独立 Node Hub、Headless Agent 或 Cloudflare Worker 中同构运行。
   - 严禁引入任何 `electron`、`window`、DOM API 或 Node 特有原生模块（如 `fs`、`net`、`node:sqlite`）。

2. **桌面宿主适配层 (`src/electron/limits/**`)**：
   - 包含主进程设置与凭据桥接（`accountSettings.js`）、凭据存储 IPC 处理（`credentialCommands.js`）、Chromium 出站网络适配（`fetch.js`）等。
   - 负责桌面宿主与共享逻辑的装配，抹平 Chromium 网络栈与 OS 代理配置。

3. **平台与供应商特权扩展 (`src/electron/providers/**`)**：
   - 隔离各 Provider 无法跨端同构的特权逻辑。
   - `antigravity/oauthLogin.js`：主进程内建 Loopback HTTP 伺服器，配合系统浏览器与 PKCE 完成 Google OAuth 授权流。
   - `claude/webFetch.js`：基于 Electron `net.request` 捕获 Set-Cookie 实现会话热更新；配合 `advapi32.dll` 访问 Windows Credential Manager。
   - `codex/accountControl.js`：多账号下拉浮层生命周期控制器。
   - `codex/resetForecast.js`：第三方重置预测数据源定时抓取与本地缓存。
   - `mimo/accountMetadata.js` & `exchangeFetch.js`：基于 SQLite WAL 文件元数据变更探测多账号，使用 Undici 遵循系统 PAC 代理路线规避 Chromium 拦截重定向。
   - `workbuddy/localAuth.js`：本地会话文件（`workbuddy-desktop.info`）解析与密文信封（`$wbEncrypted`）安全探测。

4. **无状态前端展现层 (`src/electron/renderer/limits/**`)**：
   - 包含动态表单引擎（`accountPanels.js`）、面板外壳（`accountShell.js`）、配额卡片与窗口视图（`windowsView.js`）。
   - 严禁执行原始网络请求，严禁触碰任何明文密码，仅消费主进程传递的脱敏 DTO。

### 2. LimitsRuntime 调度体系与刷新触发规则

限额采集绝不能被当作 Token 用量监控的副产物：

- **正交隔离原则（Tripwire）**：
  - 本地 Token 用量（`tokscale`）**永不**触发限额刷新！
  - 原因：客户端 Token 经常打向第三方代理端点或自定义 Key，而配额则由网页端、多设备、团队成员消耗，两者的变化速度与归属无必然相关；将本地用量与限额刷新绑定会导致无效打爆接口与极短时间内触发 429。

- **合法的刷新触发源**：
  - **周期轮询 (`interval`)**：`scheduleInterval()` 按用户设置的 `limitsRefreshMs` 规律轮询。
  - **重置边界对齐 (`reset-boundary`)**：`scheduleResetTimer()` 通过 `nextLimitsResetBoundary()` 精准捕捉配额重置时钟，在窗口清零瞬间精准安排单 Provider 刷新。
  - **自适应燃尽率 (`burn-rate`)**：`scheduleUrgencyTimer()` 通过 `nextLimitsUrgencyRefresh()` 在配额高速消耗时加速采集，避免临界耗尽感知迟钝。
  - **凭据与配置变更 (`credential-save`, `settings-change`, `login`, `account-added`)**：用户在设置面板主动修改配置。
  - **手动刷新 (`manual`)**：用户在 UI 点击刷新按钮。

- **`COOLDOWN_BYPASS_REASONS` 铁律**：
  - 在 `src/shared/limits/runtime.js:COOLDOWN_BYPASS_REASONS` 中，**绝对不允许包含 `'burn-rate'`**。
  - 原因：若某个 Provider 已经遇到 429 限流或网络故障正在执行指数退避（`lane.retryNotBefore > now()`），急迫的燃尽率决不能冲垮重试冷却，必须老老实实执行退避；只有用户明确主动干预（保存新凭据、切账号、手动点击）才能绕过冷却。

### 3. 凭据隔离存储与动态推导机制

仓库实行极致的凭据防泄漏与去中心化声明：

- **单文件受控存储，绝不建专属 Store**：
  - 所有账号密码、Cookie、Token 均统一存放在单一受限文件 `userData/credentials.json` 中（POSIX 权限 `0600`，Windows 设独立 ACL）。
  - 绝对不为单个 Provider 新建单独的存储文件，避免文件碎片与安全盲区。

- **`credentialStore.js` 绝无 Provider 字面量**：
  - `src/shared/credentialStore.js:CREDENTIAL_SETTING_PATHS` 仅硬编码两项系统级 Hub 密钥（`hubHostSecret`, `secret`）。
  - 所有 Provider 字段路径全部通过 `providerCredentialSettingPaths()` 自动扫描各 Provider 的 `account.js` 声明（取其 `field.storePath`）动态聚合而成。

- **Require-Free 叶子节点约束**：
  - 各 Provider 的 `src/shared/providers/<id>/account.js` **必须是 require-free 的纯数据叶子模块**。
  - 斩断循环引用：`credentialStore.js` 依赖 `src/shared/limits/accounts.js`，而 `accounts.js` 依赖所有 `account.js`。若 `account.js` 引入了 `limits.js`，由于 Provider 的 `limits.js` 允许引入 `credentialStore`，将立刻引发致命的循环引用崩溃！因此 Provider 内部的探针通过 `() => require('./limits')` 延迟加载。

- **渲染器 Default-Deny 模型**：
  - `src/electron/main.js:settingsForRenderer()` 对凭据执行严格的“默认拒绝”策略。
  - 通过 `credentialSettingsForRenderer(settings, { expose: ['hubHostSecret', 'secret'] })`，除显式白名单允许两项 Hub 共享字段外，其余所有 Provider 凭据在向渲染器分发时统统置空（`''`）。
  - 前端仅能通过 `accountFieldProjection` 获得布尔/占位状态（如 `'set'`）。

### 4. 多账号支持与 Profile 映射脱敏

部分供应商支持多个环境或多套密钥切换（如 `opencode`, `openrouter`, `thirdparty`）：

- **字段归类为 profiles 模式**：
  - 在 `account.js` 中声明 `kind: 'profiles'` 与 `project: 'redact'`。
  - 存储上统一进入 `credentials.json` 的 `['providers', id, 'profiles']` 路径，保持单 Store 结构。
- **渲染器专项脱敏投影**：
  - 在 `accountSettings.js` 中维护 `PROFILE_REDACTORS`。
  - 对每个 profile 条目逐字段过滤：明文 `apiKey`、`cookie`、`accessToken` 统一被映射为 `'set'` 或 `''`。
  - 非机密元数据（如 `adapter`、`baseUrl`、`userId`、自定义端点路径与币种）正常透传，供前端配置界面回显。

### 5. 探针保存前预校验与凭据原子写入

避免错误凭据破坏既有工作状态：

- **IPC 保存链路 (`src/electron/limits/credentialCommands.js`)**：
  - 前端提交表单触发 `limits:saveCredential` IPC 命令。
  - 主进程并不直接把未检验的字符串持久化入盘，而是先构造 draft 凭据，直接向 Provider 探针发起定向探测。
  - 若探针返回 `unauthorized` 或凭据格式校验不通过，立即中断流程并向前端抛出友好错误提示，原 `credentials.json` 保持完全不变。
- **原子替换提交**：
  - 仅在预检探测返回合规响应（或网络重试状态）后，通过 `persistSettingsAndCredentials()` 以原子文件写入完成持久化，并向所有渲染窗口广播更新。

### 6. Windows 凭据管理器与系统深度接入

- **Windows Credential Manager 读取**：
  - 在 `src/shared/providers/claude/limits.js` 中，Claude Code 会将其认证凭据存入 Windows 系统的凭据保管库。
  - 代码通过 `koffi` 动态链接并加载操作系统的 `advapi32.dll`，声明 `CredReadW` 与 `CredFree` 原生 C 函数，在内存中解析 `CREDENTIALW` 宽字符结构体并解码 UTF-8/UTF-16 凭据 Blob。
  - 全程在主进程完成，绝不拉起系统 UAC 弹窗或弹出钥匙串访问提示。

### 7. Balance 余额配额与展示计算

- **无 Provider 白名单机制**：
  - `src/shared/limits/balanceDisplay.js:isCreditsWindow` 判定窗口是否为资金余额时，**完全基于数据契约 `window.metric === 'credits'`**，不维护任何供应商名称白名单。
  - 收益：解耦架构，新增任何充值计费型供应商只需在自身 Collector 返回 `metric: 'credits'`，整套渲染栈（货币符号、千分位、紧凑数值）自动生效。

- **Display-only 百分比绝不入 Wire 协议**：
  - 充值型账户通常无固定限额上限（无真实总额），`creditsMeterPercent` 采用当月推算起步资金启发式算法：`funds / (funds + observedMonthSpend)`。
  - 该计算数值仅存在于渲染器表现层（用于绘制进度条），**绝对不写入 Wire Device Record 协议**，防止虚构的本地进度条百分比污染多设备同步与服务端存储。

### 8. 自适应燃尽率与重置边界计算

`burnRate.js` 与 `resetBoundary.js` 共同驱动精准而节制的动态轮询：

- **燃尽率感知与衰减窗口 (`burnRate.js`)**：
  - 通过 `createLimitsBurnState()` 维护多点历史采样（`recordLimitsSample`），并在每次计算前调用 `pruneLimitsBurnState()` 自动剔除超过 10 分钟的陈旧样本。
  - 当检测到配额剩余百分比处于低位且下降斜率超过阈值时，`nextLimitsUrgencyRefresh` 缩短刷新间隔至 15~30 秒，确保在额度用尽瞬间提示用户。
- **窗口重置时间边界 (`resetBoundary.js`)**：
  - 针对固定窗口重置型供应商（如 5 小时重置、周重置），通过 `nextLimitsResetBoundary()` 计算目标重置时间戳与本地时钟的差值。
  - 定时器在重置时刻后平滑后移 1~3 秒执行定向探测，防止由于服务器与本地时钟轻微偏斜导致取回重置前的旧额度。

### 9. Electron 网络出站传输规范（Outbound Transport）

在 `src/electron/limits/fetch.js` 与 `src/electron/limits/outboundFetch.js` 中严密守护 Chromium 网络栈：

1. **绝不手动传递 `Host` 标头**：
   - Node 的 undici 可以任意改写 Host，但 Chromium 的 `net.fetch` 对用户手动注入的 `Host` 头会直接抛出 `net::ERR_INVALID_ARGUMENT` 导致调用崩溃（参见 `volcengineLimits.test.js` 对签名去除 Host 头的测试验证）。
2. **强制注入 `credentials: 'omit'`**：
   - Chromium 的 `net.fetch` 发自默认网络 Session。如果不设为 `'omit'`，服务端下发的 `Set-Cookie` 会被自动固化进用户目录的 Cookie Jar 中，随后无情覆盖请求中手动携带的显式 Provider Cookie，导致用户更新凭据后仍永久陷入 401/403 泥潭。
3. **强制注入 `cache: 'no-store'`**：
   - 防止 Chromium 网络缓存将过期的配额响应直接返回给上层调度。
4. **跨域 Referer 路径阻断防御**：
   - Chromium 会以 `net::ERR_BLOCKED_BY_CLIENT` 拦截携带具体 path 的跨域 Referer；Provider 探针出站时严禁传递带敏感路径的跨域 Referer。

### 10. main.js 设置三级归一化与新增限额键

在 `src/electron/main.js` 中，配置项通过三级过滤机制管理：

1. **默认与初始化（`defaultSettings()`）**：
   - 组装全量默认设置，调用 `...initialAccountSettings(process.env)` 动态吸纳所有 Provider 声明的初值。
2. **启动加载与深层合并（`ensureSettingsLoaded()`）**：
   - 读取并解析 `settings.json`，合并默认值，清洗旧版本废弃字段（如 `workbuddyEndpoint`），修正枚举。
3. **运行时 Patch 写入与回推（`applySettingsPatch()`）**：
   - 调用 `normalizeAccountPatch(patch, normalizedPatch)` 剥离 `persist: 'never'` 字段。
   - 通过 `...finalAccountSettings(patch, settings)` 执行规范化回填并持久化。
   - 调用 `pushSettingsToRenderer()`，经 `settingsForRenderer()` 严格脱敏后广播给所有窗口。
   - 前端消费状态均由 `accountFieldProjection` 与 `accountStatusProjection` 统一生成，保证 UI 与主进程数据源强一致。

**新增限额设置键改动路径**：
- **新增 Provider 级凭据/设置**：仅需在 `src/shared/providers/<id>/account.js` 的 `fields` 数组中添加一项声明（定义 `key`, `storePath`, `normalize`, `project`, `envFallback` 等）。系统底层会自动联动 `credentialStore`、`main.js` 的 3 处归一化、IPC 探针与渲染器 DTO，**无需修改 `main.js` 和 `credentialStore.js` 一行代码**！
- **新增全局限额控制键**（如全局新开关）：需在 `main.js`（`defaultSettings` 设置默认值、`applySettingsPatch` 归一化）、`runtimeConfig.js`（暴露键）、`src/shared/limits/collector.js` 或 `runtime.js`（解析逻辑）以及前端 Settings 模板中补充。

---

## 修改场景速查

| 我想改… | 主要动这些文件 | 联动/注意事项 |
|---|---|---|
| 为现有 Provider 增加凭据字段（如 Token / Cookie） | `src/shared/providers/<id>/account.js` | 声明 `storePath` 即可自动进入 `credentials.json`，严禁在 `account.js` 中引入非叶子模块 |
| 接入一个全新的限额 Provider | `src/shared/limits/accounts.js`<br>`src/shared/limits/providers.js`<br>`src/shared/providers/<id>/` | 遵循叶子节点规则，在 `accounts.js` 注册懒加载加载器；探针必须适配 `credentials: 'omit'` |
| 增加多账号 / Profile 配置支持 | `src/shared/providers/<id>/account.js`<br>`src/electron/limits/accountSettings.js` | 声明 `kind: 'profiles'`，并在 `PROFILE_REDACTORS` 中补充对应的敏感字段脱敏函数 |
| 调整限额自适应加速或重试退避逻辑 | `src/shared/limits/runtime.js`<br>`src/shared/limits/burnRate.js`<br>`src/shared/limits/retryPolicy.js` | 严禁将 `burn-rate` 放入 `COOLDOWN_BYPASS_REASONS`；注意维护 `lanes` 状态机 |
| 调整资金余额（Credits）或货币格式展示 | `src/shared/limits/balanceDisplay.js` | 严禁硬编码 Provider 名称；`creditsMeterPercent` 仅用于前端，绝对不可带入 Wire Payload |
| 改造凭据输入与账号设置 UI 交互 | `src/electron/renderer/limits/accountPanels.js`<br>`src/electron/limits/accountSettings.js` | 保持通过 Form DTO 通信；渲染层禁止接触真实 Secret，仅根据 `'set'` 标记渲染占位符 |
| 调整出站网络代理与请求适配行为 | `src/electron/limits/fetch.js`<br>`src/shared/outboundFetch.js` | 牢记不得手工注入 `Host` 标头；保持 `credentials: 'omit'` 与 `cache: 'no-store'` 强约束 |
| 为 Provider 补充多账号切换弹出层交互 | `src/electron/providers/codex/accountControl.js`<br>`src/electron/renderer/limits/accountPanels.js` | 通过受控状态事件同步已选账号，避免多窗口间渲染状态不同步 |
| 接入第三方限额/重置预测数据源 | `src/electron/providers/codex/resetForecast.js` | 必须配置本地 TTL 缓存与网络降级，避免第三方接口故障波及主采集链路 |
| 为 Provider 添加控制台外部链接跳转白名单 | `src/shared/providers/<id>/account.js` | 在声明中添加 `urlPolicy`（指定允许的 `hosts` 与 `pathPrefixes`），规避外部 URL 劫持拦截 |

---

## 陷阱

1. **混淆 Token 用量与限额采集触发源**：绝不可在 `tokscale` 或 `usageRuntime` 的刷新回调中顺手调用 `limitsRuntime.refresh()`！本地用量与在线配额在物理与业务上完全正交，随意联动将导致严重的 429 封禁与资源争抢。
2. **在 `COOLDOWN_BYPASS_REASONS` 中加入 `burn-rate`**：此举为代码踩雷断点（Tripwire）。当 Provider 返回 429 或 5xx 时，即使燃尽率极高，也必须遵守退避计时器，否则会使客户端陷入暴力打桩导致账号直接被封禁。
3. **在 `account.js` 中引入外部模块**：Provider 的 `account.js` 必须是 100% require-free 的纯数据叶子。引入任何外部模块都会在 `credentialStore -> accounts -> account -> limits -> credentialStore` 间触发 Node.js 循环引用死锁。
4. **手动往 Chromium 请求塞入 `Host` 头**：Chromium 的 `net.fetch` 遇到显式设置的 `Host` 头时，会直接抛出 `net::ERR_INVALID_ARGUMENT` 导致调用失败，必须交由底层网络栈按 URL 自动派生。
5. **在 `credentialStore.js` 中手写 Provider 字段字面量**：除 Hub 自身的两对系统密钥外，所有 Provider 路径必须由 `providerCredentialSettingPaths()` 自动派生，禁止破坏通用数据流协议。
6. **让余额进度条推算百分比流入 Wire 协议**：`creditsMeterPercent` 是针对无上限账户的视觉估算算法，绝不能作为真实字段序列化进同步载荷，否则会导致其他端或 Hub 数据校验异常。
7. **为单个 Provider 创建专属 credentials 文件**：违背仓库“集中受控、单一权限隔离”原则，破坏主进程统一的原子写入与权限审计机制。
8. **在 Electron 中对 `redirect: 'manual'` 的误用**：Chromium 网络栈对跨域手动重定向会以 `net::ERR_ABORTED` 强制中止，需要像 MiMo 那样使用 Undici 并搭配 `session.resolveProxy` 才能逐跳检查。
9. **忽略 SQLite WAL 模式下的文件变更**：如 MiMo 等本地数据库，用户切换账号时变更可能仅停留在 `-wal` 文件中，状态探针必须一并统计 WAL 文件的时间戳与尺寸。
10. **在渲染层直接读取或解析真实凭据**：渲染进程在架构设计上被完全排除在凭据授信域之外。任何试图通过 IPC 向渲染器泄露明文 Secret 的改动都会被 Code Review 拦截。

---

## 验证方式

1. **静态代码风格校验**：
   ```bash
   npm run lint
   ```
2. **限额核心与账号体系单元测试**：
   ```bash
   node --test "tests/shared/limits*.test.js"
   node --test "tests/shared/credentialStore.test.js"
   node --test "tests/shared/balanceDisplay.test.js"
   node --test "tests/electron/accountSettings.test.js"
   ```
3. **运行自适应调度与重试策略单测**：
   ```bash
   node --test "tests/shared/limitsRuntime.test.js"
   node --test "tests/shared/limitsBurnRate.test.js"
   node --test "tests/shared/limitsResetBoundary.test.js"
   ```
4. **针对特定出站传输守卫测试（以 Volcengine 签名与 Host 剥离为例）**：
   ```bash
   node --test "tests/shared/volcengineLimits.test.js"
   ```
5. **单步排查凭据隔离与脱敏冒烟验证**：
   ```bash
   # 验证主进程 settingsForRenderer 是否阻断了凭据泄漏
   node -e "const { credentialSettingsForRenderer } = require('./src/shared/credentialStore'); console.log(credentialSettingsForRenderer({ codexApiKey: 'secret' }));"
   # 输出应为: { codexApiKey: '', ... }
   ```

# 05 Electron 窗口与前端

## 职责概览

本仓库桌面交互与呈现层基于 Electron 架构构建，完全采用纯原生 HTML/CSS/JavaScript 技术方案，不依赖 Webpack、Vite、Rollup 等前端打包构建链。所有渲染器静态资源均直接由 Electron 从本地文件系统载入并执行。

呈现层的核心使命是向用户提供毫秒级响应、高度贴合操作系统原生视效的 AI 编程用量与额度监控。整体系统划分为三组互相协作的视窗体系：

1. **主窗口 (Main Widget Window)**：
   - 常驻桌面的核心仪表盘，展示当前各 AI 编程工具（Cursor、Claude Code、Codex、GitHub Copilot、OpenCode 等）的时钟级 Token 消耗速率、费用估算、会话明细与配额用尽倒计时。
   - 具备三种形态流转：标准无边框浮窗（Normal）、折叠小气泡（Floating Bubble，贴附屏幕侧缘）、以及系统托盘弹出式视窗（Tray Popover）。
2. **独立仪表盘视窗 (Dashboard Window)**：
   - 专用于长周期趋势对比、明细图表排查、热力图复盘与多设备数据汇总的独立大视窗（920×620）。按需由主窗口或托盘菜单唤出，与主窗口共享同一 Preload 契约与认证上下文，但具有完全独立的渲染 DOM 树与数据管道。
3. **侧边悬浮导轨系统 (Edge Dock)**：
   - 极简、贴附于显示器边缘的常驻交互挂件。它并非单一窗口，而是由三个无边框透明窗口构成的视窗集群（Rail 导轨、Bubble 浮动详情卡片、Peek 贴边唤出把手）。通过主进程运行的高频指针意图状态机协调多窗口的联动显示与平滑贴边。

主进程（`src/electron/main.js`）在此充当全系统的总线与安全守护者：统一调度窗口生命周期、挂载底层平台原生模糊与阴影材质（Windows DWM Acrylic / AccentBlurBehind，macOS Liquid Glass / HUD Vibrancy）、维护窗口尺寸/位置的本地持久化，并通过 Preload 上下文隔离桥向渲染器提供严格受控的白名单 IPC 通信。

---

## 入口与关键文件

### 1. 主进程与视窗基础设施
| 文件 | 关键符号 | 作用 |
|---|---|---|
| `src/electron/main.js` | `createWindow`, `loadWindowFile`, `createDashboardWindow`, `syncEdgeDock`, `saveSettings`, `pushSettingsToRenderer`, `applyZoomFactor` | 主进程核心中枢：管理所有窗口创建、生命周期门禁、IPC 分发、托盘与设置同步 |
| `src/electron/preload.js` | `contextBridge.exposeInMainWorld('tokenMonitor', ...)` | 主窗口与 Dashboard 共享的 IPC 契约桥，暴露受限 API 集合与子命名空间 |
| `src/electron/edgeDock/preload.js` | `contextBridge.exposeInMainWorld('tokenMonitorEdgeDock', ...)` | Edge Dock 专用隔离桥，仅暴露 13 个只读渲染与交互意图上报方法 |
| `src/electron/windowLifecycle.js` | `handoffWindow`, `actionWindowForEvent`, `showWindow` | 窗口交接、事件所属窗口检索及平滑激活策略 |
| `src/electron/windowState.js` | `persistWindowState`, `shouldTrackWindowMaximized` | 窗口普通矩形边界与最大化状态持久化决策 |
| `src/electron/windowBehavior.js` | `normalizeWindowBehaviorSettings` | 主窗口桌面层级与停靠行为控制（floating / normal / desktop 置底） |
| `src/electron/windowShortcut.js` | `normalizeWindowToggleShortcut` | ★ 主进程与设置 UI 共用：负责全局显隐快捷键的规范化与合法性校验 |
| `src/electron/floatingBubble.js` | `canUseFloatingBubble`, `floatingBubbleSide` | 主窗口折叠形态（小气泡）的尺寸约束与贴边停靠判定 |
| `src/electron/tray.js` | `createTray`, `popoverBounds` | 系统托盘图标创建、动态上下文菜单装配与托盘弹窗锚定坐标推算 |
| `src/electron/trayModeSettings.js` | `mainWindowCloseAction`, `normalizeTrayModeSettings` | 托盘运行模式配置清洗与窗口关闭动作分流裁决 |
| `src/electron/windowsChrome.js` | `applyWindowsChrome` | Windows 平台特化：DWM 无边框圆角与边框样式控制 |
| `src/electron/windowsBackdrop.js` | `applyWindowsAccentBlur`, `WINDOWS_BACKDROP_ACCENT` | Windows 平台特化：调用底层非公开接口实现 AccentBlurBehind 与系统 Acrylic 降级 |
| `src/electron/nativeMaterialVisibility.js` | `attachNativeMaterialVisibility`, `applyNativeMaterial` | 平台原生视效材质与窗口显隐状态联动管理 |

### 2. Edge Dock 侧边挂件系统
| 文件 | 关键符号 | 作用 |
|---|---|---|
| `src/electron/edgeDock/controller.js` | `createEdgeDockController`, `createSurface`, `alwaysVisible`, `sync`, `destroyWindows`, `registerIpc` | Edge Dock 主进程控制器：统管 3 个 Surface 窗口池、布局计算、指针轮询与动画驱动 |
| `src/electron/edgeDock/geometry.js` | `EDGE_DOCK_MODES`, `createEdgeDockIntent`, `calculateEdgeDockLayout`, `normalizeEdgeDockMode` | Edge Dock 几何计算、屏幕工作区变换与指针悬停/离开意图状态机 |
| `src/electron/edgeDock/fullScreenProbe.js` | `isFullScreen` | 全屏窗口检测器，驱动 `alwaysExceptFullScreen` 模式退化逻辑 |
| `src/electron/renderer/edgeDock/index.html` | `<svg id="shapeSvg">`, `<div id="content">` | Edge Dock 渲染器入口，根据 URL Query `?surface=peek\|rail\|bubble` 装配外观 |
| `src/electron/renderer/edgeDock/dock.js` | `render`, `renderRail`, `renderBubble`, `renderPeek`, `updateShape` | Edge Dock 绘制核心：实现环形刻度、折叠状态、卡片容器与自重绘调度 |
| `src/electron/renderer/edgeDock/dock.css` | `.rail`, `.bubble`, `.peek`, `.gauge-ring`, `.ring-stroke` | Edge Dock 专用样式表：定义剪裁轮廓、动效贝塞尔曲线与高对比度边框 |
| `src/electron/renderer/edgeDock/presentation.js` | `buildEdgeDockCells` | ★ 主/渲染进程双端共用模块：将度量数据投射为统一的 Cell 布局结构 |
| `src/electron/renderer/edgeDock/items.js` | `normalizeEdgeDockItems`, `DERIVED_PERIODS` | ★ 主/渲染进程双端共用：定义 Edge Dock 显示项持久化规范与衍生周期 |
| `src/electron/renderer/edgeDock/shapes.js` | `createRailCommands`, `createBubbleCommands`, `commandsToPath` | ★ 主/渲染进程双端共用：生成悬浮窗轮廓 SVG 路径及 macOS 原生遮罩指令 |
| `src/electron/renderer/edgeDock/composer.js` | `createEdgeDockComposer` | Edge Dock 项配置编辑器（装载于**主窗口设置页**，Edge Dock 本身不加载） |

### 3. 主窗口与 Dashboard 渲染器核心模块
| 文件 | 关键符号 | 作用 |
|---|---|---|
| `src/electron/renderer/index.html` | `<div class="shell">`, `<header class="titlebar">`, `<div id="settingsPanel">` | 主窗口 UI 结构骨架，按线性依赖顺序引入各视图模块与样式文件 |
| `src/electron/renderer/styles.css` | `.titlebar`, `-webkit-app-region: drag`, `.card`, `.bubble-floating` | 主窗口全量样式：包含原生拖拽区域声明、毛玻璃兼容层与布局样式 |
| `src/electron/renderer/app.js` | `saveSettings`, `signalContentReady`, `setViewState`, `render` | 主窗口渲染逻辑总控：DOM 渲染、定时器刷新、视图路由及设置表单同步 |
| `src/electron/renderer/homeOverview.js` | `renderHomeOverview` | 首页概览卡片渲染（今日用量总计、实时速率折线与关键模型摘要） |
| `src/electron/renderer/usageCharts.js` | `renderUsageCharts`, `drawMiniBarChart` | 用量图表渲染器，负责小时粒度、天粒度的消耗柱状图绘制 |
| `src/electron/renderer/sessionRows.js` | `renderSessionRows`, `formatSessionTime` | 会话明细列表渲染、折叠展开与高亮处理 |
| `src/electron/renderer/limits/windowsView.js` | `renderLimitsWindows`, `updateLimitProgress` | 模型与账号配额窗口视图，驱动 5 小时/周限额倒计时与进度条 |
| `src/electron/renderer/limits/accountShell.js` | `renderAccountShell`, `buildProviderSections` | 提供商多账号切换与凭据管理面板容器 |
| `src/electron/renderer/clientStatusPresentation.js`| `renderClientStatusList`, `clientStatusBadge` | 各 AI 客户端进程存活、探针连通性与健康状态指示组件 |
| `src/electron/renderer/themePresets.js` | `applyThemePreset`, `THEME_PRESETS` | 颜色主题预设管理器，控制纯黑、透明、毛玻璃等调色板 |
| `src/electron/renderer/customPricingForm.js` | `renderCustomPricingForm` | 自定义模型单价配置表单与计费规则校验器 |
| `src/electron/renderer/i18n.js` | `t`, `applyI18nToSubtree`, `normalizeLanguage` | 纯前端轻量多语言词典与文案替换引擎 |
| `src/electron/renderer/dashboard.html` | `<div class="dashboard-shell">`, `<div id="heatmapGrid">` | 独立 Dashboard 窗口的骨架 |
| `src/electron/renderer/dashboard.js` | `dashboard:ready`, `initDashboard`, `renderHistory` | Dashboard 趋势图、热力图与跨周期对比绘制逻辑 |
| `src/electron/renderer/syncDevicePanel.js` | `renderSyncDevicePanel` | 多设备协同同步面板与 Hub 设备配对视图 |
| `src/electron/renderer/helpPopover.js` | `initHelpPopover`, `showHelp` | 渲染器上下文帮助弹窗与指标解释浮层 |

### 4. 辅助与平台视效模块
| 文件 | 关键符号 | 作用 |
|---|---|---|
| `src/electron/shared/macSystemRequirements.js` | `macWidgetRuntimeSupport` | 平台要求校验，判定是否支持 macOS Widget 与特定 DWM 视效 |
| `src/electron/deferredWindowSend.js` | `sendWhenReady` | 窗口就绪前排队消息发送器，防止窗口未加载完成时 IPC 推送丢失 |
| `src/electron/renderer/clientHealthPresentation.js` | `formatHealthState`, `buildHealthTooltip` | 探针健康度指标展示与错误提示浮层 |
| `src/electron/renderer/wslStatusPresentation.js` | `renderWslStatus`, `checkWslAvailability` | WSL 环境子系统连通性与 SQLite 数据源状态呈现 |
| `src/electron/renderer/overflowText.js` | `fitText`, `truncateWithEllipsis` | 长文本（模型名、会话标题）在紧凑卡片内的自适应省略与 Tooltip |
| `src/electron/renderer/selectControl.js` | `initCustomSelect`, `renderSelectMenu` | 原生下拉菜单替代组件，适配无边框毛玻璃暗黑样式 |
| `src/electron/renderer/homeModulePreferences.js` | `normalizeHomeModules`, `isModuleVisible` | 首页模块卡片自定义显隐与排版顺序偏好管理 |
| `src/electron/renderer/tokenRatePresentation.js` | `formatTokenRate`, `formatCostRate` | 动态 Token 消耗速率格式化与单位换算器 |

---

## 数据流

### 1. 设置系统生命周期流转 (Settings Persistence & Pushback)

```
[ 用户在设置面板操作 (app.js) ]
                │
                ▼  调用 app.js: saveSettings(patch)
[ Preload 上下文隔离桥 ] (src/electron/preload.js)
                │  window.tokenMonitor.updateSettings(patch)
                ▼  ipcRenderer.invoke('settings:update', patch)
┌────────────────────────────────────────────────────────────────────────┐
│ main.js: ipcMain.handle('settings:update', (event, patch) => { ... })  │
│  ├─ 第 3 处 normalize: 校验清洗字段 (main.js:7598-7625)                 │
│  ├─ saveSettings({ throwOnError: true })                                │
│  │    └─ persistSettingsAndCredentials() ──► 写入 userData/settings.json│
│  ├─ applyWindowSettings() / configureWindowToggleShortcut()            │
│  └─ pushSettingsToRenderer()                                           │
└───────────────┬──────────────────────────┬─────────────────────────────┘
                │                          │
        (主窗口 & Dashboard)         (Edge Dock 控制器)
                │                          │
                ▼                          ▼
    webContents.send('settings:push')   syncEdgeDock(payload)
                │                          │
        ┌───────┴────────┐                 ▼
        │                │         controller.setAppearance(...)
        ▼                ▼         controller.sync()
    (app.js)       (dashboard.js)          │
  重新渲染表单     刷新汇率与配置          ▼
                                   windows[surface].webContents.send('edgeDock:render')
                                           │
                                           ▼
                                   (dock.js: 动态刷新重绘)
```

### 2. 窗口启动与显示门禁时序 (Window Reveal & ContentReady Gate)

```
main.js: createWindow()
   │
   ├─ new BrowserWindow({ show: false, transparent: true, frame: false ... })
   ├─ loadWindowFile(win, { waitForContent: true })
   │    ├─ 注册 ipcMain 监听 'window:contentReady'
   │    └─ 启动 2500ms 兜底计时器 fallbackTimer
   │
   ▼  win.loadFile('renderer/index.html')
(渲染进程 app.js 启动，加载 DOM 并完成首屏数据请求与绘制)
   │
   ▼  window.tokenMonitor.signalContentReady()
(通过 Preload 触发主进程的 'window:contentReady')
   │
   ▼
main.js: revealWindow(win) ──► win.show() / win.focus() (杜绝首屏白屏与数字跳变)
```

### 3. Edge Dock 指针轮询与三表面渲染联动 (Edge Dock Event Loop)

```
[ 操作系统鼠标移动 ]
        │
        ▼  每 16~100ms 轮询 (controller.js: pollTimer)
[ edgeDock/geometry.js: createEdgeDockIntent().tick(input) ]
        │
        ├─ 状态转移：peekNear ──► revealed ──► candidate ──► pinned
        ▼
[ controller.js: applyEffects() ]
        │
        ├─ 布局换算：calculateEdgeDockLayout(metrics, side, offset)
        ├─ 表面显隐与层级：
        │    ├─ windows.peek.setBounds(...)   (贴边触手/刷新按钮)
        │    ├─ windows.rail.setBounds(...)   (垂直核心导轨)
        │    └─ windows.bubble.setBounds(...) (悬浮展开卡片)
        ▼
[ windows[surface].send('edgeDock:render', payload) ]
        │
        ▼
(renderer/edgeDock/dock.js)
        ├─ shapes.js: 生成切角/肩部轮廓 SVG Path
        ├─ presentation.js: 组装环形刻度节点 ringNode
        └─ window.tokenMonitorEdgeDock.reportBubbleSize(...) (自适应卡片高度回传)
```

---

## 关键机制

### 1. 主窗口生命周期、形态与显示门禁
- **创建与几何初始约束**：
  - `main.js:createWindow(boundsOverride, options)` 是主窗口唯一的创建工厂。
  - 窗口属性声明为 `frame: false`、`transparent: true`（Windows 开启亚克力时作特殊适配）、`show: false`、`skipTaskbar: false`。
  - 基础尺寸由静态常量 `DEFAULT_WINDOW`（340×650）与 `WINDOW_LIMITS`（宽 240~1200，高 140~1400）约束。
  - 启动时通过 `restoredBounds()` 读取持久化的坐标与宽高，并调用 `isBoundsOnScreen()` 校验坐标是否位于当前可用屏幕工作区（`workArea`）内，防止拔除外接显示器后窗口遗留在不可见区域。
- **内容就绪门禁 (ContentReady Gate)**：
  - 在 `loadWindowFile()` 中，窗口创建后并不会立刻调用 `win.show()`。因为冷启动时静态 HTML 显示全 0 默认数据，直接展现会造成空白闪烁与数值剧烈跳动。
  - 主进程默认配置 `waitForContent: true`，监听 `window:contentReady` IPC 信号。
  - 渲染进程 `app.js` 完成初次异步统计计算与首屏绘制后，显式调用 `window.tokenMonitor.signalContentReady()`。
  - 主进程收到信号后执行 `revealWindow()` 展现并前置窗口。
  - 为了防止渲染进程脚本报错或网络阻塞导致死锁，主进程设立了 **2500ms 强制兜底计时器**（`fallbackTimer`），超时后无条件调用 `reveal()` 展现。
- **关闭行为分流决策**：
  - 窗口关闭事件 `win.on('close')` 由 `trayModeSettings.js:mainWindowCloseAction()` 根据运行模式动态分流：
    1. `trayMode === true`（托盘常驻模式）：阻止默认关闭，执行 `hidePopover()`（隐藏托盘弹窗并回收激活态）；
    2. `showTrayIcon === true`（普通托盘共存模式）：阻止默认关闭，执行 `win.hide()`（保持后台托盘常驻）；
    3. 纯窗口模式：放行标准销毁。在 `win.on('closed')` 中，若检测到除 Edge Dock 附属窗口外已无其他真实业务窗口，立刻执行 `app.quit()`。
- **缩放与边界防抖持久化**：
  - 缩放通过 `handleZoomShortcut()` 拦截 `before-input-event`：支持 Ctrl/Cmd 配合 `+` / `-` / `0`，调用 `adjustZoom()`，范围被 `clampZoom()` 严格钳位在 `[0.7, 1.6]` 之间（步幅 0.1）。
  - 窗口移动与尺寸拖拽（`resized`、`moved` 事件）由 400ms 防抖计时器 `persistBoundsSoon()` 处理后写入 `settings.json`。托盘模式下仅保存宽高，因为坐标每次均动态吸附托盘图标位置。
- **折叠小气泡形态 (Floating Bubble)**：
  - 用户按下 `Esc` 或双击标题栏折叠按钮时，调用 `maybeCollapseFloatingBubble()`。
  - 主进程通过 `replaceMainWindow()` 重新初始化微型几何边界（如 72×72），移除最大化能力并设置 `skipTaskbar: true`；鼠标悬停或点击时重新展开。

### 2. 独立 Dashboard 窗口体系与严苛门禁
- **按需延迟创建**：
  - 独立分析窗口通过 `createDashboardWindow()` 按需实例化，标准尺寸为 920×620（最小 560×420）。
  - 若已存在未销毁实例，直接执行 `hide()` 并触发 `webContents.reload()` 重新请求全量历史。
- **无时间兜底的就绪信号**：
  - 与主窗口不同，Dashboard 窗口**绝无 2.5s 强制兜底显示计时器**。
  - 必须由前端 `dashboard.js` 完全计算好图表数据并触发 `window.tokenMonitor.dashboard.ready()`，主进程收到 `dashboard:ready` 后才执行 `win.show()`。
  - 这一机制确保了长达数月的历史用量热力图在渲染成型前绝不对外展示。
- **崩溃与异常处置**：
  - 注册 `did-fail-load`、`render-process-gone` 和 `unresponsive` 事件。
  - 一旦发生加载失败或卡死，调用 `discardFailedDashboardWindow()` 彻底销毁窗口实例并重置句柄，防止脏状态留存影响下一次打开。

### 3. Edge Dock 三表面 (Surfaces) 物理模型与三模式状态机
- **三表面 (Surfaces) 独立窗口池**：
  - `rail`（垂直导轨）：常驻或悬停外露的贴边竖条，展示各 Provider 用量进度与环形彩色刻度。
  - `bubble`（浮动详情卡片）：鼠标悬停在特定 Cell 上时从导轨侧方滑出的卡片容器，呈现明细、快捷切换账号及重置预测。
  - `peek`（贴边唤出触手）：收起状态下露出的微型把手，供用户感知停靠位置并引导演示。
  - 三个表面在主进程中分别是独立的 `BrowserWindow` 实例，共用 `renderer/edgeDock/index.html` 骨架，通过 URL Query 参数 `?surface=peek|rail|bubble` 在前端实现分支渲染。
  - 所有表面均声明 `focusable: false`，避免掠夺前台代码编辑器的键盘焦点。
- **三种工作模式差异**：
  - `always`：导轨永久吸附并外露，不随鼠标移开而收起；只有详情卡片执行悬停进出。
  - `alwaysExceptFullScreen`：常态下表现同 `always`。由 `fullScreenProbe.js`（以 500ms 为间隔轮询前台活动窗口）检测全屏应用，若检测到用户处于全屏开发、观影或游戏，自动临时降级为 `autoHide`，避免视觉遮挡。
  - `autoHide`：导轨平时完全隐入屏幕边缘，仅保留微型 Peek 触手；当鼠标移动进入屏幕边缘触碰区（Dwell），导轨滑出，鼠标移开后自动缩回。

### 4. Edge Dock 渲染器分工与双端共用模块 (★)
- **渲染器文件职能划分**：
  - `dock.js` / `dock.css`：挂件绘制主引擎，负责各 surface 的 DOM 结构更新、动画类名控制与自重绘调度（`scheduleSelfRepaint`）。
  - `presentation.js` (★)：**双端共用模块**。核心函数 `buildEdgeDockCells()` 根据最新用量与限额投射出单元格数组。主进程借此计算碰撞盒与悬停目标，渲染进程据此渲染完全相同的图形。
  - `items.js` (★)：**双端共用模块**。定义 Dock 项持久化结构 `edgeDockItems`，处理新增/删除项的规范化（`normalizeEdgeDockItems`）。
  - `shapes.js` (★)：**双端共用模块**。定义切角轮廓路径命令，在渲染端转为 SVG Path，在 macOS 端供主进程光栅化为原生毛玻璃遮罩。
  - `composer.js`：Dock 项内容拖拽排序与开关配置器。**此组件挂载于主窗口的设置选项卡内**（由 `renderer/index.html` 加载），Edge Dock 挂件本身绝不加载该文件。

### 5. 设置系统持久化与三处归一化 (Triple Normalization)
在 TokeX 中，所有持久化配置项（尤其是 `edgeDock*` 系列共 13 个键值）必须在三处保持严格同步的归一化与防御性清洗，遗漏任一处都会引发状态不一致：

| 设置键名 | 类型 | 默认值 | 作用与含义 |
|---|---|---|---|
| `edgeDockEnabled` | boolean | `false` | Edge Dock 功能总开关 |
| `edgeDockMode` | string | `'autoHide'` | 停靠模式：`autoHide` / `always` / `alwaysExceptFullScreen` |
| `edgeDockSide` | string | `'left'` | 停靠屏幕侧边：`left` 或 `right` |
| `edgeDockOffset` | number | `50` | 垂直方向屏幕高度百分比偏移 (0-100) |
| `edgeDockDisplayId` | string | `''` | 绑定的目标物理显示器 ID（多屏环境） |
| `edgeDockSize` | string | `'medium'` | 尺寸规格预设：`small` / `medium` / `large` |
| `edgeDockCustomScale` | number | `1.0` | 自定义视窗缩放比例 (0.7 - 1.5) |
| `edgeDockMacBackdrop` | string | `'inherit'` | macOS 原生背景材质：`inherit` / `hud` / `none` |
| `edgeDockHaptic` | boolean | `true` | macOS 触控板触觉反馈震动开关 |
| `edgeDockWarnColors` | boolean | `false` | 当额度告警时是否启用强对比警告色 |
| `edgeDockRefreshEnabled` | boolean | `false` | 是否允许直接在导轨把手上点击刷新限额 |
| `edgeDockRunningIndicatorEnabled` | boolean | `true` | 是否在导轨单元格显示实时活跃脉冲指示 |
| `edgeDockItems` | array/null| `null` | 用户自定义排序和挑选的项目列表（null 时自动生成） |

- **三处必须同步的归一化代码点**：
  1. **默认值定义处**：`src/electron/main.js:604-616`（`defaultSettings()` 静态字典声明）。
  2. **磁盘加载合并处**：`src/electron/main.js:2638-2655`（`ensureSettingsLoaded()` 中读取本地 `settings.json`，执行合并与越界纠偏）。
  3. **IPC 回推归一化处**：`src/electron/main.js:7598-7625`（`settings:update` 通道处理前端提交的 patch，清洗字段后存盘并回推）。
- **Edge Dock 改动回推闭环**：
  - 用户在主窗口设置页修改 Dock 配置，触发 `app.js:saveSettings()`；若从托盘菜单快速切换则进入 `setEdgeDockFromMenu()`。
  - 配置写入磁盘后，主进程执行 `pushSettingsToRenderer()`，向主窗口与 Dashboard 广播 `settings:push`。
  - 紧接着主进程执行 `syncEdgeDock()`，触发控制器重新计算几何边界（`controller.sync()`），并通过 `windows[surface].webContents.send('edgeDock:render')` 将重绘事件推送给各 Dock 窗口。

### 6. IPC Bridge 契约清单与隔离规范
Preload 作为安全边界阻断了 Node.js 模块向渲染器的泄露。暴露的方法名均为外部契约，**严禁随意重命名**：

#### A. 主窗口 Bridge (`window.tokenMonitor`)
| 方法 / 属性 | IPC 频道 | 类型 | 作用 |
|---|---|---|---|
| `getSettings()` | `settings:get` | invoke | 读取已脱敏的当前全局设置 |
| `updateSettings(patch)` | `settings:update` | invoke | 提交设置增量更新并触发持久化 |
| `saveSubscriptions(subs, base)` | `subscriptions:save` | invoke | 跨设备云端/Hub 订阅列表保存 |
| `adoptOrphanedSubscriptions()` | `subscriptions:adoptOrphans` | invoke | 采纳单机孤儿订阅记录 |
| `getAppInfo()` | `app:getInfo` | invoke | 获取应用名称、版本、构建标记 |
| `getStats(options)` | `stats:get` | invoke | 获取全量用量、配额与健康度统计数据 |
| `getAllTimeSessions(id)` | `stats:allTimeSessions` | invoke | 分页加载历史归档全量会话 |
| `getSessionDetail(args)` | `session:getDetail` | invoke | 加载单个会话完整消息流与统计 |
| `getStreamStatus()` | `stream:status` | invoke | 查询 Hub 或本地 Collector 实时轮询流健康状态 |
| `previewAppearance(patch)` | `appearance:preview` | invoke | 实时预览主题、透明度、背景材质 |
| `minimize()` / `close()` | `window:minimize` / `close` | send | 触发原生最小化或关闭分流动作 |
| `signalContentReady()` | `window:contentReady` | send | 通知主进程首屏绘制完成，解锁显示门禁 |
| `setViewState(patch)` | `window:viewState` | send | 上报当前激活的选项卡视图 ID |
| `openDashboard()` | `dashboard:open` | invoke | 唤出或聚焦独立分析仪表盘窗口 |
| `onStatsPush(cb)` | `stats:push` | listen | 订阅来自本地或 Hub 的后台用量增量更新 |
| `onSettingsPush(cb)` | `settings:push` | listen | 订阅外部（如托盘菜单）触发的设置改动 |
| `onWindowVisibilityPush(cb)` | `window:visibility` | listen | 监听窗口物理可见性变化以启停渲染定时器 |

#### B. 主窗口提供商子命名空间
| 子命名空间 | 关键方法 | 作用 |
|---|---|---|
| `antigravity` | `accounts`, `addAccount`, `cancelLogin`, `removeAccount`, `setAccountEnabled`, `onAccounts` | Google Antigravity 登录授权与账号轮询 |
| `mimo` | `accounts`, `addAccount`, `openConsole`, `removeAccount`, `setAccountEnabled` | Xiaomi MiMo 模型配额与控制台联动 |
| `cursor` | `loginManual`, `setAccountEnabled`, `logout`, `status` | Cursor 本地凭据探测与 Cookie 手动注入 |
| `limits` | `saveCredential`, `listOrganizationChoices`, `clearCredential` | 机构配额凭据管理与选择器 |
| `opencode` | `saveCookie`, `logout`, `status`, `getProfiles`, `saveProfile`, `deleteProfile`, `setProfileEnabled` | OpenCode 配置文件与 Cookie 授权 |
| `openrouter` / `thirdparty` | `getProfiles`, `saveProfile`, `deleteProfile`, `setProfileEnabled` | 自定义三方 OpenAI-compatible 端点管理 |
| `codex` | `accounts`, `addAccount`, `selectWorkspace`, `switchSystemAccount`, `refreshAccountLimits`, `onActiveAccount` | OpenAI Codex 多账号与工作区配额切换 |
| `copilot` | `signIn`, `cancelSignIn`, `onLoginStatus` | GitHub Copilot 设备码 OAuth 登录流程 |

#### C. Edge Dock 专用 Bridge (`window.tokenMonitorEdgeDock`)
| 方法名 | 对应 IPC 频道 | 方式 | 作用与参数说明 |
|---|---|---|---|
| `ready()` | `edgeDock:ready` | send | 告知主进程该 Surface DOM 树已装配完成 |
| `click(cellIndex)` | `edgeDock:click` | send | 点击导轨指定单元格，触发详情卡片常驻或展开 |
| `pointer()` | `edgeDock:pointer` | send | 触发指针活跃探测，通知控制器重置闲置计时 |
| `dragStart(grabOffsetY)` | `edgeDock:dragStart` | send | 启动垂直位置拖拽吸附操作 |
| `dragEnd()` | `edgeDock:dragEnd` | send | 结束拖拽，吸附至最近合法锚点并持久化 offset |
| `reportBubbleSize(id, h)` | `edgeDock:bubbleSize` | send | 上报详情卡片内容真实渲染高度，调整窗口 bounds |
| `dismiss()` | `edgeDock:dismiss` | send | 主动收起详情卡片与导轨 |
| `toggleRateMode()` | `edgeDock:toggleRateMode` | send | 切换 Token 消耗速率显示维度（Tokens/min 或 $/h） |
| `refreshLimits()` | `edgeDock:refreshLimits` | invoke | 立即对当前选中的 Provider 触发限额接口拉取 |
| `peekPainted(m, k)` | `edgeDock:peekPainted` | send | 上报 Peek 触手图形已绘制就绪 |
| `switchCodexAccount(accId)` | `edgeDock:switchCodexAccount`| invoke | 悬浮窗内直接触发 Codex 账号热切换 |
| `openResetForecastSource()` | `edgeDock:openResetForecastSource` | send | 请求系统浏览器打开配额重置参考文档网页 |
| `onRender(cb)` | `edgeDock:render` | listen | 核心渲染通道：接收 cells 数组、外观与尺寸更新 |

### 7. 零构建开发循环与热重载操作准则
- **主窗口渲染层修改**：由于无打包器包装，直接修改 `src/electron/renderer/` 下的 HTML、CSS 或 JS 文件后，在聚焦的主窗口中直接按下 `Ctrl+R`（macOS 为 `Cmd+R`）即可瞬间完成热重载。
- **Edge Dock 渲染层修改**：Dock 窗口在创建时均被配置为 `focusable: false`（避免夺取其他前台编辑器焦点），因此无法通过键盘向其发送 `Ctrl+R`；同时也没有挂载重载快捷键。修改 `renderer/edgeDock/` 下的文件后，**必须在设置界面或托盘菜单中将 Edge Dock 关闭并重新打开**。该操作会触发 `controller.stop()` 销毁全部 Surface 窗口（`destroyWindows()`），并在重新开启时通过 `buildWindows()` 重新从磁盘载入最新静态文件。
- **主进程代码修改**：凡修改 `src/electron/main.js`、`controller.js`、`geometry.js` 等主进程文件，由于 Node.js 内存模块缓存机制，均需退出应用并在命令行重新执行 `npm start`。
- **DevTools 调试技巧**：主窗口默认无菜单栏，调试时可在 `main.js:7050` 调用 `win.webContents.openDevTools({ mode: 'detach' })`；对于 Edge Dock 的无焦点窗口，可在 `controller.js:560` 的 `createSurface()` 中添加 `surfaceWin.webContents.openDevTools({ mode: 'detach' })` 独立唤出控制台。
- **静态资源相对路径约束**：由于窗口通过 `win.loadFile('renderer/index.html')` 载入，HTML 内部所有资源引用（`<script src="...">`、`<link href="...">`）必须严格采用相对路径（`./` 或子目录），严禁使用绝对路径（如 `/styles.css`），否则在打包生产 asar 镜像后会引发 404 模块丢失。

### 8. 辅助机制概览
- **系统托盘运行模式与弹窗锚定 (`src/electron/tray.js` & `trayModeSettings.js`)**：
  - 维护托盘右键菜单、高分屏图标自适应及左键/双击行为。
  - 在开启 `trayMode` 时，主窗口尺寸重算并吸附至托盘图标物理坐标旁，化身为系统托盘 Popover。
- **全局快捷键注册与防冲突 (`src/electron/windowShortcut.js` & `main.js:6021`)**：
  - 解析配置中的快捷键字符串，通过 Electron `globalShortcut.register` 向底层 OS 注册热键，实现全局快速唤起或隐藏主窗口。
- **客户端轻量级多语言体系 (`src/electron/renderer/i18n.js`)**：
  - 采用无外部依赖的字典查找引擎，支持中/英/日等语言热切换，通过 `applyI18nToSubtree` 递归更新 DOM 节点的文本与属性。
- **macOS 小组件扩展桥 (`src/electron/macWidget/`)**：
  - 仅用于 macOS 平台向通知中心和桌面小组件投送用量数据快照与时间线数据；在 Windows 环境下完全不进行初始化。

---

## 修改场景速查

| 我想改… | 主要动这些文件 | 联动/注意事项 |
|---|---|---|
| 主窗口默认尺寸或最小/最大边界 | `src/electron/main.js` (`DEFAULT_WINDOW`, `WINDOW_LIMITS`) | 需同步检查 `restoredBounds()` 的范围校验与 CSS 中的尺寸样式 |
| 主窗口 UI 界面、样式或新卡片 | `src/electron/renderer/index.html`, `styles.css`, `app.js` | 静态引入注意依赖加载顺序；可点击元素必须声明 `-webkit-app-region: no-drag` |
| 增加新的用户设置配置项 | `src/electron/main.js` (3 处 normalize), `app.js:saveSettings` | 必须在默认值、磁盘加载合并、`settings:update` 三处全部配置规范化 |
| 调整 Edge Dock 贴边距离与吸附动画 | `src/electron/edgeDock/geometry.js`, `controller.js` | 状态机代码切勿引入 DOM 操作；修改后运行 `tests/edgeDock/` 测试套件 |
| 修改 Edge Dock 环形图或卡片外观 | `src/electron/renderer/edgeDock/dock.js`, `dock.css` | 修改后需在设置中重启 Edge Dock；验证浅色与深色主题适配 |
| 修改 Edge Dock 单元格投射逻辑 | `src/electron/renderer/edgeDock/presentation.js` | ★ 双端共用模块，主进程依赖其计算命中坐标，渲染器依赖其绘制，改动需验证双端 |
| 调整 Edge Dock 配置编辑器界面 | `src/electron/renderer/edgeDock/composer.js`, `composer.css` | 该文件运行在**主窗口**内，改动后在主窗口设置页按 `Ctrl+R` 即可调试 |
| 新增渲染进程向主进程的调用通道 | `src/electron/preload.js`, `main.js` (ipcMain) | 保持 Context Isolation，禁止向 renderer 暴露 Node 原生模块与敏感凭据 |
| 调整 Windows 端原生亚克力/毛玻璃视效 | `src/electron/windowsBackdrop.js`, `windowsChrome.js` | 验证 Win10/Win11 下 AccentBlurBehind 与系统 Acrylic 的降级与穿透 |
| 调整托盘菜单项与快捷操作 | `src/electron/tray.js`, `trayModeSettings.js` | 确保无真实窗口存在时，托盘退出事件能正确触发应用完全清理 |
| 扩展 Dashboard 统计图表或数据流 | `src/electron/renderer/dashboard.html`, `dashboard.js`, `main.js` | Dashboard 无显示时间兜底，初始化逻辑必须确保能够触发 `dashboard:ready` |
| 修改折叠小气泡的尺寸或动效 | `src/electron/floatingBubble.js`, `main.js:replaceMainWindow`, `styles.css` | 气泡模式下需移除窗口最大化能力，并保持 `skipTaskbar: true` |
| 新增语言支持与文案补全 | `src/electron/renderer/i18n.js` | 增加新 locale 词典映射；确保缺少词条时安全降级至英语原文 |
| 调整会话列表行布局或操作按钮 | `src/electron/renderer/sessionRows.js`, `styles.css` | 保证多行省略（`overflowText.js`）与滚动性能 |
| 调整配额刷新频率或警告阈值 | `src/electron/renderer/limits/windowsView.js`, `main.js` | 注意防抖限制，避免频繁调用底层 CLI 探针导致限流 |
| 调整自定义模型单价表单校验规则 | `src/electron/renderer/customPricingForm.js` | 确保汇率与 Token/Prompt 价格格式合法性验证 |
| 修改首页卡片模块的显隐排版顺序 | `src/electron/renderer/homeModulePreferences.js` | 需与设置页中的拖拽排序联动更新 |
| 为新提供商增加 Preload 命名空间桥 | `src/electron/preload.js`, `main.js` (ipcMain) | 需遵循 Context Isolation 原则，对外暴露受限方法 |
| 开启 DevTools 独立窗口调试 Edge Dock | `src/electron/edgeDock/controller.js:createSurface` | 生产发布前需移除调试调用，避免无焦点窗口弹出悬浮调试器 |

---

## 陷阱

1. **★ 双端共用模块环境隔离陷阱**：`presentation.js`、`items.js`、`shapes.js`、`windowShortcut.js` 同时被 Node.js 主进程与浏览器渲染进程加载。严禁在这些模块中使用 `document`、`window`、`navigator` 等浏览器特有对象，严禁引入 Electron 专有 API，否则会导致主进程在启动或热重载时抛出运行时异常。
2. **设置键 3 处 Normalize 遗漏**：在 `main.js` 中，任何新增配置项必须在 `defaultSettings()`、`ensureSettingsLoaded()`、`ipcMain.handle('settings:update')` 三处同时声明与归一化。若遗漏磁盘加载处，应用重启后新增项会丢失；若遗漏 update 处，前端保存的新值无法持久化。
3. **Edge Dock 附属窗口阻止进程退出**：Edge Dock 的 3 个 Surface 均属于真实的 `BrowserWindow`。若用户关闭主窗口时未对 `edgeDockController?.owns(win)` 进行校验，隐藏在边缘的 Dock 窗口将阻止 Electron 触发 `window-all-closed` 事件，使应用变为无法退出的后台僵尸进程。
4. **Dashboard 窗口严格无兜底门禁**：Dashboard 视窗在创建后处于隐藏状态，必须由前端发出 `dashboard:ready` IPC 事件后才展现。如果前端脚本初始化时发生语法或运行时异常中断，窗口将永久处于不可见状态并在随后被主进程判定超时销毁。
5. **Preload 硬契约命名不可漂移**：`window.tokenMonitor` 和 `window.tokenMonitorEdgeDock` 暴露的所有属性与方法名都是外部强契约。重命名任何方法均会静默破坏调用方代码；新增高危权限方法必须在 Preload 严格收敛。
6. **无边框窗口原生拖拽穿透失效**：在 `styles.css` 中声明 `-webkit-app-region: drag` 的容器上，必须为内部所有的可交互控件（按钮、输入框、Tab 切换项）显式增加 `-webkit-app-region: no-drag`，否则该区域内的所有鼠标点击将被操作系统截获为窗口拖拽。
7. **敏感凭据 Default-Deny 隔离**：渲染进程发起的 `settings:get` 和 `settings:push` 必须经过 `settingsForRenderer()` 清洗脱敏，Token、Secret 等只允许保留在主进程的 CredentialStore 中，不可进入渲染器 DOM。
8. **Edge Dock 无法通过快捷键刷新**：调试 Dock 样式与交互时切勿习惯性按 `Ctrl+R`，因其窗口无焦点导致指令无效。必须通过重新开启 Dock 触发窗口销毁与重建。
9. **Windows 平台毛玻璃材质与透明度冲突**：在 Windows 平台上启用 DWM Acrylic 或 AccentBlurBehind 时，窗口的 `transparent` 属性不能简单设为 `true`，必须通过 `nativeBlurEnabled()` 协调并在 `windowsBackdrop.js` 中配置系统调用，否则会导致窗口黑屏或无响应。
10. **多屏幕热插拔坐标越界**：恢复保存的窗口位置时，切勿直接应用 `saved.x` 与 `saved.y`。必须调用 `isBoundsOnScreen()`；若用户已拔出扩展屏，需退回到主屏幕默认位置，否则窗口将在屏幕外盲画。

---

## 验证方式

1. **静态代码质量与风格校验**：
   ```bash
   npm run lint
   ```
2. **运行核心测试套件**：
   ```bash
   npm test
   ```
   重点关注 Edge Dock 状态机与几何计算测试：`tests/edgeDock/geometry.test.js`、`tests/edgeDock/intent.test.js`。
3. **主窗口交互与零构建重载验证**：
   运行 `npm start`，验证无边框主窗口正常居中展现；修改 `styles.css` 或 `app.js` 后，在主窗口按 `Ctrl+R`，验证视图能立即应用新修改；测试拖拽移动与边缘吸附，重启后验证位置记忆。
4. **Edge Dock 悬浮挂件验证**：
   在设置面板中开启 Edge Dock，观察屏幕边缘导轨贴合与环形刻度绘制；鼠标悬停触发详情卡片滑出；修改 `renderer/edgeDock/dock.css` 后在设置中关闭再开启 Edge Dock，验证样式热更新链路。
5. **Dashboard 独立窗口验证**：
   从主窗口点击仪表盘图标，验证 920×620 独立视窗平滑展开，确认 `dashboard:ready` 信号正常触发且无控制台报错。

# 06 构建、开发循环、测试与发布

## 职责概览

面向第一次接触本仓库、准备改代码的模型:本地开发循环(renderer 零构建、刷新/重启边界、单实例锁、宿主终端污染、npm 11.19 install-scripts 门禁恢复)、`package.json` 脚本全表、`tests/**` 布局与 node:test 约定、CI、打包/发布、生成物 tripwire 的操作版、`.env.example` 环境变量清单。

不在本文范围:采集管线、限额语义、wire 协议 —— 见 `docs/architecture.md` 与 `docs/providers/`。配置面(GUI vs `.env` 优先级)见 `docs/configuration.md`。

前置:Node ≥ `22.15.0`(`engines.node`;DSH 解码要 `zlib.zstdDecompressSync`),本机 npm 11.19.0(默认拦截依赖 install 脚本,见机制 5),Windows + PowerShell 5.1(本机无 `rg`,检索用 `Select-String`)。

## 入口与关键文件

| 文件 | 关键符号 | 作用 |
|---|---|---|
| `package.json` | `scripts`, `main`, `build` | 全部命令入口;`main: src/electron/main.js`;`build` 是 electron-builder 基础配置 |
| `src/electron/main.js` | `loadWindowFile()`(~L6997)、`createWindow()`、`createDashboardWindow()`(L7187) | 主进程:创建窗口、`loadFile('renderer/index.html')`、单实例锁、IPC、Edge Dock 编排 |
| `src/electron/renderer/**` | `index.html`、`dashboard.html`、`edgeDock/` | 渲染层源码,**直接被 Electron 读取,无任何打包步骤** |
| `src/electron/edgeDock/controller.js` | `createEdgeDockController()`(L412 被 main 引入)、`BrowserWindow`(L514)、`loadFile(edgeDock/index.html)`(L581) | Edge Dock 独立窗口:几何、遮罩、指针;格子数据由主进程推入 |
| `scripts/ensure-vendored-tokscale.js` | `ensureVendoredTokscale()`, `downloadAsset()`, `--platform=`, `--allow-missing-target-package` | 按 `scripts/vendor/tokscale.json` 下载/校验并替换 tokscale 二进制 |
| `scripts/sync-worker-shared.js` | `WORKER_SHARED_MODULES`, `HEADER`(`@generated`) | 把 `src/shared` 闭包 vendor 进 `worker/src/shared/` |
| `scripts/hub-build-manifest.js` | `WORKER_SHARED_MODULES`(L15)、`currentHubSourceBuildIds()`(L107)、`REGISTRY_PATH` | 定义 Worker 共享闭包 + Hub 构建标识哈希 |
| `scripts/update-hub-build.js` | `updatedRegistry()` → 写 `src/shared/hubBuildRegistry.json` | 移动 Hub build marker,随后自动 `sync:worker` |
| `scripts/electron-builder.config.js` | `createBuilderConfig()`(来自 `macos-packaging.js`), `resolveElectronVersionOverride()` | electron-builder 配装入口,`pack*`/`dist*` 都用它 |
| `tests/**` | `node --test "tests/**/*.test.js"` | node:test 套件,按子系统分目录 |
| `eslint.config.js` | flat config | `npm run lint`;忽略 `site/**` 与生成的 `worker/src/shared/**` |
| `.github/workflows/ci.yml` | jobs `test` / `timezones` / `mac-widget` | push/PR 上 lint+test(+worker 漂移检查) |
| `.env.example` | `TOKEN_MONITOR_*` | 环境变量权威清单(比 `docs/configuration.md` 全) |

## 数据流

```
[开发循环]
改 src/electron/renderer/** ──Ctrl+R(主窗口/Dock 窗口)──┐
改 src/electron/main.js / preload.js / edgeDock/{controller,geometry,mask}.js
   或被主进程 require 的 renderer 模块(presentation.js/items.js/shapes.js)
        └──必须 kill + 重跑 npm start──────────────────┤
                                                        ▼
npm start = node scripts/ensure-vendored-tokscale.js && electron .
        │                                              │
        │  单实例锁 main.js:533 requestSingleInstanceLock()
        │  失败 → app.exit(0) 静默退出(与已装版共用 %APPDATA%\Token Monitor)
        ▼
src/electron/main.js ──loadFile──> renderer/index.html (主窗口, query 参数)
                ├────loadFile───> renderer/dashboard.html (仪表盘, 重开时 webContents.reload() L7195)
                ├────loadFile───> renderer/edgeDock/index.html (controller.js L581)
                ├─ require ────> src/shared/** (collector/limits/usage/hub 客户端)
                ├─ spawn ──────> tokscale 二进制 (node_modules/@tokscale/cli-<平台>, ensure:tokscale 置换)
                └─ edgeDockCellsFor() → buildEdgeDockCells(renderer/edgeDock/presentation.js)
                       → controller.setCells(cells)   # Dock 数据由主进程推送,非渲染层轮询

[生成物链]
src/shared/** ──npm run sync:worker──> worker/src/shared/ (@generated, CI 漂移检查)
src/shared/hubBuildRegistry.json <──npm run update:hub-build (改 Hub/shared 定稿后跑一次)
```

## 关键机制

### 1. 本地开发循环:零构建 renderer

Electron 读的是源码:`main.js` 的 `loadWindowFile()` 直接 `target.loadFile(path.join(__dirname,'renderer','index.html'))`,没有 webpack/vite/esbuild,`.js/.css/.html` 改完即生效。

- **改 `src/electron/renderer/**`(主窗口/仪表盘的 DOM、样式、渲染逻辑)** → 焦点放在窗口里按 `Ctrl+R`(`Cmd+Shift+R` 会保留 query 参数)。`main.js:7124-7132` 明确处理"每次 renderer reload 后重发窗口可见性",说明 reload 是常规路径;仪表盘窗口重开时自己 `webContents.reload()`。
- **改 `src/electron/main.js`、`preload.js`、`src/electron/edgeDock/{controller,geometry,mask,...}.js`** → 必须重启整个进程(kill `npm start`,重跑)。主进程模块在启动时 `require` 一次,热改无效。
- **注意 renderer 目录被主进程直接引用**:`main.js:422-427` `require('./renderer/edgeDock/presentation|items|shapes')` —— 这几个文件虽然住在 `renderer/`,却是主进程代码,改它们要重启,`Ctrl+R` 没用。
- **Edge Dock 的刷新机制**:格子内容由主进程 `edgeDockCellsFor()` 算好后 `pushEdgeDockCells() → edgeDockController.setCells()`(main.js:5652/5662);数据更新(用量变化、限额刷新、`syncEdgeDock`)都走这条推送。所以 Dock 的**样式/布局 shell**(`renderer/edgeDock/*.css/js`)可 Ctrl+R,而**格子结构与数据**相关的改动要重启。
- **配置改动**:`settings.json`(GUI `⚙` 面板)即时生效走 IPC;环境变量改动要重启进程。

### 2. 单实例锁与共享用户数据目录

`src/electron/main.js:454` `const APP_NAME = 'Token Monitor'`,`L530 app.setName(APP_NAME)`,`L533-534`:

```js
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.exit(0);
```

- 未打包版与已安装/打包版默认共用同一 userData(Windows 为 `%APPDATA%\Token Monitor`)→ **同时开着已安装版再跑 `npm start`,新进程拿不到锁,`app.exit(0)` 静默退出**(无报错,像是命令没反应)。排查"npm start 没输出就结束"先看这个。
- 代码里没有 `app.setPath('userData', …)` 的开发分支 ❓(未检索到),所以规避办法只有:先退出已安装版,或临时改 `APP_NAME`/userData ❓(需改代码,自行评估)。
- 拿到锁的进程收到 `second-instance` 事件 → `focusExistingWindow`(main.js:9106),即再次启动只会把已有窗口调到前台。

### 3. 宿主内置终端的 `ELECTRON_RUN_AS_NODE` 污染

在 T3 Code / VS Code 等宿主的内置终端里,环境常带 `ELECTRON_RUN_AS_NODE=1`(宿主用自己的 Electron 当 Node 跑脚本)。此时 `electron .` 会退化成**纯 Node 进程**执行 `main.js`,`require('electron')` 拿到的是字符串路径,启动即崩或行为怪异。

修复(PowerShell,当前会话):

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm start
```

判定特征:报错栈里出现 `app.whenReady is not a function` 之类,或进程秒退。新开的普通终端一般没这个问题。

### 4. npm 11.19 install-scripts 门禁与"缺什么怎么恢复"

npm 11.19 起,依赖的 `preinstall/install/postinstall/prepare` **默认不执行**,除非 `package.json` 的 `allowScripts` 放行;安装结束只打印 `npm warn install-scripts … not covered by allowScripts`。受影响的两个关键依赖:

| 依赖 | 被拦的脚本 | 缺失症状 | 手动恢复(不改 package.json) |
|---|---|---|---|
| `electron` | `postinstall`(`node install.js` 下载二进制) | `npm start` 报 *Electron failed to install correctly* | `node node_modules/electron/install.js` |
| `koffi` | `install`(`node ./cnoke.cjs … --prebuild --release`) | 报找不到 koffi 原生 binding | `require('koffi')` 目前**可**成功:加载器(`node_modules/koffi/src/koffi/index.cjs`)会回退到平台预编译包 `node_modules/@koromix/koffi-<平台>`;真缺时手动跑它 package.json 里的 install 脚本 `node node_modules/koffi/cnoke.cjs -P node_modules/koffi -D src/koffi --prebuild --release` ❓(未实测) |

自检:

```powershell
Test-Path node_modules\electron\dist\electron.exe   # 应为 True
Test-Path node_modules\@koromix\koffi-win32-x64      # 应为 True
node -e "require('koffi');console.log('koffi ok')"
```

正式放行用 `npm install-scripts approve electron koffi` —— 它会把 `allowScripts` 写进 `package.json`(仓库改动)。**是否提交该字段需先与维护者讨论**(AGENTS.md:不擅自加依赖/工具链) ❓。

### 5. `ensure:tokscale`:唯一允许下载二进制的脚本

- `scripts/ensure-vendored-tokscale.js` 读 `scripts/vendor/tokscale.json`(当前 `mode: "override"`):按 `platforms[].sha256` 从 `Javis603/tokscale` release 下载固定构建,替换 `node_modules/@tokscale/cli-<平台>` 里的二进制,并 `--version` 冒烟。`mode: "upstream"` 时 no-op,直接用 npm 装的版本。
- `--platform=darwin-arm64` 等做交叉打包目标;`--allow-missing-target-package` 是唯一放开口子(mac widget x64 结构性 CI 构建用)。
- **调用方只有**:`start` / `widget` / `dev` / `agent` / `agent:once` / `pack*` / `dist*`。`install`、`hub`、`lint`、`test`、`verify` **绝不**下载二进制(离线红线,AGENTS.md Tripwires)。所以测试跑的是磁盘上已有二进制,不保证它最新;发布前的验证在 `.github/workflows/vendor-tokscale.yml`。
- bump `tokscale` 依赖必须同时动 `scripts/vendor/tokscale.json`(`baseVersion` 由 `verify-vendored-tokscale-release.js` 卡)。

### 6. 生成物 tripwire 操作版

| 我改了 X | 必须做 Y | 为什么 |
|---|---|---|
| `src/shared/**` 里属于 `WORKER_SHARED_MODULES` 的文件(`scripts/hub-build-manifest.js:15`,含 `limits/providers.js`、`limits/core.js`、`usage.js`、`history.js`、`hubProtocol.js`…) | `npm run sync:worker` 后提交 `worker/src/shared/` | `worker/src/shared` 是 `@generated`;Cloudflare "Deploy to Cloudflare" 把 `worker/` 隔离成独立仓库,不能 import 上层;CI(ci.yml Linux 一步)`sync:worker` + `git diff --exit-code` 漂移即红 |
| 上述文件 **或** `src/hub/server.js`、`src/shared/http.js`、`src/shared/config.js`、`worker/src/index.js`、`worker/wrangler.toml`、两侧 package/lock 的构建字段 | 定稿后跑**一次** `npm run update:hub-build`(内部会接着 `sync:worker`),提交 `src/shared/hubBuildRegistry.json` | marker 是远端 Hub 更新检查比对的构建身份(`currentHubSourceBuildIds()` 哈希);陈旧会让 `tests/shared/hubBuild.test.js` 失败;**增删/重排 limits provider 会移动 marker**(`limits/providers.js` 在 Hub 核心里)。不要手改生成的 Worker 元数据 |
| `src/shared/**` 中被 Worker 引用的模块 | 检查该模块**无 Node built-ins**(`node:fs`/`node:path`…)、只引用闭包内相对模块 | Worker 运行时没有 Node API;越界会让 Worker 构建失败 |
| `scripts/vendor/tokscale.json` 或 `tokscale` 依赖版本 | 改 `baseVersion`/pin,跑 `node scripts/verify-vendored-tokscale.js`、`node scripts/verify-vendored-tokscale-clients.js` | 两个 verify 门按 manifest 校验二进制与客户端覆盖 |
| 升级 `electron` / `electron-builder` | `npm install` 后确认机制 4 已恢复二进制;`pack` 试打包 | asarUnpack 里列了 `@tokscale`、`tokscale`、`koffi` |

### 7. `package.json` scripts 全表

| script | 一句话 |
|---|---|
| `start` / `widget` / `dev` | 三者等价:`ensure:tokscale && electron .`,启动桌面小组件(日常开发入口) |
| `hub` | `node src/hub/server.js`,本地 Node Hub(默认端口 17321,`TOKEN_MONITOR_PORT`/`HOST` 可改);**不**下载二进制 |
| `agent` | `ensure:tokscale && node src/agent/agent.js`,headless 采集器(常驻,采集→上报 hub) |
| `agent:once` | 同上加 `--once`,采一次就退出(cron/launchd 用) |
| `ensure:tokscale` | 见机制 5,置换/校验 tokscale 二进制(可 `-- --platform=…`) |
| `test` | `node --test "tests/**/*.test.js"`(glob 由 Node 展开,需 Node 22.13+) |
| `lint` | `eslint .`(flat config,忽略 `site/**`、`worker/src/shared/**`) |
| `verify` | `lint && test`,本地一次跑全量校验(CI 的等价物) |
| `sync:worker` | vendor `src/shared` 闭包到 `worker/src/shared`(机制 6) |
| `update:hub-build` | 移动 Hub build marker + 自动 `sync:worker`(机制 6) |
| `pack` | `ensure:tokscale && electron-builder --config scripts/electron-builder.config.js --dir`,只出未打包目录(`dist/win-unpacked` 等),不装不签名 |
| `pack:mac:widget` / `:x64` | 本地开发签名的 mac 小组件全链:build appex → `macos-packaging.js` → `--dir`;带 `TOKEN_MONITOR_LOCAL_DEVELOPMENT_SIGNING=1` |
| `dist:mac` / `dist:mac:x64` | 出 mac dmg+zip(arm64/x64),`--publish never` |
| `dist:mac:widget` / `:x64` | 发布级 mac 小组件(`TOKEN_MONITOR_WIDGET_DISTRIBUTION=1`,走签名/公证) |
| `dist:win` | Windows nsis + portable 安装包(x64) |
| `dist:win:dir` | 只出 win 未打包目录(供 `dist:win:prepackaged` 二次加工) |
| `dist:win:prepackaged` | 对已 unpack 的目录补出 nsis+portable(SignPath 签名流水线用) |
| `dist:linux` | Linux AppImage(x64) |
| `build:mac-widget` | `scripts/build-macos-widget.js`,编译 `native/macos/TokenMonitorWidget.xcodeproj` 出 `.appex` 与 `TokenMonitorWidgetReloader` |
| `dev:mac-widget` | `scripts/dev-macos-widget.js`,本地开发用小组件构建 |
| `verify:mac:widget-app` | `scripts/verify-macos-widget-app.js`,校验打包后的 app 里小组件/entitlements/app group |
| `verify:release-artifact-names` | `scripts/verify-updater-artifact-names.js dist`,校验发布产物名符合 electron-updater 期望 |
| `benchmark:hub-bandwidth` | `scripts/benchmark-hub-bandwidth.js`,Hub 带宽基准 |
| (无 `site` 脚本) | 站点是独立 `site/` 项目:`.github/workflows/pages.yml` 跑 `npm ci --prefix site && npm run build --prefix site` 出 `_site`;根 `package.json` **没有** site 命令 |

### 8. tests/ 布局与 node:test 约定

| 目录 | 测什么 | 代表 |
|---|---|---|
| `tests/shared/**` | `src/shared/**` 纯逻辑:采集、限额、provider 解析、协议、定价、配置(可注入 platform/homeDir/env) | `config.test.js`、`limitProviders.test.js`、`hubBuild.test.js` |
| `tests/electron/**` | 主进程与渲染层行为:窗口生命周期、tray、edgeDock、IPC、DOM/CSS 覆盖(**直接把源码当文本读,不跑浏览器**) | `edgeDockCssCoverage.test.js`(扫 `src/electron/renderer` 找 `edge-dock-*` 类) |
| `tests/agent/**` | headless agent 运行时:采集调度、seed 客户端、内容同步、标题同步 | `runtime.test.js` |
| `tests/hub/**` | Node Hub HTTP/SSE:`createHub()` 起真实 `http` 服务再连 | `server.test.js` |
| `tests/worker/**` | Cloudflare Worker 协议(auth、公开统计、订阅、带宽),用假 `storage` 对象 + `pathToFileURL` 动态 import | `auth.test.js` |
| `tests/docs/**` | 文档一致性:README 各语言同步、provider 指南存在性(按 `LIMIT_PROVIDER_IDS` 对表) | `readmeConsistency.test.js` |
| `tests/scripts/**` | `scripts/*.js` 自身:release notes、star-history 工件校验 | `prepareGithubReleaseNotes.test.js` |
| `tests/fixtures/**` | 测试数据(plist、sqlite、json、脚本化 collector),不是测试 | `sessionDetailThreadWorker.js` |
| `tests/helpers/**` | 共享夹具:如 `sourceEnv.js` 清 `HOME/XDG_DATA_HOME/CODEX_HOME/…`(开发机 shell 变量是断言输入,不清会在 CI 绿、本机红) | `sourceEnv.js` |

- **约定**:CommonJS;`require('node:test')` + `require('node:assert/strict')`;相对路径 `require('../../src/…')`;文件名必须以 `.test.js` 结尾才会被 glob 捞到;一个文件多个 `test(...)`;不引入测试框架、不 mock 库,桩用普通对象/`fs` 临时目录。
- **加一个测试**:新建 `tests/<子系统>/<名字>.test.js`,写 `test('描述', () => { assert.… })`;单跑 `node --test tests/shared/名字.test.js`(或 `npm test` 跑全量);涉及环境变量的用 try/finally 还原(见 `config.test.js`),涉及本机源码根的先 `require('../helpers/sourceEnv')`。
- **node:test glob**:`npm test` 展开 `"tests/**/*.test.js"`(引号必须保留,交给 Node 而非 shell);CI 的 mac-widget job 另用显式文件列表 + `xcodebuild test` 跑原生 Swift 测试。

### 9. CI(`.github/workflows`)

| workflow | 干什么 |
|---|---|
| `ci.yml` | push/PR 主闸。`test` job:ubuntu × Node 22/24 全覆盖,macos/windows × Node 24 冒烟;步骤 `npm ci` → (仅 Linux)`npm run sync:worker` + `git diff --exit-code worker/src/shared`(生成物漂移)→ `npm run lint` → `npm test`。`timezones` job:在 7 个 UTC 偏移(含 +05:45、跨日界)各跑一次套件 —— 用量周期按本地午夜切,UTC 断言会假绿。`mac-widget` job:跑 mac 相关 node 测试 + `xcodebuild test`(原生小组件)+ 两架构 build/pack/verify |
| `vendor-tokscale.yml` | PR 上对 release 的 4 个目标跑 `ensure`/`verify-vendored-tokscale*`,并核对上游 npm 包声明的每个平台都存在于 vendor release(常规 CI 保持离线) |
| `release.yml` | `v*` tag 触发:macos-26(arm64)+ macos-26-intel(x64)+ windows + ubuntu 矩阵,各自 `dist:*`(mac 走 widget 链),先 `ensure`+`verify` tokscale 再 electron-builder,收集 dmg/zip/exe/AppImage + `latest*.yml` + blockmap |
| `pages.yml` | `site/**` 变更时构建并部署 GitHub Pages |
| `codeql.yml` / `star-history.yml` | 代码扫描;star-history 数据抓取与校验 |

### 10. 打包与发布概要

- **配置**:`scripts/electron-builder.config.js` = `package.json#build` + `createBuilderConfig()`(`scripts/macos-packaging.js`)注入 mac 小组件/签名逻辑,`resolveElectronVersionOverride()` 可覆盖 Electron 版本(仅 Linux 产物用)。
- **目标**:Windows nsis(免装便携双出,`SignPath Foundation` 签名,`scripts/nsis-installer.nsh` 定制安装器)+ portable;macOS dmg+zip(`forceCodeSigning`、`LSUIElement=true`、最低 macOS 12);Linux AppImage。`files` 只打 `src/electron`、`src/shared`、`src/hub`、vendor manifest、图标;`asarUnpack` 放 `@tokscale`、`tokscale`、`koffi`(原生二进制必须在 asar 外)。
- **mac 小组件**:`build:mac-widget` 编 `native/macos/TokenMonitorWidget.xcodeproj` → `.appex` + `TokenMonitorWidgetReloader`;`scripts/macos-provisioning.js`、`sign-macos-with-widget.js` 处理 provisioning/签名,`verify-macos-widget-app.js` 验 app group、bundle id、架构;开发签名靠 `TOKEN_MONITOR_LOCAL_DEVELOPMENT_SIGNING=1`,发布靠 release.yml 的 `DEVELOPMENT_TEAM` 等 vars。
- **`dist/` 是本地构建产物**(gitignored):`dist/win-unpacked`、`dist/mac-*` 等,随时可删;`verify:release-artifact-names` 检查产物名与 electron-updater 的 `latest*.yml` 对得上。
- **发布**:push `v*` tag → release.yml 四平台构建 → GitHub Release(产物名模板见 `package.json#build.artifactName`)。

### 11. 环境变量清单(`.env.example` 是权威)

优先级:agent/hub 是 `CLI flag → env(含 .env)→ 内置默认`;widget 只把 env 当**首启默认**,GUI 保存过即覆盖(`docs/configuration.md`)。`.env` 不入库。

**运行时/采集(`TOKEN_MONITOR_*`)**

| 变量 | 一句话 |
|---|---|
| `TOKEN_MONITOR_HUB_URL` | hub 地址;空 = 单机本地模式(widget 直读文件) |
| `TOKEN_MONITOR_SECRET` | hub 共享密钥,hub/agent/同步 widget 三端一致 |
| `TOKEN_MONITOR_SYNC_SESSION_TITLES` | `1` 供给会话标题(与 hub 端许可各自独立,默认关) |
| `TOKEN_MONITOR_DEVICE_ID` | 设备 id,缺省用主机名 |
| `TOKEN_MONITOR_SYNC_UPLOAD_INTERVAL_MS` | `0` 实时 / `600000`/`1200000`/`1800000` 上传节奏(GUI 保存值优先) |
| `TOKEN_MONITOR_CLIENTS` | 追踪客户端 CSV;缺省全部,空串 = 全部停追踪 |
| `TOKEN_MONITOR_CODEX_LOCAL_USAGE` | `1` 启用 Codex/Work 执行器的 Dots 本地用量(默认关) |
| `TOKEN_MONITOR_WATCH_POLLING` | `1` 强制轮询、`0` 禁止轮询;缺省原生事件 + 自动回退(网络盘/容器挂载才动) |
| `TOKEN_MONITOR_PROJECTS_ENABLED` | `0` 关闭项目归属采集 |
| `TOKEN_MONITOR_HISTORY_ENABLED` | `0` 关闭 Trends 历史采集 |
| `TOKEN_MONITOR_SESSION_USAGE_ARCHIVE_ENABLED` | `0` 关闭已删会话用量归档 |
| `TOKEN_MONITOR_LIMITS_ENABLED` | `0` 整体跳过限额 CLI/接口探测 |
| `TOKEN_MONITOR_LIMIT_PROVIDERS` | 限额 provider CSV;缺省全部,空串 = 一个不探 |
| `TOKEN_MONITOR_LIMITS_REFRESH_MODE` | `fixed`(默认)/`adaptive`(按消耗速率提前刷新) |
| `TOKEN_MONITOR_LIMITS_REFRESH_MS` | fixed 间隔;`60000/120000/300000/900000/1800000`,默认 300000 |
| `TOKEN_MONITOR_OPENCODE_LOCAL_LIMITS` | `1` 允许读本机 OpenCode SQLite 作兜底配额(会低估共享账号) |
| `TOKEN_MONITOR_OPENCODE_API_KEY` | OpenCode Go 订阅 key(缺省按 OPENCODE_AUTH_CONTENT → auth.json 自动发现) |
| `TOKEN_MONITOR_OPENCODE_AMBIENT` | `0` 不上报本机自动发现的 OpenCode 账号 |
| `TOKEN_MONITOR_OPENCODE_COOKIE` | OpenCode web cookie(环境托管凭据,agent/hubless 用) |
| `TOKEN_MONITOR_CLAUDE_PREPAID_BALANCE` | `0` 跳过 claude.ai 预付余额查询(仅对 `CLAUDE_WEB_COOKIE` 生效) |
| `TOKEN_MONITOR_PORT` | hub 端口,默认 17321(widget 内嵌 hub 同用) |
| `TOKEN_MONITOR_HOST` | hub 绑定地址,默认 `0.0.0.0` |
| `TOKEN_MONITOR_DATA_FILE` | hub 设备数据文件,默认 `data/devices.json` |
| `TOKEN_MONITOR_STALE_AFTER_MS` | hub 判定设备离线的静默阈值 |
| `TOKEN_MONITOR_INTERVAL_MS` | agent 常驻采集间隔,默认 300000 |
| `TOKEN_MONITOR_WATCH` | `0` 关闭 agent 文件监听(默认开) |
| `TOKEN_MONITOR_WATCH_DEBOUNCE_MS` | 调试:覆盖监听去抖时长(**别在生产改**,watch 无冷却是产品承诺) |
| `TOKEN_MONITOR_HISTORY_INTERVAL_MS` | 历史刷新间隔覆盖 |
| `TOKEN_MONITOR_ALL_TIME_SINCE` | allTime 扫描起点,默认 `2024-01-01` |
| `TOKEN_MONITOR_TOKSCALE_TIMEOUT_MS` | 单次 tokscale 扫描超时,默认 120000 |
| `TOKEN_MONITOR_WSL_SCAN` | `0` 关闭 Windows WSL 扫描(默认开) |
| `TOKEN_MONITOR_CURRENCY` | 首启默认显示币种(默认 USD) |
| `TOKEN_MONITOR_ALWAYS_ON_TOP` | `0` 窗口默认普通模式(否则 floating) |
| `TOKEN_MONITOR_WIDGET_REFRESH_MS` | widget 刷新间隔,默认 15000 |
| `TOKEN_MONITOR_SHOW_LIMIT_SOURCE` / `_USED` | `1` 显示限额来源/已用调试标注 |
| `TOKEN_MONITOR_TASKBAR_ZORDER_DEBUG` | `1` 打开 Windows 任务栏 z-order 日志 |

**打包/小组件签名(CI 与打包脚本注入,日常开发不设)**:`TOKEN_MONITOR_WIDGET_ENABLED`、`TOKEN_MONITOR_WIDGET_DISTRIBUTION`、`TOKEN_MONITOR_WIDGET_ARCH`、`TOKEN_MONITOR_WIDGET_BUNDLE_ID`、`TOKEN_MONITOR_WIDGET_KIND`、`TOKEN_MONITOR_APP_GROUP`、`TOKEN_MONITOR_LOCAL_DEVELOPMENT_SIGNING`、`TOKEN_MONITOR_MAC_DEVELOPMENT_IDENTITY`、`TOKEN_MONITOR_MAC_DISTRIBUTION_CHANNEL`、`TOKEN_MONITOR_WIDGET_GIT_REVISION`、`TOKEN_MONITOR_WIDGET_BUILD_TIMESTAMP`。

**提供商凭据(按家族一行;widget 多数有 GUI 字段,env 供 agent/hubless)**

| 变量 | 一句话 |
|---|---|
| `ANTIGRAVITY_OAUTH_CLIENT_ID` / `_SECRET` | 覆盖内置 Antigravity OAuth 客户端(自建/轮换) |
| `CLAUDE_WEB_COOKIE` | Claude Web sessionKey(`sk-ant-…`) |
| `FACTORY_API_KEY` | Factory/Droid key |
| `GROK_BEARER_TOKEN` | Grok web 计费 token(否则读 `~/.grok/auth.json`) |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NO_PROXY` | Grok web 请求代理(小写变体优先) |
| `DEEPSEEK_API_KEY` | DeepSeek 余额查询 key |
| `CLINE_API_KEY`(`CLINEPASS_API_KEY`) | ClinePass key |
| `OPENROUTER_API_KEY` | OpenRouter key(Management key 才有 credits) |
| `MINIMAX_CODING_API_KEY` | Minimax **Token Plan** key(非按量计费 key) |
| `COPILOT_API_TOKEN`(`GITHUB_COPILOT_TOKEN`) | Copilot OAuth token |
| `ZAI_API_KEY` + `TOKEN_MONITOR_ZAI_API_REGION` | Z.ai GLM key;region `global`/`bigmodel-cn` |
| `ZAI_TEAM_API_KEY` / `ZAI_TEAM_ORGANIZATION_ID` / `ZAI_TEAM_PROJECT_ID` | GLM Team plan(BigModel CN)三件套 |
| `VOLCENGINE_ACCESS_KEY_ID`/`SECRET_ACCESS_KEY`/`REGION` + `VOLCENGINE_AGENT_*` | 火山 Ark 凭据;Agent 账号分离时才填 `AGENT_*` |
| `TOKEN_MONITOR_VOLCENGINE_ARKCLI` / `TOKEN_MONITOR_ARKCLI_COMMAND` | `0` 关闭 arkcli SSO 兜底;自定义 arkcli 路径 |
| `QODER_COOKIE` + `TOKEN_MONITOR_QODER_SITE` | Qoder 面板 cookie;site `global`/`cn` |
| `TOKEN_MONITOR_QODER_CN_DB_PATH` / `_PROJECTS_PATH` | Qoder CN 本地库/项目目录路径覆盖 |
| `DEVIN_BEARER_TOKEN` / `DEVIN_ORGANIZATION` | Devin web 配额会话(复制 Authorization 与 x-cog-org-id) |
| `STEPFUN_TOKEN` | StepFun Oasis-Token |
| `TRAE_ACCESS_TOKEN` / `TRAE_DEVICE_ID` | Trae CN / SOLO credits |
| `ALIBABA_TOKEN_PLAN_COOKIE` / `_VARIANT` | 阿里 Token Plan cookie;variant `cn/intl/cn-personal/intl-personal` 必须匹配 |
| `TOKEN_MONITOR_ZED_COOKIE` | Zed 面板 billing cookie(headless 用) |
| `COMMANDCODE_COOKIE` | Command Code 限额 cookie |
| `TOKEN_MONITOR_WORKBUDDY_ACCESS_TOKEN` 等 6 项 | WorkBuddy **headless 专用** fallback(桌面版自动读本地登录,勿抄) |
| `OLLAMA_COOKIE` | Ollama Cloud cookie |
| `KIMI_CODE_API_KEY` / `KIMI_AUTH_TOKEN` | Kimi Code 主 key + Kimi Web token(补 Weekly 窗口) |
| `TOKEN_MONITOR_NEWAPI_BASE_URL`/`ACCESS_TOKEN`/`USER_ID`/`API_KEY` | 第三方 New API/One API:账号模式或单 key 模式(账号模式优先) |
| `TOKEN_MONITOR_TYPESAFE_COOKIE` | TypeSafe Console billing cookie(在 `.env.example` 末行,注释状态) |

## 修改场景速查

| 我想改… | 主要动这些文件 | 联动/注意事项 |
|---|---|---|
| 小组件界面样式/文案 | `src/electron/renderer/**` | Ctrl+R 即可;若类名是 `edge-dock-*`,同步 `tests/electron/edgeDockCssCoverage.test.js` 的期望 |
| Edge Dock 格子结构/数据 | `src/electron/renderer/edgeDock/presentation.js`、`items.js`,`main.js` 的 `edgeDockCellsFor()` | **重启**进程;被主进程 require |
| 窗口行为/托盘/IPC | `src/electron/main.js`、`preload.js` | **重启**;改 `preload` 后 renderer 也要 Ctrl+R |
| 新增/重排 limits provider | `src/shared/limits/providers.js` + provider 目录 + `docs/providers/README.md` 注册清单 | `npm run sync:worker`;marker 移动 → 定稿后 `npm run update:hub-build`;跑 `tests/shared/limitProviders.test.js`、`docs` 测试 |
| 改 `src/shared/**` | 源文件本身 | 若在 `WORKER_SHARED_MODULES` 内:`sync:worker` + 视情 `update:hub-build`;确认无 Node built-ins |
| Hub 端点/wire 形状 | `src/hub/server.js`、`src/shared/hubProtocol.js`、`worker/src/index.js` | 先读 `docs/API.md`;跑 `tests/hub` + `tests/worker`;marker 移动 |
| tokscale 行为/版本 | `scripts/vendor/tokscale.json`、`package.json` 依赖 | `baseVersion` 必须一致;跑两个 `verify-vendored-tokscale*` |
| 加测试 | `tests/<子系统>/*.test.js` | 见机制 8;`npm run verify` 收口 |
| 文档/README | `docs/**`、`README*.md` | `tests/docs/readmeConsistency.test.js` 会卡多语言一致性 |
| CI/发布流程 | `.github/workflows/*.yml` | 发布链先在本地 `pack`/`dist:win:dir` 干跑;不要让 `install`/`lint`/`test` 触发下载 |

## 陷阱

1. **`npm start` 秒退无输出** → 单实例锁(机制 2):已安装版正在跑,共用 `%APPDATA%\Token Monitor`。
2. **终端里 `electron .` 行为像 Node 脚本** → `ELECTRON_RUN_AS_NODE`(机制 3),`Remove-Item Env:ELECTRON_RUN_AS_NODE`。
3. **`npm start` 报 Electron 未正确安装** → npm 11.19 门禁(机制 4),`node node_modules/electron/install.js`;别顺手把 `allowScripts` 提交上去。
4. **改了 `renderer/edgeDock/*.js` 却没生效** → 那几个文件被主进程 require,要重启而非 Ctrl+R。
5. **改了 `src/shared` 忘了 `sync:worker`** → CI 漂移检查红;本地先跑 `npm run sync:worker` 再提交。
6. **改 Hub/shared 忘了 `update:hub-build`** → `tests/shared/hubBuild.test.js` 红;跑一次即可,别手改 `hubBuildRegistry.json`。
7. **在 `npm test`/`lint`/`verify` 里触发下载** → 违反离线红线;只有 app/agent/packaging 入口可跑 `ensure:tokscale`。
8. **本机测试红、CI 绿** → 多半是 shell 环境变量泄漏(`HOME`/`CODEX_HOME`/`XDG_*`),用 `tests/helpers/sourceEnv.js` 的做法先清再断言。
9. **单跑测试时漏引号** → `npm test` 的 glob 引号由 Node 解析;直接 `node --test tests/**/*.test.js` 在 PowerShell 里会展开行为不一致,建议用 `npm test` 或显式文件路径。
10. **`dist/`、`build/` 被当源码改** → 都是可再生产物;`worker/src/shared/` 虽在仓库里但是 `@generated`,只能改 `src/shared/` 再 sync。

## 验证方式

```powershell
npm run verify                # lint + 全量测试,提交前最低要求(等价 CI 主闸)
node --test tests/shared/<你改的>.test.js   # 单文件快跑
npm run sync:worker; git diff --exit-code worker/src/shared   # 生成物无漂移
node scripts/verify-vendored-tokscale.js    # 涉及 tokscale 时
node scripts/verify-vendored-tokscale-clients.js
npm start                      # 手动:窗口出现、Ctrl+R 生效、Dock 有数据
npm run agent:once -- --dry-run   # 涉及 agent 时干跑一次
```

不确定项集中:① Ctrl+R 依赖 Electron 默认 View 菜单的 reload 加速键,代码注释(main.js:7124)证实 reload 是预期路径但未逐条验证加速键映射 ❓;② koffi 手动 install 脚本命令未实测 ❓;③ 是否把 `allowScripts` 写进 `package.json` 待维护者决定 ❓;④ 是否存在未检索到的开发用 userData 覆盖 ❓。
