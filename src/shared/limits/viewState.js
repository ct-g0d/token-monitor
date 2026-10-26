'use strict';

/**
 * Resolves the limits view presentation state.
 *
 * Requirements:
 * 1. While loading is active, the state is always 'loading' (loading state is shown first).
 * 2. When loading finishes:
 *    - if no environments are connected, returns 'no_environments'.
 *    - if poolsCount is 0, returns 'empty' (empty state).
 *    - if poolsCount > 0, returns 'content' (transition directly from loading to limits content).
 */
function resolveLimitsViewState({ loading = false, environmentsCount = 1, poolsCount = 0 } = {}) {
  if (loading) return 'loading';
  if (environmentsCount <= 0) return 'no_environments';
  if (poolsCount <= 0) return 'empty';
  return 'content';
}

module.exports = {
  resolveLimitsViewState,
};
