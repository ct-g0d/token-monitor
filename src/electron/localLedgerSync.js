'use strict';

const { historyPreview, historyRevision, localDayKey } = require('../shared/history');
const { isAccountingExcludedClient } = require('../shared/clientTracking');
const {
  createTokenLedgerStore,
  checkFactCoverage
} = require('../shared/usage/tokenLedger');
const {
  readLedgerReadModel,
  readModelHistory,
  readModelPeriods
} = require('../shared/usage/ledgerReadModel');

let defaultStoreInstance = null;

function resolveLedgerStore(options = {}) {
  if (options.tokenLedgerStore) return options.tokenLedgerStore;
  if (options.path) {
    return createTokenLedgerStore({ maintenance: false, ...options });
  }
  if (!defaultStoreInstance) {
    defaultStoreInstance = createTokenLedgerStore({ maintenance: false, ...options });
  }
  return defaultStoreInstance;
}

function checkSqlCoverage(store, overlayDaily = [], options = {}) {
  const opts = typeof overlayDaily === 'object' && !Array.isArray(overlayDaily) ? overlayDaily : options;
  return checkFactCoverage(store, opts);
}

function sanitizeHistoryAccounting(history) {
  if (!history || !Array.isArray(history.daily)) return history;
  for (const day of history.daily) {
    if (day?.perClient && typeof day.perClient === 'object') {
      for (const client of Object.keys(day.perClient)) {
        if (isAccountingExcludedClient(client)) {
          delete day.perClient[client];
        }
      }
    }
    if (day?.clientModels && typeof day.clientModels === 'object') {
      for (const client of Object.keys(day.clientModels)) {
        if (isAccountingExcludedClient(client)) {
          delete day.clientModels[client];
        }
      }
    }
  }
  return history;
}

function localLedgerHistory(overlayHistory, options = {}) {
  const store = resolveLedgerStore(options);
  if (!store) return null;

  const overlayDaily = Array.isArray(overlayHistory?.daily) ? overlayHistory.daily : [];
  const today = String(options.today || options.todayKey || localDayKey()).slice(0, 10);

  const readModel = typeof store.readModel === 'function' ? store.readModel() : readLedgerReadModel(store);
  if (readModel?.history) {
    return readModelHistory(readModel, overlayDaily, today);
  }

  if (typeof store.readHistory !== 'function') return null;

  const coverage = checkSqlCoverage(store, overlayDaily, options);

  // If store is a real token ledger store with readModel capability, row 1 is missing:
  // use existing non-SQL fallback path and NEVER scan usage_events on main.
  if (typeof store.readModel === 'function') {
    const history = sanitizeHistoryAccounting(store.readHistory({
      ...options,
      overlayHistory,
      sqlCoverageComplete: false,
      useFacts: false
    }));
    const diagnosticReason = coverage.reason || 'sql-coverage-incomplete';
    if (history) {
      history.sqlCoverageComplete = false;
      history.diagnosticReason = diagnosticReason;
    }
    if (typeof options.onDiagnosticEvent === 'function') {
      options.onDiagnosticEvent({
        subsystem: 'ledger',
        code: 'sql-coverage-incomplete',
        reason: diagnosticReason
      });
    }
    return history;
  }

  // Fallback for tests/mocks where mockStore has no readModel
  if (coverage.complete) {
    const todayKey = String(options.today || options.todayKey || localDayKey()).slice(0, 10);
    const liveTodayRow = overlayDaily.find((d) => d.date === todayKey)
      || options.stats?.history?.daily?.find?.((d) => d.date === todayKey)
      || null;
    const todayOverlay = liveTodayRow ? { daily: [liveTodayRow] } : { daily: [] };
    const history = sanitizeHistoryAccounting(store.readHistory({
      ...options,
      overlayHistory: todayOverlay,
      sqlCoverageComplete: true,
      today: todayKey
    }));
    if (history) {
      history.sqlCoverageComplete = true;
      const sessionsByWindow = store?.sessionsByWindow?.(options);
      if (sessionsByWindow) history.sessionsByWindow = sessionsByWindow;
    }
    return history;
  }

  const history = sanitizeHistoryAccounting(store.readHistory({
    ...options,
    overlayHistory,
    sqlCoverageComplete: false,
    useFacts: false
  }));
  const diagnosticReason = coverage.reason || 'sql-coverage-incomplete';
  if (history) {
    history.sqlCoverageComplete = false;
    history.diagnosticReason = diagnosticReason;
  }
  if (typeof options.onDiagnosticEvent === 'function') {
    options.onDiagnosticEvent({
      subsystem: 'ledger',
      code: 'sql-coverage-incomplete',
      reason: diagnosticReason
    });
  }
  return history;
}

