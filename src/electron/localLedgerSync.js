'use strict';

const { historyPreview, historyRevision } = require('../shared/history');
const { isAccountingExcludedClient } = require('../shared/clientTracking');

let defaultStoreInstance = null;

function resolveLedgerStore(options = {}) {
  if (options.tokenLedgerStore) return options.tokenLedgerStore;
  if (!defaultStoreInstance) {
    const { createTokenLedgerStore } = require('../shared/usage/tokenLedger');
    defaultStoreInstance = createTokenLedgerStore(options);
  }
  return defaultStoreInstance;
}

function withLocalLedgerHistory(stats, overlayHistory, options = {}) {
  const getLedgerHistory = options.localLedgerHistory;
  const history = typeof getLedgerHistory === 'function'
    ? getLedgerHistory(overlayHistory || stats?.history)
    : (resolveLedgerStore(options)?.readHistory?.({ overlayHistory: overlayHistory || stats?.history }) || null);
  if (!history || !stats || typeof stats !== 'object') return stats;

  const targetDeviceId = String(
    options.deviceId || options.settings?.deviceId || ''
  ).trim();

  let targetIndex = -1;
  if (Array.isArray(stats.devices) && stats.devices.length > 0) {
    if (targetDeviceId) {
      targetIndex = stats.devices.findIndex((d) => String(d?.deviceId || '').trim() === targetDeviceId);
    } else {
      targetIndex = 0;
    }
  }

  const targetDevice = targetIndex >= 0 ? stats.devices[targetIndex] : null;

  const store = resolveLedgerStore(options);
  const basePeriods = stats.periods || targetDevice?.periods;
  const periods = store?.readPeriods?.({
    overlayHistory: overlayHistory || stats.history,
    basePeriods
  });
  if (!periods) {
    return {
      ...stats,
      history,
      historyPreview: historyPreview(history),
      historyRevision: historyRevision(history)
    };
  }

  for (const name of ['today', 'month', 'allTime']) {
    periods[name].sessions = stats.periods?.[name]?.sessions
      || targetDevice?.periods?.[name]?.sessions
      || targetDevice?.[name]?.sessions
      || {};
    periods[name].projects = stats.periods?.[name]?.projects
      || targetDevice?.periods?.[name]?.projects
      || targetDevice?.[name]?.projects
      || {};

    const sourceClientModels = stats.periods?.[name]?.clientModels
      || targetDevice?.periods?.[name]?.clientModels
      || targetDevice?.[name]?.clientModels;
    if (sourceClientModels && typeof sourceClientModels === 'object') {
      periods[name].clientModels ||= {};
      for (const [client, models] of Object.entries(sourceClientModels)) {
        if (isAccountingExcludedClient(client)) continue;
        periods[name].clientModels[client] = {
          ...(models || {}),
          ...(periods[name].clientModels[client] || {})
        };
      }
    }

    const sourceClientModelCosts = stats.periods?.[name]?.clientModelCosts
      || targetDevice?.periods?.[name]?.clientModelCosts
      || targetDevice?.[name]?.clientModelCosts;
    if (sourceClientModelCosts && typeof sourceClientModelCosts === 'object') {
      periods[name].clientModelCosts ||= {};
      for (const [client, costs] of Object.entries(sourceClientModelCosts)) {
        if (isAccountingExcludedClient(client)) continue;
        periods[name].clientModelCosts[client] = {
          ...(costs || {}),
          ...(periods[name].clientModelCosts[client] || {})
        };
      }
    }

    const existingUnpriced = Number(
      stats.periods?.[name]?.unpricedTokens
      ?? targetDevice?.periods?.[name]?.unpricedTokens
      ?? targetDevice?.[name]?.unpricedTokens
      ?? 0
    );
    if (existingUnpriced > 0) {
      periods[name].unpricedTokens = Math.max(
        Number(periods[name].unpricedTokens || 0),
        existingUnpriced
      );
    }

    const deviceCost = Math.max(
      Number(targetDevice?.periods?.[name]?.costUsd || 0),
      Number(targetDevice?.[name]?.costUsd || 0)
    );
    const baselineCost = Math.max(
      Number(stats.periods?.[name]?.costUsd || 0),
      deviceCost
    );
    if (baselineCost > periods[name].costUsd) {
      periods[name].costUsd = Number(baselineCost.toFixed(6));
    }
  }

  const devices = Array.isArray(stats.devices) && stats.devices.length > 0 && targetIndex >= 0
    ? stats.devices.map((device, idx) => {
        if (idx !== targetIndex) return device;
        return {
          ...device,
          periods: {
            ...device.periods,
            today: { ...periods.today },
            month: { ...periods.month },
            allTime: { ...periods.allTime }
          },
          today: { ...periods.today },
          month: { ...periods.month },
          allTime: { ...periods.allTime }
        };
      })
    : stats.devices;

  return {
    ...stats,
    periods,
    history,
    devices,
    historyPreview: historyPreview(history),
    historyRevision: historyRevision(history)
  };
}

module.exports = {
  withLocalLedgerHistory
};
