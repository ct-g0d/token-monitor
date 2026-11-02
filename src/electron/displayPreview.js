'use strict';

// A local, read-only projection. Sample data never enters collectors, native
// controllers or saved preferences. Shapes and content use production builders.
const { buildEdgeDockCells } = require('./renderer/edgeDock/presentation');
const { normalizeEdgeDockItems } = require('./renderer/edgeDock/items');
const { EDGE_DOCK_METRICS: M, edgeDockCellLayout, edgeDockScale } = require('./edgeDock/geometry');
const { toSvgPath, railCommands, peekCommands } = require('./renderer/edgeDock/shapes');

const APPEARANCE_KEYS = ['language', 'theme', 'themePreset', 'themeColors', 'vendorColors', 'interfaceFontFamily', 'displayFontFamily', 'textSize', 'glassOpacity', 'glassBlur', 'systemGlass', 'compactTokenUnits', 'currency', 'currencyRate', 'currencyRateOverride', 'currencyRatesEffective', 'showCompactTotalTokens', 'sessionContextMetric', 'tokenNumberAnimation', 'showLimitUsed', 'showCodexAdditionalLimits', 'limitProviderHiddenItems', 'maskLimitAccountEmails', 'edgeDockWarnColors', 'edgeDockRunningIndicatorEnabled', 'tokenRateMode', 'contextDisplayMode'];
function sampleStats(now) {
  const period = { totalTokens: 1240800, costUsd: 3.82, clients: { claude: 840000, codex: 400800 }, clientCosts: { claude: 2.64, codex: 1.18 }, models: { 'claude-sonnet-4-6': 840000, 'gpt-5.4': 400800 }, modelCosts: { 'claude-sonnet-4-6': 2.64, 'gpt-5.4': 1.18 } };
  period.sessions = [{ sessionId: 'preview-session', client: 'claude', title: 'Example project', totalTokens: 48000, costUsd: .24, lastUsedAt: new Date(now).toISOString(), startedAt: new Date(now - 300000).toISOString() }];
  return { periods: { today: period, month: period, allTime: period }, limits: { providers: ['claude', 'codex'].map((provider, i) => ({ provider, accountKey: `preview-${provider}`, status: 'ok', updatedAt: new Date(now).toISOString(), windows: [{ id: 'session', kind: 'session', label: 'Session', usedPercent: 22 + i * 12, resetsAt: new Date(now + 7200000).toISOString() }, { id: 'weekly', kind: 'weekly', label: 'Weekly', usedPercent: 41 + i * 9 }] })) } };
}
function shape(commands, width, height) {
  const d = toSvgPath(commands); return { d, key: d, width, height };
}
function buildDisplayPreview(settings, id, phase = 'closed', platform = process.platform, now = Date.now()) {
  if (id !== 'edgeDock' || !['closed', 'hover', 'open'].includes(phase)) return null;
  const appearance = Object.fromEntries(APPEARANCE_KEYS.filter(key => settings[key] !== undefined).map(key => [key, settings[key]]));
  appearance.reduceMotion = 'on';
  const stats = sampleStats(now);
  const base = { platform, appearance, glass: false, liquidGlass: false, refreshEnabled: false, refreshable: false };
  if (id === 'edgeDock') {
    const cells = buildEdgeDockCells(stats, { ...settings, items: normalizeEdgeDockItems(settings.edgeDockItems) || undefined });
    const side = settings.edgeDockSide === 'left' ? 'left' : 'right';
    const layout = edgeDockCellLayout({ height: 900 }, cells.map(cell => cell.kind));
    const opened = phase === 'open';
    const width = opened ? M.railWidth : M.peekWidth, height = opened ? layout.length : M.peekLength;
    const commands = opened ? railCommands({ width, height, side, shoulder: M.shoulder, radius: M.railRadius })
      : peekCommands({ width, height, side, handleWidth: M.handleWidth, handleLength: M.handleLength });
    return { width, height, scale: edgeDockScale(settings), align: side,
      payload: { ...base, surface: opened ? 'rail' : 'peek', side, zoom: 1, cells, cellLayout: layout, always: true, peeking: !opened, reveal: 0, shape: shape(commands, width, height) } };
  }
}
module.exports = { buildDisplayPreview, sampleStats };
