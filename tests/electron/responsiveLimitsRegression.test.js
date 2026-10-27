'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.join(__dirname, '..', '..');
const srcUsageLimitsPooledPath = path.join(
  rootDir,
  't3_app_ui',
  'src',
  'components',
  'usage',
  'UsageLimitsPooled.tsx',
);
const vendorUsageLimitsPooledPath = path.join(
  rootDir,
  't3_app_ui',
  'vendor',
  't3',
  'apps',
  'web',
  'src',
  'components',
  'usage',
  'UsageLimitsPooled.tsx',
);

const {
  formatCountdown,
  getAccountPlanLabel,
  resolvePlanSummary,
} = require('../../t3_app_ui/src/components/usage/usageLimitsHelpers.ts');

test('countdown formatting: transforms "resets in X" and preserves "resets now" / "Resets momentarily"', () => {
  // Correctly formats "resets in X"
  assert.equal(formatCountdown('resets in 2h'), 'in 2h');
  assert.equal(formatCountdown('resets in 45m'), 'in 45m');
  assert.equal(formatCountdown('resets in 10s'), 'in 10s');

  // Preserves already formatted strings without prepending "in "
  assert.equal(formatCountdown('resets now'), 'resets now');
  assert.notEqual(formatCountdown('resets now'), 'in resets now');
  assert.equal(formatCountdown('Resets momentarily'), 'Resets momentarily');
  assert.notEqual(formatCountdown('Resets momentarily'), 'in Resets momentarily');

  // Handles null and undefined
  assert.equal(formatCountdown(null), null);
  assert.equal(formatCountdown(undefined), null);
  assert.equal(formatCountdown(''), null);
});

test('countdown formatting: source and vendor UsageLimitsPooled avoid "in resets now" patterns', () => {
  const src = fs.readFileSync(srcUsageLimitsPooledPath, 'utf8');
  const vendor = fs.readFileSync(vendorUsageLimitsPooledPath, 'utf8');

  // Neither source nor vendor should have <span>in {countdown}</span>
  assert.doesNotMatch(src, /<span>in \{countdown\}<\/span>/);
  assert.doesNotMatch(vendor, /<span>in \{countdown\}<\/span>/);

  // Both should render {countdown} directly
  assert.match(src, /\{countdown \? <span>\{countdown\}<\/span> : null\}/);
  assert.match(vendor, /\{countdown \? <span>\{countdown\}<\/span> : null\}/);
});

test('container query: 480px breakpoint is raised in both source and vendor copies', () => {
  const src = fs.readFileSync(srcUsageLimitsPooledPath, 'utf8');
  const vendor = fs.readFileSync(vendorUsageLimitsPooledPath, 'utf8');

  // Check 480px breakpoint presence
  assert.match(src, /@\[480px\]\/pool:grid-cols-3/);
  assert.match(vendor, /@\[480px\]\/pool:grid-cols-3/);

  // Ensure 380px breakpoint is completely eliminated
  assert.doesNotMatch(src, /@\[380px\]\/pool:grid-cols-3/);
  assert.doesNotMatch(vendor, /@\[380px\]\/pool:grid-cols-3/);
});

test('singleColumn vendor visibility: ported to vendor PoolSegment and PoolBar', () => {
  const vendor = fs.readFileSync(vendorUsageLimitsPooledPath, 'utf8');

  // PoolSegment in vendor declares singleColumn
  assert.match(vendor, /singleColumn\?: boolean;/);

  // PoolSegment conditionally shows text when singleColumn is true
  assert.match(vendor, /singleColumn \? "flex" : "hidden @2xl\/pool:flex"/);

  // PoolSegment hides segment index badge when singleColumn is true
  assert.match(vendor, /\{!singleColumn \?\s*\(/);

  // PoolBar in vendor passes singleColumn prop
  assert.match(vendor, /singleColumn=\{pool\.columns\.length === 1\}/);
});

test('singleColumn source visibility: preserves singleColumn prop and flex visibility', () => {
  const src = fs.readFileSync(srcUsageLimitsPooledPath, 'utf8');

  assert.match(src, /singleColumn\?: boolean;/);
  assert.match(src, /isCodex \|\| singleColumn \? "flex" : "hidden @lg\/pool:flex"/);
  assert.match(src, /singleColumn=\{columns\.length === 1\}/);
});

test('non-Codex plan fallback: restricts "Plus" to Codex and uses account counts for non-Codex', () => {
  // Codex: defaults to Plus
  assert.equal(getAccountPlanLabel(undefined, true), 'Plus');
  assert.equal(getAccountPlanLabel({}, true), 'Plus');
  assert.equal(getAccountPlanLabel({ plan: 'team' }, true), 'Team');

  // Codex multi-account plan summary
  assert.equal(resolvePlanSummary([{ plan: undefined }], true), 'Plus');
  assert.equal(resolvePlanSummary([{ plan: 'team' }], true), 'Team');
  assert.equal(resolvePlanSummary([{}, {}], true), '2 / Plus');
  assert.equal(resolvePlanSummary([{ plan: 'enterprise' }, {}], true), '2 / Enterprise');

  // Non-Codex: never defaults to Plus
  assert.equal(getAccountPlanLabel(undefined, false), null);
  assert.equal(getAccountPlanLabel({}, false), null);
  assert.equal(getAccountPlanLabel({ plan: 'pro' }, false), 'Pro');
  assert.equal(getAccountPlanLabel({ plan: 'team' }, false), 'Team');

  // Non-Codex single account
  assert.equal(resolvePlanSummary([{}], false), null);
  assert.equal(resolvePlanSummary([{ plan: 'pro' }], false), 'Pro');

  // Non-Codex multi-account: renders account count, NEVER "2 / Plus"
  assert.equal(resolvePlanSummary([{}, {}], false), '2 accounts');
  assert.notEqual(resolvePlanSummary([{}, {}], false), '2 / Plus');
  assert.equal(resolvePlanSummary([{ plan: 'pro' }, { plan: 'team' }], false), '2 accounts');
  assert.equal(resolvePlanSummary([{}, {}, {}], false), '3 accounts');

  // Empty or invalid accounts
  assert.equal(resolvePlanSummary([], false), null);
  assert.equal(resolvePlanSummary(null, false), null);
});

test('source UsageLimitsPooled uses resolvePlanSummary for PoolSection', () => {
  const src = fs.readFileSync(srcUsageLimitsPooledPath, 'utf8');

  assert.match(src, /const planSummary = resolvePlanSummary\(pool\.accounts, isCodex\);/);
});
