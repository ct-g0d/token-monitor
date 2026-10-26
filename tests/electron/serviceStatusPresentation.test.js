'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  affectedComponentNames,
  agoBucket,
  statusHeadline,
  summarizeResetForecast,
  overallSystemStatus
} = require('../../src/electron/renderer/serviceStatusPresentation');

test('affectedComponentNames splits names into a visible slice and overflow count', () => {
  const issues = [
    { name: 'claude.ai' },
    { name: 'Claude API' },
    { name: 'Claude Code' },
    { name: 'Claude Cowork' }
  ];

  assert.deepEqual(affectedComponentNames(issues, 2), {
    all: ['claude.ai', 'Claude API', 'Claude Code', 'Claude Cowork'],
    visible: ['claude.ai', 'Claude API'],
    overflow: 2
  });
});

test('affectedComponentNames has no overflow when names fit within the limit', () => {
  const issues = [{ name: 'API' }, { name: 'Search' }];

  assert.deepEqual(affectedComponentNames(issues, 2), {
    all: ['API', 'Search'],
    visible: ['API', 'Search'],
    overflow: 0
  });
});

test('affectedComponentNames ignores blank names and tolerates bad input', () => {
  assert.deepEqual(affectedComponentNames([], 2), { all: [], visible: [], overflow: 0 });
  assert.deepEqual(affectedComponentNames(null, 2), { all: [], visible: [], overflow: 0 });
  assert.deepEqual(affectedComponentNames([{ name: '  ' }, { name: 'Search' }], 2), {
    all: ['Search'],
    visible: ['Search'],
    overflow: 0
  });
});

test('statusHeadline prefers the active incident title over the generic description', () => {
  assert.equal(
    statusHeadline({ incidentTitle: 'Elevated errors on Claude Haiku 4.5', description: 'Partially Degraded Service' }),
    'Elevated errors on Claude Haiku 4.5'
  );
});

test('statusHeadline falls back to the description when no incident is active', () => {
  assert.equal(statusHeadline({ incidentTitle: '', description: 'All Systems Operational' }), 'All Systems Operational');
  assert.equal(statusHeadline({ description: 'All Systems Operational' }), 'All Systems Operational');
});

test('statusHeadline returns an empty string when nothing is known', () => {
  assert.equal(statusHeadline({}), '');
  assert.equal(statusHeadline(null), '');
});

test('agoBucket buckets into seconds, minutes, and hours', () => {
  assert.deepEqual(agoBucket(0), { unit: 'seconds', value: 0 });
  assert.deepEqual(agoBucket(5_000), { unit: 'seconds', value: 5 });
  assert.deepEqual(agoBucket(65_000), { unit: 'minutes', value: 1 });
  assert.deepEqual(agoBucket(3_600_000), { unit: 'hours', value: 1 });
  assert.deepEqual(agoBucket(7_500_000), { unit: 'hours', value: 2 });
});

test('summarizeResetForecast formats scheduled, active, inactive, and disabled states', () => {
  const scheduled = summarizeResetForecast({
    status: 'scheduled',
    scheduledFor: '2026-10-28T04:00:00Z',
    scheduledResetType: 'banked'
  });
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.headline, 'Scheduled Banked Reset');
  assert.equal(scheduled.detail, '2026-10-28T04:00:00Z');
  assert.equal(scheduled.badgeTone, 'ok');

  const active = summarizeResetForecast({
    status: 'active',
    chancePercent: 75.4,
    expiresAt: '2026-10-29T12:00:00Z'
  });
  assert.equal(active.status, 'active');
  assert.equal(active.headline, '75% Chance');
  assert.equal(active.badgeTone, 'signal');

  const inactive = summarizeResetForecast({
    status: 'inactive',
    latestResetAt: '2026-10-26T18:00:00Z'
  });
  assert.equal(inactive.status, 'inactive');
  assert.equal(inactive.headline, 'No Active Signal');
  assert.equal(inactive.badgeTone, 'nominal');

  const disabled = summarizeResetForecast({ status: 'disabled' });
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.headline, 'Forecast Disabled');

  const unavailable = summarizeResetForecast(null);
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.badgeTone, 'unknown');
});

test('overallSystemStatus computes aggregate health and incident counts', () => {
  const operational = overallSystemStatus([
    { id: 'claude', status: 'ok', incidentCount: 0 },
    { id: 'openai', status: 'ok', incidentCount: 0 }
  ]);
  assert.equal(operational.tone, 'ok');
  assert.equal(operational.label, 'All Systems Operational');
  assert.equal(operational.totalMonitored, 2);
  assert.equal(operational.activeIncidents, 0);

  const degraded = overallSystemStatus([
    { id: 'claude', status: 'degraded', incidentTitle: 'Elevated latency', incidentCount: 1 },
    { id: 'openai', status: 'ok', incidentCount: 0 }
  ]);
  assert.equal(degraded.tone, 'degraded');
  assert.equal(degraded.label, '1 Active Incident');
  assert.equal(degraded.activeIncidents, 1);

  const outage = overallSystemStatus([
    { id: 'cursor', status: 'outage', incidentCount: 1 }
  ]);
  assert.equal(outage.tone, 'outage');
  assert.equal(outage.label, 'Service Outage Detected');
});
