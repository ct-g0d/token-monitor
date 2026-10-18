'use strict';

(function exposeWindowService(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorWindowService = api;
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

  const WindowService = bridgeModule?.WindowService;

  function createWindowService(options) {
    if (!WindowService) {
      throw new Error('WindowService definition not available');
    }
    return new WindowService(options);
  }

  return {
    WindowService,
    createWindowService
  };
});
