# 前端代码地图:主窗口 + 侧边悬浮窗(Edge Dock)

> 工作参考文档。用于定位「前端窗口」与「侧边永久悬浮窗」的全部相关代码。
> 范围:**主窗口(widget window)** 和 **Edge Dock(侧边悬浮窗)** 两个面。
> 相邻但不在本图内:mDashboard 窗口、托盘(tray)弹窗、macOS Widget、tray composer。
| 全部行号来自 2026-10-16 快照(`main` @ `478ec910`)。

---

## 0. 总体结构(两个窗口,两个渲染器)

```
src/electron/
├─ main.js                       9127 行 · 主进程总入口,两个窗口都在这创建
├─ preload.js                     223 行 · 主窗口 bridge(window.tokenMonitor)
├─ edgeDock/                            · 侧边悬浮窗【主进程侧】
│  ├─ controller.js              1369 行 · dock 全部窗口/布局/交互/IPC
│  ├─ geometry.js                 586 行 · 尺寸/模式/坐标换算
│  ├─ fullScreenProbe.js          303 行 · 全屏检测(alwaysExceptFullScreen)
│  ├─ mask.js(90) / macVibrancyMask.js(85) / macHaptics.js(75) / pointerButtons.js(61)
│  └─ preload.js                   32 行 · dock bridge(window.tokenMonitorEdgeDock)
├─ renderer/                            · 全部渲染进程代码
│  ├─ index.html                 1733 行 · 主窗口壳
│  ├─ styles.css                 8089 行 · 主窗口样式
│  ├─ app.js                    17557 行 · 主窗口全部逻辑
│  ├─ floatingBubbleBoot.js        23 行 · 主窗口折叠气泡启动垫片
│  ├─ dashboard.html/js/css             · 独立 Dashboard 窗口(邻近)
│  └─ edgeDock/                         · 侧边悬浮窗【渲染侧】
│     ├─ index.html                52 行 · dock 壳(surface=rail|bubble|peek)
│     ├─ dock.js                 1899 行 · dock 绘制/手势/动画
│     ├─ dock.css                1032 行 · dock 样式
│     ├─ presentation.js          847 行 · ★主进程+渲染器共用(cells 投影)
│     ├─ items.js                 187 行 · ★共用(edgeDockItems 持久化形状)
│     ├─ shapes.js                158 行 · ★共用(轮廓形状 → SVG/macOS mask)
│     ├─ composer.js              497 行 · dock 内容设置器(装在主窗口里,不在 dock 里)
│     └─ composer.css             279 行
├─ windowLifecycle.js              74 行 · handoffWindow/actionWindowForEvent
├─ windowState.js                 128 行 · 最大化/普通边界持久化
├─ windowBehavior.js              114 行 · floating/normal/desktop 三档案
├─ windowShortcut.js              148 行 · 全局显隐快捷键(主/渲染共用)
├─ deferredWindowSend.js           27 行 · did-finish-load 前排队发送
├─ floatingBubble.js              252 行 · 折叠气泡几何/状态
├─ windowsChrome.js                72 行 · Win32 DWM 圆角
├─ windowsBackdrop.js             129 行 · Win32 Acrylic/Accent 原生模糊
├─ nativeMaterialVisibility.js     99 行 · 材质(玻璃/亚克力)显隐管理
├─ macLiquidGlass.js / macBackdropMode.js / macosSpaceBehavior.js · macOS 材质/空间
├─ tray.js                        611 行 · 托盘图标+托盘模式(复用主窗口)
├─ trayModeSettings.js                  · 托盘模式设置
└─ motionPreference.js             24 行 · reduced-motion(主/dock 共用)
```

★ = 双端共用模块:主进程和渲染器都 require,改的时候两边同时受影响。

---

## A. 主窗口(前端窗口)

### A1 主进程:创建与生命周期 —— 全在 `src/electron/main.js`

