'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  WINDOW_BREAKPOINTS,
  resolveSidebarLayout,
  resolveActivityHeatmapArrangement,
  resolveTotalsTypography,
  resolvePagePadding
} = require('../../src/shared/responsiveLayout');

test('WINDOW_BREAKPOINTS defines standard minimum bounds and responsive breakpoints', () => {
  assert.equal(WINDOW_BREAKPOINTS.MIN_WIDTH, 640);
  assert.equal(WINDOW_BREAKPOINTS.MIN_HEIGHT, 450);
  assert.equal(WINDOW_BREAKPOINTS.COMPACT_MAX_WIDTH, 767);
  assert.equal(WINDOW_BREAKPOINTS.EXPANDED_MIN_WIDTH, 768);
});

test('resolveSidebarLayout switches to compact rail below 768px and expanded at or above 768px', () => {
  const compact = resolveSidebarLayout(640);
  assert.equal(compact.mode, 'compact');
  assert.equal(compact.sidebarWidthPx, 64);
  assert.equal(compact.mainLeftPx, 64);
  assert.equal(compact.showLabels, false);
  assert.equal(compact.showDevices, false);
  assert.equal(compact.compactToday, true);

  const boundaryCompact = resolveSidebarLayout(767);
  assert.equal(boundaryCompact.mode, 'compact');

  const expanded = resolveSidebarLayout(768);
  assert.equal(expanded.mode, 'expanded');
  assert.equal(expanded.sidebarWidthPx, 216);
  assert.equal(expanded.mainLeftPx, 216);
  assert.equal(expanded.showLabels, true);
  assert.equal(expanded.showDevices, true);
  assert.equal(expanded.compactToday, false);

  const largeExpanded = resolveSidebarLayout(1280);
  assert.equal(largeExpanded.mode, 'expanded');
});

test('resolveActivityHeatmapArrangement switches to vertical inline stats below 640px', () => {
  const narrow = resolveActivityHeatmapArrangement(600);
  assert.equal(narrow.direction, 'column');
  assert.equal(narrow.statsArrangement, 'horizontal-inline');
  assert.equal(narrow.heatmapFullWidth, true);

  const wide = resolveActivityHeatmapArrangement(800);
  assert.equal(wide.direction, 'row');
  assert.equal(wide.statsArrangement, 'vertical-column');
  assert.equal(wide.heatmapFullWidth, false);
});

test('resolveTotalsTypography progressively reduces font size to prevent overflow', () => {
  assert.equal(resolveTotalsTypography(600).fontSizePx, 48);
  assert.equal(resolveTotalsTypography(700).fontSizePx, 68);
  assert.equal(resolveTotalsTypography(900).fontSizePx, 88);
  assert.equal(resolveTotalsTypography(1200).fontSizePx, 112);
});

test('resolvePagePadding adapts content margins smoothly across breakpoints', () => {
  assert.equal(resolvePagePadding(600), 16);
  assert.equal(resolvePagePadding(700), 24);
  assert.equal(resolvePagePadding(1000), 32);
  assert.equal(resolvePagePadding(1400), 40);
});
