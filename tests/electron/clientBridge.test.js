'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createClientBridge,
  clientBridge,
  TelemetryService,
  LimitsService,
  SessionService,
  SettingsService,
  WindowService,
  createMockBackend,
  DEFAULT_MOCK_DATA
} = require('../../src/electron/renderer/bridge/clientBridge');

const { createTelemetryService } = require('../../src/electron/renderer/bridge/telemetryService');
const { createLimitsService } = require('../../src/electron/renderer/bridge/limitsService');
const { createSessionService } = require('../../src/electron/renderer/bridge/sessionService');
const { createSettingsService } = require('../../src/electron/renderer/bridge/settingsService');
const { createWindowService } = require('../../src/electron/renderer/bridge/windowService');
const { DEFAULT_MOCK_DATA: MOCK_FIXTURES } = require('../../src/electron/renderer/bridge/mockData');

test('clientBridge initializes in standalone mock mode when backend is omitted', () => {
  assert.ok(clientBridge);
  assert.equal(clientBridge.isMock, true);
  const bridge = createClientBridge({ mock: true });
  assert.equal(bridge.isMock, true);
  assert.equal(bridge.isStandalone, true);
  assert.ok(bridge.telemetry instanceof TelemetryService);
  assert.ok(bridge.limits instanceof LimitsService);
  assert.ok(bridge.sessions instanceof SessionService);
  assert.ok(bridge.settings instanceof SettingsService);
  assert.ok(bridge.window instanceof WindowService);
  assert.ok(bridge.mock);
});

test('service factory helpers instantiate respective services', () => {
  const mockBackend = createMockBackend();
  const sub = () => () => {};
  const emit = () => {};

  const tel = createTelemetryService({ backend: mockBackend, subscribe: sub, emit });
  const lim = createLimitsService({ backend: mockBackend, subscribe: sub, emit });
  const ses = createSessionService({ backend: mockBackend, subscribe: sub, emit });
  const set = createSettingsService({ backend: mockBackend, subscribe: sub, emit });
  const win = createWindowService({ backend: mockBackend, subscribe: sub, emit });

  assert.ok(tel instanceof TelemetryService);
  assert.ok(lim instanceof LimitsService);
  assert.ok(ses instanceof SessionService);
  assert.ok(set instanceof SettingsService);
  assert.ok(win instanceof WindowService);
});

test('TelemetryService fetches stats, periods, models, costs, and stream status', async () => {
  const bridge = createClientBridge({ mock: true });
  const stats = await bridge.telemetry.getStats();

  assert.ok(stats.snapshot);
  assert.ok(stats.periods.today.totalTokens > 0);
  assert.ok(stats.periods.month.totalTokens > 0);
  assert.ok(stats.periods.allTime.totalTokens > 0);

  const today = await bridge.telemetry.getPeriodStats('today');
  assert.equal(today.totalTokens, stats.periods.today.totalTokens);

  const tokens = await bridge.telemetry.getTokens('today');
  assert.equal(tokens, stats.periods.today.totalTokens);

  const costs = await bridge.telemetry.getCosts('today');
  assert.equal(costs.costUsd, stats.periods.today.costUsd);
  assert.ok(costs.clientCosts.codex > 0);

  const models = await bridge.telemetry.getModels('today');
  assert.ok(models.tokens['gpt-4o'] > 0);
  assert.ok(models.costs['gpt-4o'] > 0);

  const providers = await bridge.telemetry.getProviders('today');
  assert.ok(providers.tokens.codex > 0);
  assert.ok(providers.costs.codex > 0);

  const history = await bridge.telemetry.getHistory();
  assert.ok(Array.isArray(history.daily));
  assert.ok(history.daily.length > 0);

  const pricing = await bridge.telemetry.lookupModelPricing('gpt-4o');
  assert.ok(pricing.cost.prompt > 0);
  assert.ok(pricing.cost.completion > 0);

  const streamStatus = await bridge.telemetry.getStreamStatus();
  assert.equal(streamStatus.active, true);
  assert.ok(streamStatus.velocity > 0);

  const velocity = bridge.telemetry.getLiveVelocity(stats);
  assert.equal(velocity, stats.live.velocityTokensPerSec);
});

test('TelemetryService handles missing period stats gracefully', async () => {
  const bridge = createClientBridge({ mock: true });
  const emptyPeriod = await bridge.telemetry.getPeriodStats('nonexistent', { periods: {} });
  assert.equal(emptyPeriod.totalTokens, 0);
  assert.equal(emptyPeriod.costUsd, 0);
  assert.deepEqual(emptyPeriod.models, {});

  const zeroVelocity = bridge.telemetry.getLiveVelocity(null);
  assert.equal(zeroVelocity, 0);
});

