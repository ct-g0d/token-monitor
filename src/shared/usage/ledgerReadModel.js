'use strict';

const { localDayKey } = require('../history');
const { isAccountingExcludedClient } = require('../clientTracking');

let readModelParseCache = null;

function clearReadModelParseCache() {
  readModelParseCache = null;
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

function clonePeriods(p) {
  if (!p || typeof p !== 'object') return null;
  return JSON.parse(JSON.stringify(p));
}

function buildLedgerReadModel(storeOrDb, options = {}) {
  const { createTokenLedgerStore } = require('./tokenLedger');
  const store = (typeof storeOrDb?.readPeriods === 'function' && typeof storeOrDb?.readHistory === 'function')
    ? storeOrDb
    : createTokenLedgerStore({ database: storeOrDb?.database ? storeOrDb.database() : storeOrDb });
  const db = typeof store.database === 'function' ? store.database() : (store?.prepare ? store : null);

  const today = String(options.today || options.todayKey || localDayKey()).slice(0, 10);
  const historyDays = Number(options.historyDays) || 90;

  let sweepId = 0;
  if (db && typeof db.prepare === 'function') {
    try {
      const sweepRow = db.prepare("SELECT sweep_id FROM usage_sweep_runs WHERE status = 'completed' ORDER BY sweep_id DESC LIMIT 1").get();
      if (sweepRow) sweepId = Number(sweepRow.sweep_id);
    } catch (_) {}
  }

  const builtAtMs = Number(options.now ? (options.now instanceof Date ? options.now.getTime() : options.now) : Date.now());

  // 1. canonical fact day rows
  const dayRows = store.canonicalFactDayRows({ today });

  // 2. sessionsByWindow for 1/7/30/90
  const sessionsByWindow = store.sessionsByWindow({ today }) || {};

  // 3. readPeriods (today, month, allTime, plus any other period keys)
  const periods = clonePeriods(store.readPeriods({ today })) || {};

  // 4. history (ledger-derived history object for the 90-day window)
  const rawHistory = store.readHistory({
    today,
    historyDays,
    sqlCoverageComplete: true,
    overlayHistory: { daily: [] }
  });
  const history = sanitizeHistoryAccounting(rawHistory);
  if (history) {
    history.sqlCoverageComplete = true;
    history.sessionsByWindow = sessionsByWindow;
  }

  const payload = {
    periods,
    history,
    sessionsByWindow,
    dayRows
  };

  const model = {
    sweepId,
    localDay: today,
    builtAtMs,
    payload,
    periods,
    history,
    sessionsByWindow,
    dayRows
  };

  return model;
}

function writeLedgerReadModel(databaseOrStore, model) {
  const db = databaseOrStore?.database ? databaseOrStore.database() : databaseOrStore;
  if (!db || typeof db.prepare !== 'function') {
    throw new TypeError('writeLedgerReadModel requires a database with prepare()');
  }

  const sweepId = Number(model?.sweepId ?? model?.sweep_id ?? 0);
  const localDay = String(model?.localDay ?? model?.local_day ?? '');
  const builtAtMs = Number(model?.builtAtMs ?? model?.built_at_ms ?? Date.now());
  const payload = model?.payload ?? {
    periods: model?.periods,
    history: model?.history,
    sessionsByWindow: model?.sessionsByWindow,
    dayRows: model?.dayRows || model?.canonicalDayRows
  };
  const payloadJson = typeof model?.payload_json === 'string'
    ? model.payload_json
    : JSON.stringify(payload);

  const stmt = db.prepare(`
    INSERT INTO ledger_read_model (id, sweep_id, local_day, built_at_ms, payload_json)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      sweep_id = excluded.sweep_id,
      local_day = excluded.local_day,
      built_at_ms = excluded.built_at_ms,
      payload_json = excluded.payload_json
  `);
  stmt.run(sweepId, localDay, builtAtMs, payloadJson);

  readModelParseCache = {
    sweepId,
    payloadJson,
    payload
  };

  return { sweepId, localDay, builtAtMs, payload };
}

function readLedgerReadModel(databaseOrStore) {
  const db = databaseOrStore?.database ? databaseOrStore.database() : databaseOrStore;
  if (!db || typeof db.prepare !== 'function') return null;
  try {
    const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ledger_read_model'").get();
    if (!hasTable) return null;
    const row = db.prepare("SELECT sweep_id, local_day, built_at_ms, payload_json FROM ledger_read_model WHERE id = 1").get();
    if (!row) return null;
    const sweepId = Number(row.sweep_id);
    let payload;
    if (readModelParseCache && readModelParseCache.sweepId === sweepId && readModelParseCache.payloadJson === row.payload_json) {
      payload = readModelParseCache.payload;
    } else {
      payload = JSON.parse(row.payload_json);
      readModelParseCache = {
        sweepId,
        payloadJson: row.payload_json,
        payload
      };
    }
    const result = {
      sweepId,
      localDay: String(row.local_day),
      builtAtMs: Number(row.built_at_ms),
      payload
    };
    Object.defineProperties(result, {
      periods: { get() { return payload?.periods; }, enumerable: true },
      history: { get() { return payload?.history; }, enumerable: true },
      sessionsByWindow: { get() { return payload?.sessionsByWindow; }, enumerable: true },
      dayRows: { get() { return payload?.dayRows; }, enumerable: true }
    });
    return result;
  } catch (_) {
    return null;
  }
}

function readModelHistory(model, overlayDaily, today) {
  if (!model || !model.history) return null;
  const { overlayLedgerHistory } = require('./tokenLedger');
  const todayKey = String(today || localDayKey()).slice(0, 10);
  const overlaid = overlayLedgerHistory(model.history, overlayDaily || [], todayKey);
  const history = sanitizeHistoryAccounting(overlaid);
  if (history) {
    history.sqlCoverageComplete = true;
    if (model.history?.sessionsByWindow !== undefined) {
      history.sessionsByWindow = model.history.sessionsByWindow;
    } else if (model.sessionsByWindow !== undefined) {
      history.sessionsByWindow = model.sessionsByWindow;
    }
  }
  return history;
}

function readModelPeriods(model, options = {}) {
  if (!model) return null;
  const { derivePeriods } = require('./tokenLedger');
  const today = String(options.today || options.todayKey || localDayKey()).slice(0, 10);
  const history = readModelHistory(model, options.overlayHistory?.daily, today);
  const periods = derivePeriods(history, options, today);
  if (!periods) return null;

  for (const name of ['today', 'month', 'allTime']) {
    const modelPeriod = model.periods?.[name];
    if (modelPeriod && periods[name]) {
      if (modelPeriod.clientSessions !== undefined) {
        periods[name].clientSessions = modelPeriod.clientSessions;
      }
      if (modelPeriod.distinctSessions !== undefined) {
        periods[name].distinctSessions = modelPeriod.distinctSessions;
      }
    }
  }
  return periods;
}

module.exports = {
  buildLedgerReadModel,
  writeLedgerReadModel,
  readLedgerReadModel,
  readModelHistory,
  readModelPeriods,
  clearReadModelParseCache,
  sanitizeHistoryAccounting,
  clonePeriods
};
