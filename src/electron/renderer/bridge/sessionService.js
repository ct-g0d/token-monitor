'use strict';

(function exposeSessionService(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorSessionService = api;
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

  const SessionService = bridgeModule?.SessionService;

  function createSessionService(options) {
    if (!SessionService) {
      throw new Error('SessionService definition not available');
    }
    return new SessionService(options);
  }

  return {
    SessionService,
    createSessionService
  };
});