| 职能 | 位置 |
|---|---|
| 唯一工厂 `createWindow(boundsOverride, options)` | **main.js:7005-7150** |
| ├─ `new BrowserWindow({...})`(无边框/透明/预载/图标/材质) | main.js:7018-7043 |
| ├─ 尺寸:`DEFAULT_WINDOW` 340×650 @473、`WINDOW_LIMITS` @474、`restoredBounds()` @2066 | main.js:473-474, 2066 |
| ├─ 窗口事件(最大化/失焦/关闭→隐藏/closed→退出判定) | main.js:7057-7133 |
| └─ 加载 `renderer/index.html` 的入口 `loadWindowFile()`(contentReady 门 + 2.5s 兜底) | main.js:6956-7003(调用点 7134) |
| 显示前等待内容就绪 `revealWindow()` | main.js:6951-6954 |
| 替换窗口 `replaceMainWindow()` / 重建 `rebuildWindow()` | main.js:7166-7182 / 7306-7325 |
| 缩放快捷键 `handleZoomShortcut()`(Esc 折叠气泡;Ctrl/Cmd +/−/0) | main.js:7152-7164 |
| 边界持久化 `persistBoundsSoon()` @2328、最大化持久化 @7057-7072 | |
| 启动流程 `app.whenReady()` → `createWindow()` @7367 → `syncEdgeDock()` @7392 | main.js:7327-9104 |
| 退出路径:`window-all-closed` @9107、`before-quit` @9112-9124 | |
| 单实例 / macOS activate / 全局显隐快捷键(注册 @6021,处理 @5835) | 9106 / 9086 / 5827-6029 |
| 窗口 IPC:`window:contentReady` @6984、`window:viewState` @7866、`window:minimize` @9061、`window:close` @9068 | |
| 可见性推送 `sendMainWindowVisibility()` | main.js:2141 |
| 关闭行为决策 `mainWindowCloseAction`(import @326,托盘时 hidePopover) | main.js:7098-7109 |

### A2 主窗口折叠形态(floating bubble)

| 职能 | 位置 |
|---|---|
| 气泡状态机(main 进程) | `floatingBubble.js`(252 行)+ main.js:2085(`floatingBubblePayload`)、2146(停表)、2236(折叠)、2257(展开)、2301(自动折叠计时) |
| IPC:`floatingBubble:expand` @7869、`:peek` @7870、`:collapseIfIdle` @7871、`:setCollapsedSize` @7887、`:move` @7915 | main.js |
| 渲染侧:启动垫片 `floatingBubbleBoot.js`;拖拽/展开逻辑 `app.js:7811-7940`、状态订阅 `app.js:13095` | |

### A3 渲染器(主窗口 UI 本体)

- **壳** `renderer/index.html:1733`
  - 标题栏 + 周期页签 + 窗口按钮:`13-38`(`.titlebar`,min/close/pin @32-36)
  - 设置面板:`40+`;脚本加载顺序:`1648-1731`
- **样式** `renderer/styles.css:8089` — 拖拽区 `-webkit-app-region: drag` @278,no-drag 覆盖 @189 等
- **逻辑** `renderer/app.js:17557`
  - 窗口按钮接线:`12943-12962`(minimize/close @12943-12949;bubble 指针事件 @12960-12972)
  - 视图状态上报:`7070`(`setViewState`);内容就绪:`5053`(`signalContentReady`)