test('LimitsService queries provider health, reset forecasts, and quotas', async () => {
  const bridge = createClientBridge({ mock: true });
  const serviceStatus = await bridge.limits.getServiceStatus();
  assert.ok(Array.isArray(serviceStatus));
  assert.ok(serviceStatus.find((p) => p.id === 'codex'));

  const forecast = await bridge.limits.getCodexResetForecast();
  assert.equal(forecast.providerId, 'codex');
  assert.ok(forecast.forecastDailyAllowance > 0);

  const limits = await bridge.limits.getLimits();
  assert.ok(limits.codex);
  assert.equal(limits.codex.status, 'healthy');

  const quota = bridge.limits.getProviderQuota('codex', limits);
  assert.equal(quota.provider, 'codex');
  assert.equal(quota.quota.percent, 41);

  const orgChoices = await bridge.limits.listOrganizationChoices('codex');
  assert.ok(Array.isArray(orgChoices));
  assert.equal(orgChoices[0].id, 'org-1');

  const saveCred = await bridge.limits.saveCredential('claude', { key: 'secret' });
  assert.equal(saveCred.ok, true);

  const clearCred = await bridge.limits.clearCredential('claude');
  assert.equal(clearCred.ok, true);
});

test('LimitsService manages provider accounts and profiles', async () => {
  const bridge = createClientBridge({ mock: true });

  // Codex
  const codexAccounts = await bridge.limits.codex.accounts();
  assert.ok(Array.isArray(codexAccounts));
  const newCodex = await bridge.limits.codex.addAccount();
  assert.equal(newCodex.ok, true);
  assert.ok(newCodex.account.id);
  await bridge.limits.codex.setAccountEnabled(newCodex.account.id, false);
  await bridge.limits.codex.switchSystemAccount(newCodex.account.id);
  await bridge.limits.codex.removeAccount(newCodex.account.id);

  // Cursor
  const cursorStatus = await bridge.limits.cursor.status();
  assert.equal(cursorStatus.loggedIn, true);
  await bridge.limits.cursor.logout();
  const cursorLoggedOut = await bridge.limits.cursor.status();
  assert.equal(cursorLoggedOut.loggedIn, false);
  await bridge.limits.cursor.loginManual('mock-token');
  const cursorLoggedIn = await bridge.limits.cursor.status();
  assert.equal(cursorLoggedIn.loggedIn, true);

  // OpenCode
  const opencodeProfiles = await bridge.limits.opencode.getProfiles();
  assert.ok(Array.isArray(opencodeProfiles));
  await bridge.limits.opencode.saveProfile('work', 'key-123');
  await bridge.limits.opencode.renameProfile('work', 'work-renamed');
  await bridge.limits.opencode.setProfileEnabled('work-renamed', false);
  await bridge.limits.opencode.deleteProfile('work-renamed');

  // OpenRouter
  await bridge.limits.openrouter.saveProfile('custom', 'sk-custom');
  await bridge.limits.openrouter.renameProfile('custom', 'custom-renamed');
  await bridge.limits.openrouter.setProfileEnabled('custom-renamed', false);
  await bridge.limits.openrouter.deleteProfile('custom-renamed');

  // ThirdParty
  await bridge.limits.thirdparty.saveProfile({ name: 'custom-llm', baseUrl: 'https://example.com' });
  await bridge.limits.thirdparty.renameProfile('custom-llm', 'custom-llm-2');
  await bridge.limits.thirdparty.setProfileEnabled('custom-llm-2', true);
  await bridge.limits.thirdparty.deleteProfile('custom-llm-2');

  // Antigravity & MiMo & Copilot
  const agyAccounts = await bridge.limits.antigravity.accounts();
  assert.ok(Array.isArray(agyAccounts));
  const newAgy = await bridge.limits.antigravity.addAccount();
  assert.ok(newAgy.account.id);
  await bridge.limits.antigravity.removeAccount(newAgy.account.id);

  const mimoAccounts = await bridge.limits.mimo.accounts();
  assert.ok(Array.isArray(mimoAccounts));
  const newMimo = await bridge.limits.mimo.addAccount('cookie');
  assert.ok(newMimo.account.id);
  await bridge.limits.mimo.removeAccount(newMimo.account.id);

  const copilotRes = await bridge.limits.copilot.signIn();
  assert.equal(copilotRes.ok, true);
});

