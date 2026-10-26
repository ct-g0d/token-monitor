'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveLimitsViewState } = require('../../src/shared/limits/viewState');

test('resolveLimitsViewState shows loading state first when loading is active', () => {
  assert.equal(
    resolveLimitsViewState({ loading: true, environmentsCount: 1, poolsCount: 5 }),
    'loading',
    'should display loading state even when limits are already present'
  );
  assert.equal(
    resolveLimitsViewState({ loading: true, environmentsCount: 1, poolsCount: 0 }),
    'loading',
    'should display loading state when no limits are present'
  );
  assert.equal(
    resolveLimitsViewState({ loading: true, environmentsCount: 0, poolsCount: 0 }),
    'loading',
    'should display loading state before environments check settles'
  );
});

test('resolveLimitsViewState transitions to empty state if no limits exist after loading', () => {
  assert.equal(
    resolveLimitsViewState({ loading: false, environmentsCount: 1, poolsCount: 0 }),
    'empty',
    'should transition to empty state when no limit pools exist'
  );
  assert.equal(
    resolveLimitsViewState({ loading: false, environmentsCount: 2, poolsCount: 0 }),
    'empty',
    'should show empty state across multiple environments with no limits'
  );
});

test('resolveLimitsViewState transitions directly from loading to limits content if limits exist', () => {
  assert.equal(
    resolveLimitsViewState({ loading: false, environmentsCount: 1, poolsCount: 1 }),
    'content',
    'should transition directly to content when a single limit pool exists'
  );
  assert.equal(
    resolveLimitsViewState({ loading: false, environmentsCount: 2, poolsCount: 4 }),
    'content',
    'should transition directly to content when multiple limit pools exist'
  );
});

test('resolveLimitsViewState reports no_environments when no environments are connected', () => {
  assert.equal(
    resolveLimitsViewState({ loading: false, environmentsCount: 0, poolsCount: 0 }),
    'no_environments',
    'should indicate no environments when count is 0'
  );
  assert.equal(
    resolveLimitsViewState({ loading: false, environmentsCount: -1, poolsCount: 0 }),
    'no_environments',
    'should handle negative environment count safely'
  );
});
