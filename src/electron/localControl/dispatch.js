'use strict';

/**
 * Creates the RPC dispatch table from injected shared handlers.
 * Only methods explicitly registered in this table can be invoked.
 */
function createRpcDispatcher(handlers = {}) {
  const methodMap = new Map();

  function register(name, handler) {
    if (typeof handler === 'function') {
      methodMap.set(name, handler);
    }
  }

  // 1. Session Detail
  if (handlers.getSessionDetail) {
    register('session.getDetail', (params) => handlers.getSessionDetail(params));
    register('session:getDetail', (params) => handlers.getSessionDetail(params));
  }

  // 2. Client Sources & Scanning
  if (handlers.getClientSources) {
    register('clientSources.list', (params) => handlers.getClientSources(params));
    register('usage:clientSources', (params) => handlers.getClientSources(params));
  }
  if (handlers.setTrackedClients) {
    register('clientSources.setTracked', (params) => handlers.setTrackedClients(params));
  }
  if (handlers.setClientDisplayOrder) {
    register('clientSources.setOrder', (params) => handlers.setClientDisplayOrder(params));
  }
  if (handlers.setCustomScanPath) {
    register('clientSources.setCustomScanPath', (params) => handlers.setCustomScanPath(params));
  }
  if (handlers.setWslScanning) {
    register('clientSources.setWslScanning', (params) => handlers.setWslScanning(params));
  }
  if (handlers.rescanClients) {
    register('clientSources.rescan', (params) => handlers.rescanClients(params));
    register('usage:rescanClient', (params) => handlers.rescanClients(params));
  }
  if (handlers.repairClientSyncLock) {
    register('clientSources.repairSyncLock', (params) => handlers.repairClientSyncLock(params));
    register('usage:repairClientSyncLock', (params) => handlers.repairClientSyncLock(params));
  }

  // 3. Collection Cadence
  if (handlers.getCollectionCadence) {
    register('collectionCadence.get', (params) => handlers.getCollectionCadence(params));
  }
  if (handlers.setCollectionCadence) {
    register('collectionCadence.set', (params) => handlers.setCollectionCadence(params));
  }

  // 4. Deleted-Session Archive
  if (handlers.getSessionArchiveRetain) {
    register('sessionArchive.getRetain', (params) => handlers.getSessionArchiveRetain(params));
  }
  if (handlers.setSessionArchiveRetain) {
    register('sessionArchive.setRetain', (params) => handlers.setSessionArchiveRetain(params));
  }
  if (handlers.clearSessionArchive) {
    register('sessionArchive.clear', (params) => handlers.clearSessionArchive(params));
    register('sessionUsageArchive:clear', (params) => handlers.clearSessionArchive(params));
  }

  // 5. Diagnostics
  if (handlers.generateDiagnosticsReport) {
    register('diagnostics.generate', (params) => handlers.generateDiagnosticsReport(params));
    register('diagnostics:generate', (params) => handlers.generateDiagnosticsReport(params));
  }

  // 6. Tokscale Status Probe (no download)
  if (handlers.getTokscaleStatus) {
    register('tokscale.getStatus', (params) => handlers.getTokscaleStatus(params));
    register('tokscale:getStatus', (params) => handlers.getTokscaleStatus(params));
  }

  // 7. Limits Accounts
  if (handlers.listAccountForms) {
    register('limits.listAccountForms', (params) => handlers.listAccountForms(params));
  }
  if (handlers.saveLimitCredential) {
    register('limits.saveCredential', (params) => handlers.saveLimitCredential(params));
    register('limits:saveCredential', (params) => handlers.saveLimitCredential(params));
  }
  if (handlers.clearLimitCredential) {
    register('limits.clearCredential', (params) => handlers.clearLimitCredential(params));
    register('limits:clearCredential', (params) => handlers.clearLimitCredential(params));
  }
  if (handlers.refreshLimits) {
    register('limits.refresh', (params) => handlers.refreshLimits(params));
  }
  if (handlers.startAntigravitySignIn) {
    register('limits.antigravitySignInStart', (params) => handlers.startAntigravitySignIn(params));
    register('antigravity:addAccount', (params) => handlers.startAntigravitySignIn(params));
  }
  if (handlers.cancelAntigravitySignIn) {
    register('limits.antigravityCancelSignIn', (params) => handlers.cancelAntigravitySignIn(params));
    register('antigravity:cancelLogin', (params) => handlers.cancelAntigravitySignIn(params));
  }

  // 8. Sign-In Flows (Copilot, Codex, status, workspace selection)
  if (handlers.startCopilotSignIn) {
    register('copilot.signInStart', (params) => handlers.startCopilotSignIn(params));
    register('limits.copilotSignInStart', (params) => handlers.startCopilotSignIn(params));
    register('copilot:signIn', (params) => handlers.startCopilotSignIn(params));
  }
  if (handlers.cancelCopilotSignIn) {
    register('copilot.cancelSignIn', (params) => handlers.cancelCopilotSignIn(params));
    register('limits.copilotCancelSignIn', (params) => handlers.cancelCopilotSignIn(params));
    register('copilot:cancelSignIn', (params) => handlers.cancelCopilotSignIn(params));
  }
  if (handlers.startCodexSignIn) {
    register('codex.signInStart', (params) => handlers.startCodexSignIn(params));
    register('limits.codexSignInStart', (params) => handlers.startCodexSignIn(params));
    register('codex:addAccount', (params) => handlers.startCodexSignIn(params));
  }
  if (handlers.cancelCodexSignIn) {
    register('codex.cancelSignIn', (params) => handlers.cancelCodexSignIn(params));
    register('limits.codexCancelSignIn', (params) => handlers.cancelCodexSignIn(params));
    register('codex:cancelLogin', (params) => handlers.cancelCodexSignIn(params));
  }
  if (handlers.getSignInStatus) {
    register('signIn.status', (params) => handlers.getSignInStatus(params));
    register('signIn:status', (params) => handlers.getSignInStatus(params));
  }
  if (handlers.selectCodexWorkspace) {
    register('codex.selectWorkspace', (params) => handlers.selectCodexWorkspace(params));
    register('codex:selectWorkspace', (params) => handlers.selectCodexWorkspace(params));
  }

  // 9. Codex Local Account Profiles & Switching
  if (handlers.listCodexAccounts) {
    register('codex.listAccounts', (params) => handlers.listCodexAccounts(params));
    register('codex:accounts', (params) => handlers.listCodexAccounts(params));
  }
  if (handlers.switchCodexAccount) {
    register('codex.switchAccount', (params) => handlers.switchCodexAccount(params));
    register('codex:switchSystemAccount', (params) => handlers.switchCodexAccount(params));
  }

  // 10. Currency
  if (handlers.getCurrency) {
    register('currency.get', (params) => handlers.getCurrency(params));
  }
  if (handlers.setCurrency) {
    register('currency.set', (params) => handlers.setCurrency(params));
  }

  // 11. Limits Display Settings (order, visibility, refresh mode/interval, email masking)
  if (handlers.getLimitsDisplay) {
    register('limits.getDisplay', (params) => handlers.getLimitsDisplay(params));
    register('limits:getDisplay', (params) => handlers.getLimitsDisplay(params));
  }
  if (handlers.setLimitsDisplay) {
    register('limits.setDisplay', (params) => handlers.setLimitsDisplay(params));
    register('limits:setDisplay', (params) => handlers.setLimitsDisplay(params));
  }

  // 12. Automated Data Export Settings
  const getExportHandler = handlers.getExportSettings || handlers.getExport;
  if (getExportHandler) {
    register('export.get', (params) => getExportHandler(params));
    register('export:get', (params) => getExportHandler(params));
  }
  const setExportHandler = handlers.setExportSettings || handlers.setExport;
  if (setExportHandler) {
    register('export.set', (params) => setExportHandler(params));
    register('export:set', (params) => setExportHandler(params));
  }

  // 13. Model Alias Automatic Grouping
  const getModelAliasGroupingHandler = handlers.getModelAliasGrouping || handlers.getModelAliasesGrouping;
  if (getModelAliasGroupingHandler) {
    register('modelAliases.getGrouping', (params) => getModelAliasGroupingHandler(params));
    register('modelAliases:getGrouping', (params) => getModelAliasGroupingHandler(params));
  }
  const setModelAliasGroupingHandler = handlers.setModelAliasGrouping || handlers.setModelAliasesGrouping;
  if (setModelAliasGroupingHandler) {
    register('modelAliases.setGrouping', (params) => setModelAliasGroupingHandler(params));
    register('modelAliases:setGrouping', (params) => setModelAliasGroupingHandler(params));
  }

  return {
    has(method) {
      return methodMap.has(method);
    },
    async execute(method, params) {
      const handler = methodMap.get(method);
      if (!handler) {
        const error = new Error(`Method "${method}" not found or not allowed`);
        error.code = 'METHOD_NOT_FOUND';
        throw error;
      }
      return handler(params);
    },
    listMethods() {
      return Array.from(methodMap.keys());
    }
  };
}

module.exports = {
  createRpcDispatcher
};
