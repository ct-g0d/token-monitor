'use strict';

/**
 * Responsive layout contracts for Token Monitor shell and pages.
 * Defines breakpoint thresholds, arrangement geometries, and space-utilization modes
 * when the application window shrinks.
 */

const WINDOW_BREAKPOINTS = Object.freeze({
  MIN_WIDTH: 640,
  MIN_HEIGHT: 450,
  COMPACT_MAX_WIDTH: 767,
  EXPANDED_MIN_WIDTH: 768,
  LARGE_MIN_WIDTH: 1024,
  XLARGE_MIN_WIDTH: 1280
});

function resolveSidebarLayout(windowWidth) {
  const width = typeof windowWidth === 'number' && !Number.isNaN(windowWidth)
    ? windowWidth
    : WINDOW_BREAKPOINTS.EXPANDED_MIN_WIDTH;

  if (width < WINDOW_BREAKPOINTS.EXPANDED_MIN_WIDTH) {
    return {
      mode: 'compact',
      sidebarWidthPx: 64,
      mainLeftPx: 64,
      showLabels: false,
      showDevices: false,
      compactToday: true
    };
  }

  return {
    mode: 'expanded',
    sidebarWidthPx: 216,
    mainLeftPx: 216,
    showLabels: true,
    showDevices: true,
    compactToday: false
  };
}

function resolveActivityHeatmapArrangement(windowWidth) {
  const width = typeof windowWidth === 'number' && !Number.isNaN(windowWidth)
    ? windowWidth
    : WINDOW_BREAKPOINTS.EXPANDED_MIN_WIDTH;

  if (width < WINDOW_BREAKPOINTS.MIN_WIDTH) {
    return {
      direction: 'column',
      statsArrangement: 'horizontal-inline',
      heatmapFullWidth: true
    };
  }

  return {
    direction: 'row',
    statsArrangement: 'vertical-column',
    heatmapFullWidth: false
  };
}

function resolveTotalsTypography(windowWidth) {
  const width = typeof windowWidth === 'number' && !Number.isNaN(windowWidth)
    ? windowWidth
    : WINDOW_BREAKPOINTS.EXPANDED_MIN_WIDTH;

  if (width < WINDOW_BREAKPOINTS.MIN_WIDTH) {
    return { fontSizePx: 48, lineHeight: 0.85, metricFlow: 'stacked' };
  }
  if (width < WINDOW_BREAKPOINTS.EXPANDED_MIN_WIDTH) {
    return { fontSizePx: 68, lineHeight: 0.85, metricFlow: 'stacked' };
  }
  if (width < WINDOW_BREAKPOINTS.LARGE_MIN_WIDTH) {
    return { fontSizePx: 88, lineHeight: 0.85, metricFlow: 'inline' };
  }
  return { fontSizePx: 112, lineHeight: 0.85, metricFlow: 'inline' };
}

function resolvePagePadding(windowWidth) {
  const width = typeof windowWidth === 'number' && !Number.isNaN(windowWidth)
    ? windowWidth
    : WINDOW_BREAKPOINTS.EXPANDED_MIN_WIDTH;

  if (width < WINDOW_BREAKPOINTS.MIN_WIDTH) return 16;
  if (width < WINDOW_BREAKPOINTS.EXPANDED_MIN_WIDTH) return 24;
  if (width < WINDOW_BREAKPOINTS.XLARGE_MIN_WIDTH) return 32;
  return 40;
}

module.exports = {
  WINDOW_BREAKPOINTS,
  resolveSidebarLayout,
  resolveActivityHeatmapArrangement,
  resolveTotalsTypography,
  resolvePagePadding
};