- **视图/模块**(全部由 index.html 按序加载,`renderer/` 下):
  - 统计与图表:`usageCharts.js`、`homeOverview.js`、`trayBars.js`、`allTimeSessions.js`、`breakdownRenderPolicy.js`、`statsRenderScheduler.js`
  - 行/明细:`sessionRows.js`、`sessionDetail.js`、`projectRows.js`、`usageAttributionRows.js`、`deviceBreakdown.js`、`rowIconMasks.js`、`overflowText.js`
  - 配额:`limits/windowsView.js`、`limits/accountShell.js`、`limits/accountPanels.js`、`limits/providerPresentation.js`、`limits/providerOrder.js`、`limits/displayMode.js`、`limits/resetMotion.js`、`limits/resetAnimator.js`
  - 状态/健康:`clientStatusPresentation.js`、`clientHealthPresentation.js`、`clientSourceCache.js`、`clientRescanState.js`、`wslStatusPresentation.js`、`serviceStatusPresentation.js`
  - 设置 UI:`clientDisplayPreferences.js`、`viewDisplayPreferences.js`、`homeModulePreferences.js`、`settingsListFilter.js`、`customPricingForm.js`、`modelAliases*.js`、`helpPopover.js`、`selectControl.js`
  - 排序/拖拽:`verticalDragSort.js`、`rowDragController.js`;周期:`fixedPeriodRanges.js`
  - 主题/材质:`themePresets.js`、`glassRendering.js`、`windowsGlass.js`;`i18n.js`;`accountIdentity.js`;`appUpdatePresentation.js`;`tokenRatePresentation.js`;`syncDevicePanel.js`、`syncContentForm.js`
- **bridge** `preload.js:223` — `window.tokenMonitor`
  - 气泡 API:`136-151`;窗口控制:`221-222`;可见性推送:`68-72`;Dashboard:`34-45`

### A4 宿主辅助(主进程,`src/electron/`)

| 模块 | 行数 | 职责 |
|---|---:|---|
| `windowLifecycle.js` | 74 | `handoffWindow` / `actionWindowForEvent` / `showWindow` / `activateWindowAction` |
| `windowState.js` | 128 | 最大化判定、普通边界、持久化 |
| `windowBehavior.js` | 114 | floating/normal/desktop 三档窗口行为(pin 按钮循环切换) |
| `windowShortcut.js` | 148 | 全局显隐快捷键解析/校验(主进程+设置 UI 共用) |
| `deferredWindowSend.js` | 27 | 冷启动时排队到 `did-finish-load` |
| `windowsChrome.js` | 72 | DWM 圆角(Windows) |
| `windowsBackdrop.js` | 129 | Acrylic / AccentBlurBehind(Windows) |
| `nativeMaterialVisibility.js` | 99 | 材质在窗口显隐时的挂/摘 |
| `tray.js` + `trayModeSettings.js` | 611+ | 托盘图标与托盘模式(仍用主窗口当弹窗) |
| `floatingBubble.js` | 252 | 折叠气泡几何/常量 |
| `macLiquidGlass.js` / `macBackdropMode.js`(52) / `macosSpaceBehavior.js` | | macOS 材质与空间行为 |
| `backgroundImage.js` | | 窗口自定背景图 |

### A5 邻近窗口(不在本次范围,供边界参考)

- **Dashboard 窗口**:`createDashboardWindow()` main.js:7190-7305;`renderer/dashboard.html`(76)/`dashboard.js`(829)/`dashboard.css`;IPC @9075-9085
- **macOS Widget**:`src/electron/macWidget/`(bridge/demand/history/snapshot…)

---

## B. 侧边永久悬浮窗(Edge Dock)

### B0 概念模型

- 三个 surface:**rail**(贴边竖条)/ **bubble**(悬停后弹出的卡片)/ **peek**(鼠标接近时的把手)
- 三种模式 `geometry.js:77`:`EDGE_DOCK_MODES = ['autoHide', 'always', 'alwaysExceptFullScreen']`
  - **「永久」= `always`(吸附后 rail 永不缩回,只有卡片进出,见 geometry.js:385-386)/ `alwaysExceptFullScreen`(全屏应用覆盖时退化为 autoHide)**
- 全屏判定:`fullScreenProbe.js`(controller 里 `refreshFullScreen` @166、`syncAlwaysVisible` @183 驱动)
- 开关与参数(settings,13 个键):`edgeDockEnabled`、`edgeDockMode`、`edgeDockSide`(left/right)、`edgeDockOffset`、`edgeDockDisplayId`、`edgeDockSize`、`edgeDockCustomScale`、`edgeDockMacBackdrop`、`edgeDockHaptic`、`edgeDockWarnColors`、`edgeDockRefreshEnabled`、`edgeDockRunningIndicatorEnabled`、`edgeDockItems`

