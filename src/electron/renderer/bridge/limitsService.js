'use strict';

(function exposeLimitsService(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorLimitsService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, (root) => {
  let bridgeModule = null;
  if (typeof require === 'function') {
    try {
      bridgeModule = require('./clientBridge');
    } catch (_) {}
  }
  if (!bridgeModule && root && root.TokenMonitorClientBridge) {
    bridgeModule = root.TokenMonitorClientBridge;
  }

  const LimitsService = bridgeModule?.LimitsService;

  function createLimitsService(options) {
    if (!LimitsService) {
      throw new Error('LimitsService definition not available');
    }
    return new LimitsService(options);
  }

  return {
    LimitsService,
    createLimitsService
  };
});