test('SessionService retrieves sessions, details, and groups parents/children', async () => {
  const bridge = createClientBridge({ mock: true });
  const sessions = await bridge.sessions.getSessions();
  assert.ok(Array.isArray(sessions));
  assert.ok(sessions.length >= 4);

  const grouped = bridge.sessions.groupSessionsByParent(sessions);
  const parentWithChild = grouped.find((s) => s.id === 'sess-001');
  assert.ok(parentWithChild);
  assert.equal(parentWithChild.children.length, 1);
  assert.equal(parentWithChild.children[0].id, 'sess-001-child-1');

  const filtered = bridge.sessions.filterSessions(sessions, { client: 'codex', minTokens: 20000 });
  assert.ok(filtered.every((s) => s.client === 'codex' && s.tokens >= 20000));

  const queryFiltered = bridge.sessions.filterSessions(sessions, { query: 'migration' });
  assert.equal(queryFiltered.length, 1);
  assert.equal(queryFiltered[0].id, 'sess-002');

  const detail = await bridge.sessions.getSessionDetail({ sessionId: 'sess-001' });
  assert.equal(detail.id, 'sess-001');
  assert.ok(Array.isArray(detail.turns));

  const turns = bridge.sessions.extractTurns(detail);
  assert.equal(turns.length, detail.turns.length);
  assert.ok(turns[0].totalTokens > 0);
  assert.ok(Array.isArray(turns[0].tools));

  await bridge.sessions.clearArchive();
  const clearedSessions = await bridge.sessions.getSessions();
  assert.equal(clearedSessions.length, 0);
});

test('SettingsService gets, updates, and persists settings with push notifications', async () => {
  const bridge = createClientBridge({ mock: true });
  const initial = await bridge.settings.getSettings();
  assert.equal(initial.currency, 'USD');

  let pushedSettings = null;
  const unbind = bridge.settings.onSettings((settings) => {
    pushedSettings = settings;
  });

  const updated = await bridge.settings.updateSettings({ currency: 'EUR', dashboardFlat: true });
  assert.equal(updated.currency, 'EUR');
  assert.equal(updated.dashboardFlat, true);
  assert.equal(pushedSettings.currency, 'EUR');

  unbind();
  await bridge.settings.updateSettings({ currency: 'GBP' });
  // Listener was unbound, so pushedSettings remains 'EUR'
  assert.equal(pushedSettings.currency, 'EUR');

  await bridge.settings.chooseBackgroundImage();
  const bg = await bridge.settings.getBackgroundImage();
  assert.ok(bg);
  await bridge.settings.clearBackgroundImage();
  const clearedBg = await bridge.settings.getBackgroundImage();
  assert.equal(clearedBg, null);

  const material = await bridge.settings.getNativeMaterialState();
  assert.ok(material.type);
});

test('WindowService manages window actions, bubbles, and ready state', async () => {
  const bridge = createClientBridge({ mock: true });

  let visibilityEvents = [];
  const unbindVis = bridge.window.onVisibility((v) => visibilityEvents.push(v));

  bridge.window.minimize();
  assert.equal(visibilityEvents[visibilityEvents.length - 1], false);

  bridge.window.close();
  assert.equal(visibilityEvents[visibilityEvents.length - 1], false);
  unbindVis();

  const dashRes = await bridge.window.openDashboard();
  assert.equal(dashRes.ok, true);
  bridge.window.dashboard.ready();
  bridge.window.dashboard.minimize();
  bridge.window.dashboard.close();

  let bubblePayload = null;
  const unbindBubble = bridge.window.onFloatingBubbleState((payload) => {
    bubblePayload = payload;
  });

  await bridge.window.collapseBubbleIfIdle();
  assert.equal(bubblePayload.collapsed, true);

  await bridge.window.expandBubble();
  assert.equal(bubblePayload.collapsed, false);

  await bridge.window.setBubbleCollapsedSize({ width: 400, height: 50 });
  assert.deepEqual(bridge.mock.data.floatingBubbleState.size, { width: 400, height: 50 });

  unbindBubble();
});