function withLocalLedgerHistory(stats, overlayHistory, options = {}) {
  const store = resolveLedgerStore(options);
  const isWatchTick = options.isWatchTick === true
    || options.reason === 'watch'
    || options.reason === 'watch-delta'
    || options.reason === 'activity'
    || (typeof options.reason === 'string' && options.reason.startsWith('watch'));

  const getLedgerHistory = options.localLedgerHistory;
  const history = typeof getLedgerHistory === 'function'
    ? getLedgerHistory(overlayHistory || stats?.history)
    : localLedgerHistory(overlayHistory || stats?.history, { ...options, tokenLedgerStore: store, stats });
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

  const shouldWriteHistory = !isWatchTick && options.writeHistory === true;

  if (shouldWriteHistory && typeof store?.writeHistory === 'function' && Array.isArray(history.daily) && history.daily.length > 0) {
    try {
      store.writeHistory(history);
    } catch (error) {
      console.warn('Could not persist runtime history to token ledger:', error?.message || error);
    }
  }

  const basePeriods = stats.periods || targetDevice?.periods;
  const readModel = typeof store?.readModel === 'function' ? store.readModel() : readLedgerReadModel(store);
  const periodsOptions = {
    overlayHistory: overlayHistory || stats.history,
    basePeriods,
    basePeriod: basePeriods?.allTime,
    sqlCoverageComplete: history?.sqlCoverageComplete,
    today: options.today || options.todayKey
  };
  const periods = readModel?.periods
    ? readModelPeriods(readModel, periodsOptions)
    : store?.readPeriods?.({
      ...periodsOptions,
      useFacts: false
    });
  if (!periods) {
    return {
      ...stats,
      history,
      historyPreview: historyPreview(history),
      historyRevision: historyRevision(history),
      ...(history?.diagnosticReason ? { diagnosticReason: history.diagnosticReason } : {})
    };
  }

  for (const name of ['today', 'month', 'allTime']) {
    periods[name].sessions = (periods[name].sessions && Object.keys(periods[name].sessions).length > 0)
      ? periods[name].sessions
      : (stats.periods?.[name]?.sessions
        || targetDevice?.periods?.[name]?.sessions
        || targetDevice?.[name]?.sessions
        || {});
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

    // Explicitly clean any excluded accounting clients from periods
    if (periods[name].clientModels && typeof periods[name].clientModels === 'object') {
      for (const client of Object.keys(periods[name].clientModels)) {
        if (isAccountingExcludedClient(client)) {
          delete periods[name].clientModels[client];
        }
      }
    }
    if (periods[name].clientModelCosts && typeof periods[name].clientModelCosts === 'object') {
      for (const client of Object.keys(periods[name].clientModelCosts)) {
        if (isAccountingExcludedClient(client)) {
          delete periods[name].clientModelCosts[client];
        }
      }
    }
    if (periods[name].clients && typeof periods[name].clients === 'object') {
      for (const client of Object.keys(periods[name].clients)) {
        if (isAccountingExcludedClient(client)) {
          delete periods[name].clients[client];
        }
      }
    }
    if (periods[name].clientCosts && typeof periods[name].clientCosts === 'object') {
      for (const client of Object.keys(periods[name].clientCosts)) {
        if (isAccountingExcludedClient(client)) {
          delete periods[name].clientCosts[client];
        }
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

  const updatedTargetDevice = targetDevice
    ? {
        ...targetDevice,
        history,
        periods: {
          ...targetDevice.periods,
          today: { ...periods.today },
          month: { ...periods.month },
          allTime: { ...periods.allTime }
        },
        today: { ...periods.today },
        month: { ...periods.month },
        allTime: { ...periods.allTime }
      }
    : null;

  const updatedDevices = Array.isArray(stats.devices)
    ? stats.devices.map((d, i) => (i === targetIndex ? updatedTargetDevice : d))
    : stats.devices;

  const sessionsByWindow = (readModel?.sessionsByWindow ? JSON.parse(JSON.stringify(readModel.sessionsByWindow)) : null)
    || (readModel ? null : (store?.sessionsByWindow?.(options) || null));
  return {
    ...stats,
    history: {
      ...history,
      ...(sessionsByWindow ? { sessionsByWindow } : {})
    },
    historyPreview: historyPreview(history),
    historyRevision: historyRevision(history),
    periods,
    ...(sessionsByWindow ? { sessionsByWindow } : {}),
    ...(history?.diagnosticReason ? { diagnosticReason: history.diagnosticReason } : {}),
    ...(updatedDevices ? { devices: updatedDevices } : {})
  };
}

module.exports = {
  checkSqlCoverage,
  localLedgerHistory,
  withLocalLedgerHistory
};
