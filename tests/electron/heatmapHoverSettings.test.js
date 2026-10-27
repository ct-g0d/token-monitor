'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.join(__dirname, '..', '..');

test('normalizeHeatmapHoverBehavior accepts valid values and falls back safely', () => {
  const main = fs.readFileSync(path.join(rootDir, 'src', 'electron', 'main.js'), 'utf8');
  const match = main.match(/function normalizeHeatmapHoverBehavior\([\s\S]*?^}/m);
  assert.ok(match, 'normalizeHeatmapHoverBehavior should be defined in main.js');

  const context = {};
  vm.runInNewContext(match[0], context);
  const normalize = context.normalizeHeatmapHoverBehavior;

  assert.equal(normalize('detailed'), 'detailed');
  assert.equal(normalize('compact'), 'compact');
  assert.equal(normalize('off'), 'off');
  assert.equal(normalize('  compact  '), 'compact');
  assert.equal(normalize('invalid'), 'detailed');
  assert.equal(normalize(null), 'detailed');
  assert.equal(normalize(undefined), 'detailed');
  assert.equal(normalize('unknown', 'compact'), 'compact');
  assert.equal(normalize('unknown', 'off'), 'off');
});

test('defaultSettings and patch normalization include heatmapHoverBehavior', () => {
  const main = fs.readFileSync(path.join(rootDir, 'src', 'electron', 'main.js'), 'utf8');
  assert.match(main, /heatmapHoverBehavior:\s*'detailed'/);
  assert.match(main, /merged\.heatmapHoverBehavior\s*=\s*normalizeHeatmapHoverBehavior\(merged\.heatmapHoverBehavior\)/);
  assert.match(main, /normalizedPatch\.heatmapHoverBehavior\s*=\s*normalizeHeatmapHoverBehavior\(patch\.heatmapHoverBehavior,\s*settings\.heatmapHoverBehavior\)/);
});

test('types.ts defines HeatmapHoverBehavior and includes it in TokenMonitorSettingsState', () => {
  const types = fs.readFileSync(path.join(rootDir, 't3_app_ui', 'src', 'settings', 'types.ts'), 'utf8');
  assert.match(types, /export type HeatmapHoverBehavior = 'detailed' \| 'compact' \| 'off';/);
  assert.match(types, /heatmapHoverBehavior\?:\s*HeatmapHoverBehavior;/);
});

test('GeneralSettings.tsx renders isolated Heatmap Hover Details control with detailed, compact, and off options', () => {
  const generalSettings = fs.readFileSync(path.join(rootDir, 't3_app_ui', 'src', 'settings', 'GeneralSettings.tsx'), 'utf8');
  assert.match(generalSettings, /title="Heatmap Hover Details"/);
  assert.match(generalSettings, /updateSettings\(\{\s*heatmapHoverBehavior:\s*e\.target\.value as any\s*\}\)/);
  assert.match(generalSettings, /<option value="detailed">/);
  assert.match(generalSettings, /<option value="compact">/);
  assert.match(generalSettings, /<option value="off">/);
});

test('ActivityHeatmap.tsx exports HeatmapHoverBehavior and integrates hoverBehavior option', () => {
  const heatmap = fs.readFileSync(path.join(rootDir, 't3_app_ui', 'src', 'components', 'usage', 'ActivityHeatmap.tsx'), 'utf8');
  assert.match(heatmap, /export type \{ HeatmapHoverBehavior \};/);
  assert.match(heatmap, /hoverBehavior\?:\s*HeatmapHoverBehavior \| undefined;/);
  assert.match(heatmap, /hoverBehaviorProp \?\? settings\.heatmapHoverBehavior \?\? 'detailed'/);
  assert.match(heatmap, /isHoverDisabled = hoverBehavior === 'off'/);
  assert.match(heatmap, /if \(isHoverDisabled\) return;/);
  assert.match(heatmap, /hoverBehavior !== 'compact' \|\| metric === 'tokens'/);
  assert.match(heatmap, /hoverBehavior !== 'compact' \|\| metric === 'cost'/);
});

test('ActivityHeatmap.tsx preserves boundary hover rings and removes Today badge from tooltip', () => {
  const heatmap = fs.readFileSync(path.join(rootDir, 't3_app_ui', 'src', 'components', 'usage', 'ActivityHeatmap.tsx'), 'utf8');
  // 1. Grid container padding/negative-margin prevents edge hover ring clipping on all sides
  assert.match(heatmap, /overflow-hidden p-1 -m-1/);
  // 2. Viewport client dimensions ensure tooltip doesn't clip on right boundary
  assert.match(heatmap, /document\.documentElement\.clientWidth/);
  assert.match(heatmap, /document\.documentElement\.clientHeight/);
  // 3. Tooltip has max-width boundary constraint
  assert.match(heatmap, /max-w-\[calc\(100vw-16px\)\]/);
  // 4. Today badge removed from tooltip markup
  assert.doesNotMatch(heatmap, /<span[^>]*Today<\/span>/);
});
