'use strict';

(function exposeTelemetryService(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorTelemetryService = api;
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

  const TelemetryService = bridgeModule?.TelemetryService;

  function createTelemetryService(options) {
    if (!TelemetryService) {
      throw new Error('TelemetryService definition not available');
    }
    return new TelemetryService(options);
  }

  return {
    TelemetryService,
    createTelemetryService
  };
});
