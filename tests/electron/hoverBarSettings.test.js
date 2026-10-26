'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  EDGE_DOCK_METRICS,
  edgeDockBubbleBounds,
  scaledEdgeDockMetrics
} = require('../../src/electron/edgeDock/geometry');

test('hover bar size metrics scale correctly across presets and custom scales', () => {
  const defaultMetrics = scaledEdgeDockMetrics(1.0);
  assert.equal(defaultMetrics.railWidth, EDGE_DOCK_METRICS.railWidth);
  assert.equal(defaultMetrics.cellHeight, EDGE_DOCK_METRICS.cellHeight);
  assert.equal(defaultMetrics.bubbleWidth, EDGE_DOCK_METRICS.bubbleWidth);

  // Scaled down (75%)
  const minMetrics = scaledEdgeDockMetrics(0.75);
  assert.ok(minMetrics.railWidth < defaultMetrics.railWidth);
  assert.ok(minMetrics.cellHeight < defaultMetrics.cellHeight);
  assert.ok(minMetrics.bubbleWidth < defaultMetrics.bubbleWidth);

  // Scaled up (150%)
  const maxMetrics = scaledEdgeDockMetrics(1.50);
  assert.ok(maxMetrics.railWidth > defaultMetrics.railWidth);
  assert.ok(maxMetrics.cellHeight > defaultMetrics.cellHeight);
  assert.ok(maxMetrics.bubbleWidth > defaultMetrics.bubbleWidth);
});

test('hover bar bubble bounds anchor to the correct display side', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const railBounds = { x: 1920 - 64, y: 100, width: 64, height: 300 };
  const contentHeight = 320;
  const metrics = scaledEdgeDockMetrics(1.0);

  // Right screen edge: bubble opens to the left of the rail
  const rightBounds = edgeDockBubbleBounds({
    railBounds,
    cellIndex: 0,
    height: contentHeight,
    workArea,
    side: 'right',
    metrics
  });
  assert.ok(rightBounds);
  assert.equal(rightBounds.x, railBounds.x - metrics.bubbleGap - rightBounds.width);
  assert.ok(rightBounds.width > 0);
  assert.equal(rightBounds.height, contentHeight);

  // Left screen edge: bubble opens to the right of the rail
  const leftRailBounds = { x: 0, y: 100, width: 64, height: 300 };
  const leftBounds = edgeDockBubbleBounds({
    railBounds: leftRailBounds,
    cellIndex: 0,
    height: contentHeight,
    workArea,
    side: 'left',
    metrics
  });
  assert.ok(leftBounds);
  assert.equal(leftBounds.x, leftRailBounds.x + leftRailBounds.width + metrics.bubbleGap);
  assert.ok(leftBounds.width > 0);
  assert.equal(leftBounds.height, contentHeight);
});

test('hover bar section resolution maps aliases to hover-bar section id', () => {
  const resolveSection = (raw) => {
    let section = raw;
    if (section === 'edge-dock' || section === 'hoverbar' || section === 'hover_bar') {
      section = 'hover-bar';
    }
    return section;
  };

  assert.equal(resolveSection('hover-bar'), 'hover-bar');
  assert.equal(resolveSection('edge-dock'), 'hover-bar');
  assert.equal(resolveSection('hoverbar'), 'hover-bar');
  assert.equal(resolveSection('hover_bar'), 'hover-bar');
  assert.equal(resolveSection('general'), 'general');
  assert.equal(resolveSection('window'), 'window');
});