test('subscribe and emit manage event subscriptions cleanly with unsubscribe', () => {
  const bridge = createClientBridge({ mock: true });
  let eventsReceived = [];

  const unsub1 = bridge.subscribe('custom-event', (data) => eventsReceived.push(`sub1:${data}`));
  const unsub2 = bridge.subscribe('custom-event', (data) => eventsReceived.push(`sub2:${data}`));

  bridge.emit('custom-event', 'hello');
  assert.deepEqual(eventsReceived, ['sub1:hello', 'sub2:hello']);

  eventsReceived = [];
  unsub1();
  bridge.emit('custom-event', 'world');
  assert.deepEqual(eventsReceived, ['sub2:world']);

  unsub2();
  eventsReceived = [];
  bridge.emit('custom-event', 'ignored');
  assert.deepEqual(eventsReceived, []);
});

test('mock traffic simulator emits periodic stats updates', async () => {
  const bridge = createClientBridge({ mock: true });
  let emittedStats = [];

  const unbind = bridge.telemetry.onStats((stats) => {
    emittedStats.push(stats);
  });

  bridge.mock.simulateTraffic({ intervalMs: 20, tokensDelta: 50 });

  await new Promise((resolve) => setTimeout(resolve, 80));
  bridge.mock.stopTraffic();

  unbind();
  assert.ok(emittedStats.length >= 2, `Expected at least 2 ticks, got ${emittedStats.length}`);
  assert.ok(emittedStats[0].periods.today.totalTokens > 0);
});

test('createTokenMonitorCompat exposes 100% backwards-compatible API mapping', async () => {
  const bridge = createClientBridge({ mock: true });
  const compat = bridge.createTokenMonitorCompat();

  assert.equal(typeof compat.getStats, 'function');
  assert.equal(typeof compat.getDashboardHistory, 'function');
  assert.equal(typeof compat.getSettings, 'function');
  assert.equal(typeof compat.updateSettings, 'function');
  assert.equal(typeof compat.onStatsPush, 'function');
  assert.equal(typeof compat.onSettingsPush, 'function');
  assert.equal(typeof compat.openDashboard, 'function');
  assert.equal(typeof compat.dashboard.ready, 'function');
  assert.equal(typeof compat.codex.accounts, 'function');
  assert.equal(typeof compat.cursor.status, 'function');
  assert.equal(typeof compat.limits.saveCredential, 'function');
  assert.equal(compat.bridge, bridge);

  const stats = await compat.getStats();
  assert.ok(stats.snapshot);

  const updatedSettings = await compat.updateSettings({ theme: 'dark' });
  assert.equal(updatedSettings.theme, 'dark');

  let statsPushed = null;
  const unbind = compat.onStatsPush((p) => { statsPushed = p; });
  bridge.emit('stats', { mockStats: true });
  assert.deepEqual(statsPushed, { mockStats: true });
  unbind();
});

test('installAsGlobal populates globalThis/window targets correctly', () => {
  const fakeWindow = {};
  const bridge = createClientBridge({ mock: true });
  bridge.installAsGlobal(fakeWindow);

  assert.equal(fakeWindow.clientBridge, bridge);
  assert.ok(fakeWindow.TokenMonitorClientBridge);
  assert.ok(fakeWindow.tokenMonitor);
  assert.equal(typeof fakeWindow.tokenMonitor.getStats, 'function');
});

test('ClientBridge wraps an existing Electron window.tokenMonitor backend properly', async () => {
  let backendCalls = [];
  let unbindCalled = false;

  const mockElectronBackend = {
    getStats: async (opts) => { backendCalls.push(['getStats', opts]); return { electron: true }; },
    getSettings: async () => { backendCalls.push(['getSettings']); return { currency: 'USD' }; },
    onStatsPush: (_cb) => {
      backendCalls.push(['onStatsPush']);
      // Simulate Electron returning unbind function
      return () => { unbindCalled = true; };
    }
  };

  const bridge = createClientBridge({ backend: mockElectronBackend, mock: false });
  assert.equal(bridge.isMock, false);

  const stats = await bridge.telemetry.getStats({ force: true });
  assert.deepEqual(stats, { electron: true });
  assert.deepEqual(backendCalls[0], ['getStats', { force: true }]);

  const unbind = bridge.subscribe('stats', (_s) => {});
  assert.equal(backendCalls.some(([name]) => name === 'onStatsPush'), true);

  unbind();
  assert.equal(unbindCalled, true);
});

test('DEFAULT_MOCK_DATA exports rich fixtures', () => {
  assert.ok(DEFAULT_MOCK_DATA.stats.periods.today.totalTokens > 0);
  assert.ok(MOCK_FIXTURES.stats.periods.today.totalTokens > 0);
  assert.ok(DEFAULT_MOCK_DATA.sessions.length > 0);
  assert.ok(DEFAULT_MOCK_DATA.serviceStatus.length > 0);
});