### B1 主进程 controller —— `src/electron/edgeDock/controller.js`(1369 行)

| 职能 | 行 |
|---|---|
| 平台支持判定 `edgeDockSupported` / `canUseEdgeDock` | 47-63 |
| 工厂 `createEdgeDockController(deps)`(deps 由 main.js:5713 注入:preload 路径、材质、haptics、切账号、刷新回调…) | 65 |
| 「永久」逻辑:`alwaysVisible` @159、`refreshFullScreen` @166、`syncAlwaysVisible` @183 | |
| 布局:placement @204、display @214、scale @233-248、metrics @249、syncPageZoom @256、layout @269 | |
| 窗口池:三个 surface `createSurface()` @503-584(`new BrowserWindow` @514,`loadFile .../edgeDock/index.html?surface=...` @581) | |
| 形状/材质:`shapeGlass` @598、macOS mask | |
| 窗口管理:`destroyWindows` @612、`commandsFor` @647、`placeSurface` @678、`buildWindows` @728 | |
| 显隐/交互:`showPeek` @744、`setPeekMode` @762、刷新按钮 @798-826、`positionRail` @827、`revealRail` @836、`retractRail` @863、`showBubble` @876、`hideBubble` @903、`placeBubble` @913、`applyEffects` @924 | |
| 轮询/拖拽:`poll` @935-1006、`followDrag` @1007、`handleDragStart` @1031、`handleDragEnd` @1041 | |
| dock IPC 注册 `registerIpc()` | 1054-1191 |
| 显示器变化 @1192-1213;生命周期 `start` @1214、`restoreWindowsTopmost` @1232、`onWake` @1247、`stop` @1258 | |
| **对外 API(main.js 只会用到这几个)**:`previewScale` @1280、`sync` @1288、`setCells` @1304、`setAppearance` @1346、`isRunning` @1359、`owns` @1360、`stop` @1361 | 1277-1362 |

同目录支撑:`geometry.js`(模式/侧/偏移/尺寸的 normalize + 坐标换算)、`fullScreenProbe.js`、`mask.js`、`macVibrancyMask.js`、`macHaptics.js`、`pointerButtons.js`。

**bridge** `edgeDock/preload.js:32` — `window.tokenMonitorEdgeDock`,刻意窄:只 exposed `ready/click/pointer/dragStart/dragEnd/reportBubbleSize/dismiss/toggleRateMode/refreshLimits/peekPainted/switchCodexAccount/openResetForecastSource/onRender`。

### B2 渲染器 —— `src/electron/renderer/edgeDock/`

- `index.html:52` — `surface` 取自 query(默认 rail);灯光流:shared 模块 → renderer 模块 → `items.js` @46 → `presentation.js` @47 → `dock.js` @50
- `dock.js:1899`(主体)
  - 入口:`bridge = window.tokenMonitorEdgeDock` @7;两层结构(shape SVG + content)@87-92
  - 绘制:`updateShape` @454、`renderPeek` @512、`renderRail` @1085、`renderBubble` @1751、总入口 `render` @1774
  - 环形配额:`ringNode` @582、动效 @853-1040;卡片:`providerCard` @1417、`statCard` @1522、`sessionsCard` @1623
  - 会话行:`sessionsContainer` @1291;自重绘调度:`scheduleSelfRepaint` @1885-1898;`bridge.ready()` @1899
- `dock.css:1032` — dock 专用样式(含轮廓/mask/动效)
- **★共用模块**(主进程也 require,改前先看调用方):
  - `presentation.js`(847):`buildEdgeDockCells` —— 主进程用它算 cell 数量和 hover 命中,渲染器用它画同一批 cell,保证两边一致
  - `items.js`(187):`edgeDockItems` 持久化形状 + `normalizeEdgeDockItems` + `DERIVED_PERIODS`
  - `shapes.js`(158):轮廓 command list → 渲染器画 SVG / macOS 主进程光栅化成 mask
