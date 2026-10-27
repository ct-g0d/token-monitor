'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  LIMIT_PROVIDER_CATALOG,
  LIMIT_PROVIDER_IDS,
  LIMIT_PROVIDER_LABELS,
  limitProviderForClient
} = require('../../src/shared/limits/providers');
const { LIMIT_PROVIDER_REGISTRY } = require('../../src/shared/limits/registry');
const { discoveredLimitProviderIds } = require('../../src/electron/limits/accountSettings');
const {
  skipTaskbarForSettings
} = require('../../src/electron/trayModeSettings');
const {
  summarizeResetForecast,
  overallSystemStatus
} = require('../../src/electron/renderer/serviceStatusPresentation');

test('Task 2: registered auto-detection hooks are defined and functional', () => {
  const autoDetectExpected = ['qoder', 'copilot', 'codex', 'claude', 'antigravity', 'cline', 'opencode', 'workbuddy', 'zai', 'factory'];
  for (const id of autoDetectExpected) {
    const entry = LIMIT_PROVIDER_REGISTRY.find((e) => e.id === id);
    assert.ok(entry, `Provider registry entry for ${id} must exist`);
    assert.equal(typeof entry.discover, 'function', `Provider ${id} must define discover function`);
  }
});

test('Task 2: discoveredLimitProviderIds identifies auto-detected providers from environment', () => {
  const mockEnv = {
    QODER_COOKIE: 'session_mock_token_qoder',
    COPILOT_API_TOKEN: 'gho_mock_token_copilot'
  };
  const discovered = discoveredLimitProviderIds(mockEnv);
  assert.ok(discovered.includes('qoder'), 'Qoder must be detected when credential present');
  assert.ok(discovered.includes('copilot'), 'Copilot must be detected when credential present');
});

test('Task 2: client alias mapping correctly resolves to registered limits providers', () => {
  assert.equal(limitProviderForClient('qoder'), 'qoder');
  assert.equal(limitProviderForClient('qodercn'), 'qoder');
  assert.equal(limitProviderForClient('zcode'), 'zai');
  assert.equal(limitProviderForClient('droid'), 'factory');
  assert.equal(limitProviderForClient('dsh'), 'deepseek');
  assert.equal(limitProviderForClient('mcode'), 'minimax');
});

test('Task 12: status presentation summarizes Tibo reset forecasts correctly', () => {
  const scheduled = summarizeResetForecast({
    status: 'scheduled',
    scheduledResetType: 'banked',
    scheduledFor: '2026-10-28T00:00:00Z'
  });
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.headline, 'Scheduled Banked Reset');
  assert.equal(scheduled.badgeTone, 'ok');

  const active = summarizeResetForecast({
    status: 'active',
    chancePercent: 78.4,
    predictedAt: '2026-10-27T18:00:00Z'
  });
  assert.equal(active.status, 'active');
  assert.equal(active.headline, '78% Chance');
  assert.equal(active.badgeTone, 'signal');

  const disabled = summarizeResetForecast({ status: 'disabled' });
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.badgeTone, 'muted');
});

test('Task 12: overallSystemStatus aggregates provider health and active incidents', () => {
  const summaryOperational = overallSystemStatus([
    { id: 'codex', status: 'operational' },
    { id: 'claude', status: 'operational' }
  ]);
  assert.equal(summaryOperational.tone, 'ok');
  assert.equal(summaryOperational.label, 'All Systems Operational');

  const summaryDegraded = overallSystemStatus([
    { id: 'codex', status: 'degraded', incidentTitle: 'Elevated latency' },
    { id: 'claude', status: 'operational' }
  ]);
  assert.equal(summaryDegraded.tone, 'degraded');
  assert.equal(summaryDegraded.activeIncidents, 1);
});

test('Cross-cutting: taskbar presence defaults to visible and respects tray hiding modes', () => {
  // Baseline clean settings without skipTaskbar property (canonical defaultSettings)
  const defaultSettingsMock = {
    showTrayIcon: true,
    trayMode: false,
    hideAppIcon: false
  };
  assert.equal(skipTaskbarForSettings(defaultSettingsMock), false, 'Window must appear on taskbar by default');

  // When tray hiding mode is enabled, taskbar entry is skipped
  assert.equal(skipTaskbarForSettings({ showTrayIcon: true, hideAppIcon: true }), true);
  assert.equal(skipTaskbarForSettings({ showTrayIcon: true, trayMode: true }), true);

  // Explicit skipTaskbar boolean override takes precedence
  assert.equal(skipTaskbarForSettings({ showTrayIcon: true, hideAppIcon: true, skipTaskbar: false }), false);
  assert.equal(skipTaskbarForSettings({ showTrayIcon: true, skipTaskbar: true }), true);
});

test('Cross-cutting: all catalog providers have defined id and label entries', () => {
  assert.ok(LIMIT_PROVIDER_CATALOG.length > 0, 'Catalog must contain providers');
  assert.equal(LIMIT_PROVIDER_CATALOG.length, LIMIT_PROVIDER_IDS.length, 'Catalog length must match ID list length');
  for (const provider of LIMIT_PROVIDER_CATALOG) {
    assert.ok(provider.id, 'Provider must have id');
    assert.ok(provider.label, 'Provider must have label');
    assert.equal(LIMIT_PROVIDER_LABELS[provider.id], provider.label);
  }
});

test('Cross-cutting: TODO checklist contains tracked status for all 23 tasks', () => {
  const checklist = fs.readFileSync(path.join(__dirname, '../../TODO_CHECKLIST.md'), 'utf8');
  for (let i = 1; i <= 23; i++) {
    const pattern = new RegExp(`Task ${i} \\(`);
    assert.ok(pattern.test(checklist), `Checklist must document Task ${i}`);
  }
});

test('Cross-cutting: hub build registry generated state is consistent between node and worker', () => {
  const nodeRegistry = require('../../src/shared/hubBuildRegistry.json');
  const workerRegistry = require('../../worker/src/shared/hubBuildRegistry.json');
  assert.deepEqual(nodeRegistry, workerRegistry, 'Node and worker hub build registries must match');
});
