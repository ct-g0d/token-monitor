'use strict';

(function exposeSettingsService(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorSettingsService = api;
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

  const SettingsService = bridgeModule?.SettingsService;

  function createSettingsService(options) {
    if (!SettingsService) {
      throw new Error('SettingsService definition not available');
    }
    return new SettingsService(options);
  }

  return {
    SettingsService,
    createSettingsService
  };
});