- **composer 注意**:`composer.js`/`composer.css` 是「dock 内容设置器」,但它挂在**主窗口**里(`index.html:9` 载 CSS、`1721` 载 JS),dock 自己**不加载**它

### B3 主进程接线(main.js)

| 接线点 | 行 |
|---|---|
| `require` 导入(controller/geometry/presentation/items/shapes/mask…) | 412-431 |
| 设置默认值与 normalize | 604-616 / 2640-2652 |
| 运行时块(从 `let edgeDockController` 开始):appearance @5413、live rate @5458-5516、derived periods @5521-5589、reset forecast @5591-5617、cells @5629-5665、session 到期重绘 @5674-5709、**`ensureEdgeDockController()` @5711-5775**、**`syncEdgeDock()` @5777-5805** | 5409-5805 |
| 托盘菜单 `setEdgeDockFromMenu` @5901;菜单项注册 @6057-6076 | |
| `syncEdgeDock()` 调用点:启动 @7392、订阅变更 @7418/7427/7434、settings:update @7756、系统主题变化 @7336 | |
| 设置回推渲染器(含 edgeDock* 全键)@7600-7620;自定义缩放预览 @7861-7864 | |
| 配额流推送→cells:`updateEdgeDockCells` @4779、4811;手动 stats @6424-6425 | |
| 生命周期:最后一个真实窗口关闭判定 @7113-7115、activate 所有权判定 @9090、退出停止 @9120 | |
| dock 切 Codex 账号 `switchCodexAccountFromEdgeDock` @1908 | |

### B4 dock 渲染器的共享依赖(来自 `src/shared/`,见 index.html:12-45)

`currency.js`、`compactTokens.js`、`compactMoney.js`、`limits/balanceDisplay.js`、`limits/providers.js`、`limits/windowLabels.js`、`limits/usageItems.js`、`limits/windowText.js`、`subscriptionDisplay.js`、`subscriptionText.js`、`sessionActivityProviders.js`、`sessionLive.js`、`providers/reasonix/sessionGuard.js`、`clientCatalog.js`、`vendorPresentation.js`、`fontSettings.js`、`trayText.js`。

---

## C. 改哪里 → 对什么(速查)

| 想改的东西 | 主入口 |
|---|---|
| 主窗口外观/布局/内容 | `renderer/index.html`、`renderer/styles.css`、`renderer/app.js` + 对应 view 模块 |
| 窗口行为(无边框/拖拽/置顶/圆角/毛玻璃) | main.js:7005-7150 + `windowBehavior.js`、`windowsChrome.js`、`windowsBackdrop.js`、`nativeMaterialVisibility.js` |
| 折叠气泡 | `floatingBubble.js` + main.js:2085-2328/7869-7950 + `app.js:7811-7940` |
| 侧边悬浮窗整体行为(吸附/缩回/拖拽/多屏) | `edgeDock/controller.js` + `edgeDock/geometry.js` |
| 侧边悬浮窗显示内容(cell 定义) | `renderer/edgeDock/presentation.js`(★双端) |
| 侧边悬浮窗视觉 | `renderer/edgeDock/dock.js` + `dock.css` + `shapes.js`(★) |
| dock 设置项 | `items.js`(★)+ `edgeDock/composer.js`(在主窗口里)+ main.js:7600-7620 |
| 两个窗口用的 i18n/主题/材质 | `renderer/i18n.js`、`themePresets.js`、`glassRendering.js`、`motionPreference.js` |

**改动的三个坑**:

1. `presentation.js` / `items.js` / `shapes.js` / `windowShortcut.js` / `motionPreference.js` 是**主进程+渲染器双端共用**,改形状要同时验证两端(主进程端逻辑不跑在浏览器里,很多 DOM 假设会崩)。
2. `main.js` 里 dock 的 settings 键存在**两处 normalize**(604-616 默认、2640-2652 合并、7600-7620 回推),新增设置项要三处都过。
3. 兼容面:settings 键、`window.tokenMonitor` / `window.tokenMonitorEdgeDock` 的 bridge 方法名都是外部契约,改名即破坏。
