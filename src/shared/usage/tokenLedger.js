'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { sharedDataDir } = require('../config');
const { computeIntensities, localDayKey, monthlyRollup, parseModelIdentifier } = require('../history');
const { emptyPeriod, normalizeClientName } = require('../usage');
const { filterAccountingClientMap, isAccountingExcludedClient } = require('../clientTracking');

function canonicalModelKey(model) {
  const parsed = parseModelIdentifier(model);
  const raw = String(parsed?.model || model || '').trim();
  if (/^gemini-3\.8-flash(?:-(?:tiered|n|high|low))?$/i.test(raw)) {
    return 'gemini-3.8-flash';
  }
  return raw;
}

const LEDGER_FILE = 'token_ledger.sqlite';
const RUNTIME_HISTORY_TABLE = 'runtime_history';

function repoLedgerPath() {
  return path.resolve(__dirname, '..', '..', '..', 'data', LEDGER_FILE);
}

function resolveTokenLedgerPath(options = {}) {
  if (options.path) return path.resolve(options.path);
  const envPath = String(options.env?.TOKEN_MONITOR_LEDGER_PATH || process.env.TOKEN_MONITOR_LEDGER_PATH || '').trim();
  if (envPath) return path.resolve(envPath);
  const customSharedDir = options.env?.TOKEN_MONITOR_SHARED_DIR || process.env.TOKEN_MONITOR_SHARED_DIR;
  if (customSharedDir) {
    return path.join(path.resolve(customSharedDir), LEDGER_FILE);
  }
  const sharedPath = path.join(sharedDataDir(options), LEDGER_FILE);
  if (fs.existsSync(sharedPath)) return sharedPath;
  const seed = packagedSeedPath(options);
  if (seed) return sharedPath;
  const developmentPath = repoLedgerPath();
  return fs.existsSync(developmentPath) ? developmentPath : sharedPath;
}

function ensureSchema(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS runtime_history (\n      date_bucket TEXT PRIMARY KEY,\n      payload_json TEXT NOT NULL,\n      updated_at_ms INTEGER NOT NULL\n    );\n    CREATE INDEX IF NOT EXISTS idx_runtime_history_date ON runtime_history(date_bucket);\n  `);
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function positive(value) {
  return Math.max(0, finite(value));
}

function component(value, tokens) {
  return Math.min(positive(tokens), positive(value));
}

function clampBreakdownComponents(total, rawCr, rawCw, rawOut, rawUnc) {
  const cap = positive(total);
  let cr = component(rawCr, cap);
  let cw = component(rawCw, cap);
  let out = component(rawOut, cap);

  if (cr + cw + out > cap) {
    if (cr > cap) cr = cap;
    if (cr + cw > cap) cw = Math.max(0, cap - cr);
    if (cr + cw + out > cap) out = Math.max(0, cap - cr - cw);
  }
  let unc = component(rawUnc, cap);
  if (cr + cw + out + unc > cap) {
    unc = Math.max(0, cap - cr - cw - out);
  }
  return { cr, cw, out, unc };
}

function normalizeBreakdown(value, tokens, cost = 0, messages = 0, unpricedTokens = 0) {
  const total = positive(tokens);
  const rawCr = positive(value?.cacheReadTokens ?? value?.total_cached_in);
  const rawCw = positive(value?.cacheWriteTokens ?? value?.total_cache_write);
  const rawOut = value?.outputTokens != null
    ? positive(value.outputTokens)
    : (
        positive(value?.total_uncached_in) + positive(value?.total_cached_in) + positive(value?.total_cache_write) + positive(value?.total_output) === total
          ? positive(value?.total_output)
          : (
              positive(value?.total_uncached_in) + positive(value?.total_cached_in) + positive(value?.total_cache_write) + positive(value?.total_output) + positive(value?.total_reasoning) === total
                ? positive(value?.total_output) + positive(value?.total_reasoning)
                : positive(value?.total_output)
            )
      );
  const { cr, cw, out, unc } = clampBreakdownComponents(total, rawCr, rawCw, rawOut, value?.unclassifiedTokens);

  return {
    tokens: total,
    cost: Math.max(0, finite(cost)),
    messages: positive(messages),
    cacheReadTokens: cr,
    cacheWriteTokens: cw,
    outputTokens: out,
    unclassifiedTokens: unc,
    ...(positive(unpricedTokens) > 0 ? { unpricedTokens: component(unpricedTokens, total) } : {})
  };
}

function mergeBreakdown(target, source) {
  target.tokens += positive(source?.tokens);
  target.cost += finite(source?.cost);
  target.messages += positive(source?.messages);
  target.cacheReadTokens += positive(source?.cacheReadTokens);
  target.cacheWriteTokens += positive(source?.cacheWriteTokens);
  target.outputTokens += positive(source?.outputTokens);
  target.unclassifiedTokens += positive(source?.unclassifiedTokens);
  if (source?.unpricedTokens) target.unpricedTokens = (target.unpricedTokens || 0) + positive(source.unpricedTokens);

  const { cr, cw, out, unc } = clampBreakdownComponents(
    target.tokens,
    target.cacheReadTokens,
    target.cacheWriteTokens,
    target.outputTokens,
    target.unclassifiedTokens
  );
  target.cacheReadTokens = cr;
  target.cacheWriteTokens = cw;
  target.outputTokens = out;
  target.unclassifiedTokens = unc;
  return target;
}

function accountingHistoryRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (isAccountingExcludedClient(row.client || row.provider)) return null;
  const source = row.perClient;
  if (!source || typeof source !== 'object') return row;
  const entries = Object.entries(source).filter(([client]) => !isAccountingExcludedClient(client));
  if (entries.length === Object.keys(source).length) return row;
  if (entries.length === 0) return null;

  const breakdowns = entries.map(([, value]) => normalizeBreakdown(
    value, value?.tokens, value?.cost, value?.messages, value?.unpricedTokens
  ));
  const sum = (field) => breakdowns.reduce((total, value) => total + positive(value[field]), 0);
  const clientModels = filterAccountingClientMap(row.clientModels);
  const perModel = {};
  for (const models of Object.values(clientModels || {})) {
    for (const [model, count] of Object.entries(models || {})) {
      const canonical = canonicalModelKey(model);
      perModel[canonical] ||= { tokens: 0 };
      perModel[canonical].tokens += positive(count);
    }
  }
  return {
    ...row,
    tokens: sum('tokens'),
    cost: sum('cost'),
    messages: sum('messages'),
    cacheReadTokens: sum('cacheReadTokens'),
    cacheWriteTokens: sum('cacheWriteTokens'),
    outputTokens: sum('outputTokens'),
    unclassifiedTokens: sum('unclassifiedTokens'),
    perClient: Object.fromEntries(entries),
    perModel,
    clientModels
  };
}

function emptyDay(date) {
  return {
    date,
    tokens: 0,
    cost: 0,
    messages: 0,
    activeTimeMs: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    unclassifiedTokens: 0,
    tokenComponentsAvailable: true,
    perClient: {},
    perModel: {},
    clientModels: {}
  };
}

function enforceDayComponentInvariant(day) {
  const maxDay = positive(day.tokens);
  for (const client of Object.values(day.perClient || {})) {
    const maxClient = positive(client.tokens);
    const { cr, cw, out, unc } = clampBreakdownComponents(
      maxClient,
      client.cacheReadTokens,
      client.cacheWriteTokens,
      client.outputTokens,
      client.unclassifiedTokens
    );
    client.cacheReadTokens = cr;
    client.cacheWriteTokens = cw;
    client.outputTokens = out;
    client.unclassifiedTokens = unc;
  }
  for (const model of Object.values(day.perModel || {})) {
    const maxModel = positive(model.tokens);
    const { cr, cw, out, unc } = clampBreakdownComponents(
      maxModel,
      model.cacheReadTokens,
      model.cacheWriteTokens,
      model.outputTokens,
      model.unclassifiedTokens
    );
    model.cacheReadTokens = cr;
    model.cacheWriteTokens = cw;
    model.outputTokens = out;
    model.unclassifiedTokens = unc;
  }
  const { cr, cw, out, unc } = clampBreakdownComponents(
    maxDay,
    day.cacheReadTokens,
    day.cacheWriteTokens,
    day.outputTokens,
    day.unclassifiedTokens
  );
  day.cacheReadTokens = cr;
  day.cacheWriteTokens = cw;
  day.outputTokens = out;
  day.unclassifiedTokens = unc;
}

function addDayRow(days, row) {
  row = accountingHistoryRow(row);
  if (!row) return;
  const date = String(row?.date || row?.date_bucket || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  const rawClient = String(row.client || row.provider || '').trim();
  const normalizedClient = normalizeClientName(rawClient) || rawClient;
  if (normalizedClient && isAccountingExcludedClient(normalizedClient)) return;

  const day = days.get(date) || emptyDay(date);
  day.clientModels ||= {};
  const tokens = positive(row.tokens ?? row.total_processed);
  const cost = Math.max(0, finite(row.cost ?? row.total_known_cost_usd));
  const messages = positive(row.messages ?? row.turn_count);
  const unpriced = positive(row.unpricedTokens)
    || (positive(row.unknown_pricing_turn_count) > 0 ? tokens : 0);

  if (row.clientModels && typeof row.clientModels === 'object') {
    for (const [client, models] of Object.entries(row.clientModels)) {
      const normClient = normalizeClientName(client) || client;
      if (isAccountingExcludedClient(normClient)) continue;
      if (models && typeof models === 'object') {
        day.clientModels[normClient] ||= {};
        for (const [model, count] of Object.entries(models)) {
          const canonical = canonicalModelKey(model);
          day.clientModels[normClient][canonical] = (day.clientModels[normClient][canonical] || 0) + positive(count);
        }
      }
    }
  }

  if (row.perClient || row.perModel) {
    let sumCr = 0;
    let sumCw = 0;
    let sumOut = 0;
    let sumUnc = 0;
    for (const [client, value] of Object.entries(row.perClient || {})) {
      const normClient = normalizeClientName(client) || client;
      if (isAccountingExcludedClient(normClient)) continue;
      const clientVal = normalizeBreakdown(value, value?.tokens, value?.cost, value?.messages, value?.unpricedTokens);
      mergeBreakdown(day.perClient[normClient] ||= normalizeBreakdown(null, 0), clientVal);
      sumCr += clientVal.cacheReadTokens;
      sumCw += clientVal.cacheWriteTokens;
      sumOut += clientVal.outputTokens;
      sumUnc += clientVal.unclassifiedTokens;
    }
    for (const [model, value] of Object.entries(row.perModel || {})) {
      const canonical = canonicalModelKey(model);
      mergeBreakdown(day.perModel[canonical] ||= normalizeBreakdown(null, 0), normalizeBreakdown(value, value?.tokens, value?.cost, value?.messages, value?.unpricedTokens));
    }
    if (!row.clientModels) {
      const directClient = normalizeClientName(String(row.client || row.provider || (Object.keys(row.perClient || {}).length === 1 ? Object.keys(row.perClient)[0] : '')).trim());
      const model = canonicalModelKey(row.model || row.model_codename || (Object.keys(row.perModel || {}).length === 1 ? Object.keys(row.perModel)[0] : ''));
      if (directClient && model && !isAccountingExcludedClient(directClient)) {
        day.clientModels[directClient] ||= {};
        day.clientModels[directClient][model] = (day.clientModels[directClient][model] || 0) + tokens;
      }
    }

    const { cr, cw, out, unc } = clampBreakdownComponents(
      tokens,
      row.cacheReadTokens != null ? row.cacheReadTokens : sumCr,
      row.cacheWriteTokens != null ? row.cacheWriteTokens : sumCw,
      row.outputTokens != null ? row.outputTokens : sumOut,
      row.unclassifiedTokens != null ? row.unclassifiedTokens : sumUnc
    );

    day.tokens += tokens;
    day.cost += cost;
    day.messages += messages;
    day.cacheReadTokens += cr;
    day.cacheWriteTokens += cw;
    day.outputTokens += out;
    day.unclassifiedTokens += unc;
    if (unpriced > 0) day.unpricedTokens = (day.unpricedTokens || 0) + Math.min(tokens, unpriced);
    if (row.tokenComponentsAvailable === false) day.tokenComponentsAvailable = false;
    enforceDayComponentInvariant(day);
    days.set(date, day);
    return;
  }

  const client = normalizedClient || 'unknown';
  const model = canonicalModelKey(row.model || row.model_codename || '') || 'unknown';
  const clientValue = normalizeBreakdown(
    row.perClient || row,
    tokens,
    cost,
    messages,
    unpriced
  );
  mergeBreakdown(day.perClient[client] ||= normalizeBreakdown(null, 0), clientValue);
  const modelValue = normalizeBreakdown(
    row.perModel || row,
    tokens,
    cost,
    messages,
    unpriced
  );
  mergeBreakdown(day.perModel[model] ||= normalizeBreakdown(null, 0), modelValue);
  if (!row.clientModels && client && model) {
    day.clientModels[client] ||= {};
    day.clientModels[client][model] = (day.clientModels[client][model] || 0) + tokens;
  }

  day.tokens += tokens;
  day.cost += cost;
  day.messages += messages;
  day.cacheReadTokens += clientValue.cacheReadTokens;
  day.cacheWriteTokens += clientValue.cacheWriteTokens;
  day.outputTokens += clientValue.outputTokens;
  day.unclassifiedTokens += clientValue.unclassifiedTokens;
  if (unpriced > 0) day.unpricedTokens = (day.unpricedTokens || 0) + Math.min(tokens, unpriced);
  if (row.tokenComponentsAvailable === false) day.tokenComponentsAvailable = false;
  enforceDayComponentInvariant(day);
  days.set(date, day);
}

function mergeOverlayDay(days, row) {
  row = accountingHistoryRow(row);
  if (!row) return;
  const date = String(row?.date || row?.date_bucket || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const existingDay = days.get(date);
  if (!existingDay) {
    addDayRow(days, row);
    return;
  }

  if (!row.perClient || typeof row.perClient !== 'object' || Object.keys(row.perClient).length === 0) {
    return;
  }

  existingDay.clientModels ||= {};
  existingDay.perModel ||= {};
  existingDay.perClient ||= {};

  for (const [rawClient, rawClientVal] of Object.entries(row.perClient)) {
    const client = normalizeClientName(rawClient) || rawClient;
    if (!client || isAccountingExcludedClient(client)) continue;

    const overlayVal = normalizeBreakdown(
      rawClientVal,
      rawClientVal?.tokens,
      rawClientVal?.cost,
      rawClientVal?.messages,
      rawClientVal?.unpricedTokens
    );
    const existingVal = existingDay.perClient[client];
    const existingTokens = positive(existingVal?.tokens);
    const overlayTokens = positive(overlayVal.tokens);

    if (overlayTokens > existingTokens) {
      existingDay.perClient[client] = overlayVal;

      if (existingDay.clientModels[client]) {
        for (const [model, count] of Object.entries(existingDay.clientModels[client])) {
          const canonical = canonicalModelKey(model);
          if (existingDay.perModel[canonical]) {
            existingDay.perModel[canonical].tokens = Math.max(
              0,
              (existingDay.perModel[canonical].tokens || 0) - positive(count)
            );
          }
        }
        delete existingDay.clientModels[client];
      }

      const cm = row.clientModels?.[rawClient] || row.clientModels?.[client];
      if (cm && typeof cm === 'object') {
        existingDay.clientModels[client] = {};
        for (const [model, count] of Object.entries(cm)) {
          const canonical = canonicalModelKey(model);
          const tokens = positive(count);
          existingDay.clientModels[client][canonical] = tokens;
          existingDay.perModel[canonical] ||= normalizeBreakdown(null, 0);
          existingDay.perModel[canonical].tokens += tokens;
        }
      }
    }
  }

  let totTokens = 0;
  let totCost = 0;
  let totMessages = 0;
  let totCr = 0;
  let totCw = 0;
  let totOut = 0;
  let totUnc = 0;
  let totUnpriced = 0;

  for (const clientVal of Object.values(existingDay.perClient)) {
    totTokens += positive(clientVal.tokens);
    totCost += finite(clientVal.cost);
    totMessages += positive(clientVal.messages);
    totCr += positive(clientVal.cacheReadTokens);
    totCw += positive(clientVal.cacheWriteTokens);
    totOut += positive(clientVal.outputTokens);
    totUnc += positive(clientVal.unclassifiedTokens);
    if (clientVal.unpricedTokens) {
      totUnpriced += positive(clientVal.unpricedTokens);
    }
  }

  const { cr, cw, out, unc } = clampBreakdownComponents(
    totTokens,
    totCr,
    totCw,
    totOut,
    totUnc
  );

  existingDay.tokens = totTokens;
  existingDay.cost = totCost;
  existingDay.messages = totMessages;
  existingDay.cacheReadTokens = cr;
  existingDay.cacheWriteTokens = cw;
  existingDay.outputTokens = out;
  existingDay.unclassifiedTokens = unc;
  if (totUnpriced > 0) {
    existingDay.unpricedTokens = Math.min(totTokens, totUnpriced);
  } else {
    delete existingDay.unpricedTokens;
  }

  enforceDayComponentInvariant(existingDay);
}

function getStatement(database, key, sql) {
  if (!database._stmts) database._stmts = new Map();
  let stmt = database._stmts.get(key);
  if (!stmt) {
    stmt = database.prepare(sql);
    database._stmts.set(key, stmt);
  }
  return stmt;
}

function parseRuntimeRows(database) {
  const stmt = getStatement(database, 'runtimeRows', `SELECT date_bucket, payload_json FROM ${RUNTIME_HISTORY_TABLE} ORDER BY date_bucket`);
  const rows = stmt.all();
  if (rows.length === 0) return [];
  return rows.map((row) => {
    try { return JSON.parse(row.payload_json); } catch (_) { return null; }
  }).filter(Boolean);
}

function baseRows(database, coveredDates) {
  if (!database) return [];
  const hasDaily = getStatement(database, 'hasDaily', "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'daily_usage'").get();
  if (!hasDaily) return [];
  const covered = coveredDates instanceof Set ? coveredDates : new Set(coveredDates || []);
  const stmt = getStatement(database, 'baseRows', `
    SELECT date_bucket, provider, model_codename, turn_count,
      total_uncached_in, total_cached_in, total_cache_write, total_output, total_reasoning,
      total_processed, total_known_cost_usd, unknown_pricing_turn_count,
      cache_savings_pct
    FROM daily_usage
    ORDER BY date_bucket, provider, model_codename
  `);
  const rows = stmt.all();
  if (covered.size === 0) return rows;
  return rows.filter((row) => !covered.has(String(row.date_bucket).slice(0, 10)));
}

const DAILY_USAGE_COLUMNS = Object.freeze([
  { name: 'turn_count', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'total_uncached_in', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'total_cached_in', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'total_cache_write', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'total_output', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'total_reasoning', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'total_processed', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'total_known_cost_usd', type: 'REAL NOT NULL DEFAULT 0.0' },
  { name: 'unknown_pricing_turn_count', type: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'cache_savings_pct', type: 'REAL NOT NULL DEFAULT 0.0' }
]);

function ensureDailyUsageTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS daily_usage (
      date_bucket TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_codename TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      total_uncached_in INTEGER NOT NULL DEFAULT 0,
      total_cached_in INTEGER NOT NULL DEFAULT 0,
      total_cache_write INTEGER NOT NULL DEFAULT 0,
      total_output INTEGER NOT NULL DEFAULT 0,
      total_reasoning INTEGER NOT NULL DEFAULT 0,
      total_processed INTEGER NOT NULL DEFAULT 0,
      total_known_cost_usd REAL NOT NULL DEFAULT 0.0,
      unknown_pricing_turn_count INTEGER NOT NULL DEFAULT 0,
      cache_savings_pct REAL NOT NULL DEFAULT 0.0,
      PRIMARY KEY (date_bucket, provider, model_codename)
    );
  `);
  const existingCols = new Set(database.prepare("PRAGMA table_info('daily_usage')").all().map((c) => c.name));
  for (const col of DAILY_USAGE_COLUMNS) {
    if (!existingCols.has(col.name)) {
      database.exec(`ALTER TABLE daily_usage ADD COLUMN ${col.name} ${col.type};`);
    }
  }
}

function reconcileDailyUsage(database, seedPath) {
  if (!seedPath || !fs.existsSync(seedPath)) return;
  const escapedSeed = path.resolve(seedPath).replace(/'/g, "''");
  try {
    database.exec(`ATTACH DATABASE '${escapedSeed}' AS seed_ledger;`);
  } catch (_) {
    return;
  }

  try {
    const seedHasDaily = database.prepare("SELECT 1 FROM seed_ledger.sqlite_master WHERE type = 'table' AND name = 'daily_usage'").get();
    if (!seedHasDaily) return;

    ensureDailyUsageTable(database);

    const comparison = database.prepare(`
      SELECT
        (SELECT coalesce(sum(total_processed), 0) FROM daily_usage) AS user_tokens,
        (SELECT coalesce(sum(total_processed), 0) FROM seed_ledger.daily_usage) AS seed_tokens,
        EXISTS (
          SELECT 1 FROM seed_ledger.daily_usage s
          WHERE NOT EXISTS (
            SELECT 1 FROM daily_usage u
            WHERE u.date_bucket = s.date_bucket
              AND u.provider = s.provider
              AND u.model_codename = s.model_codename
          )
        ) AS missing_rows
    `).get();

    if (!comparison) return;

    const needsMerge = comparison.user_tokens < comparison.seed_tokens || Boolean(comparison.missing_rows);
    if (!needsMerge) return;

    database.exec(`
      INSERT INTO daily_usage (
        date_bucket, provider, model_codename, turn_count,
        total_uncached_in, total_cached_in, total_cache_write, total_output,
        total_reasoning, total_processed, total_known_cost_usd,
        unknown_pricing_turn_count, cache_savings_pct
      )
      SELECT
        date_bucket, provider, model_codename, turn_count,
        total_uncached_in, total_cached_in, total_cache_write, total_output,
        total_reasoning, total_processed, total_known_cost_usd,
        unknown_pricing_turn_count, cache_savings_pct
      FROM seed_ledger.daily_usage
      WHERE true
      ON CONFLICT(date_bucket, provider, model_codename) DO UPDATE SET
        turn_count = CASE
          WHEN excluded.total_processed > daily_usage.total_processed
            OR (excluded.total_processed = daily_usage.total_processed AND excluded.turn_count > daily_usage.turn_count)
          THEN excluded.turn_count ELSE daily_usage.turn_count END,
        total_uncached_in = CASE
          WHEN excluded.total_processed > daily_usage.total_processed
          THEN excluded.total_uncached_in ELSE daily_usage.total_uncached_in END,
        total_cached_in = CASE
          WHEN excluded.total_processed > daily_usage.total_processed
          THEN excluded.total_cached_in ELSE daily_usage.total_cached_in END,
        total_cache_write = CASE
          WHEN excluded.total_processed > daily_usage.total_processed
          THEN excluded.total_cache_write ELSE daily_usage.total_cache_write END,
        total_output = CASE
          WHEN excluded.total_processed > daily_usage.total_processed
          THEN excluded.total_output ELSE daily_usage.total_output END,
        total_reasoning = CASE
          WHEN excluded.total_processed > daily_usage.total_processed
          THEN excluded.total_reasoning ELSE daily_usage.total_reasoning END,
        total_processed = CASE
          WHEN excluded.total_processed > daily_usage.total_processed
          THEN excluded.total_processed ELSE daily_usage.total_processed END,
        total_known_cost_usd = CASE
          WHEN excluded.total_processed > daily_usage.total_processed
            OR (excluded.total_processed = daily_usage.total_processed AND excluded.total_known_cost_usd > daily_usage.total_known_cost_usd)
          THEN excluded.total_known_cost_usd ELSE daily_usage.total_known_cost_usd END,
        unknown_pricing_turn_count = CASE
          WHEN excluded.total_processed > daily_usage.total_processed
          THEN excluded.unknown_pricing_turn_count ELSE daily_usage.unknown_pricing_turn_count END,
        cache_savings_pct = CASE
          WHEN excluded.total_processed > daily_usage.total_processed
          THEN excluded.cache_savings_pct ELSE daily_usage.cache_savings_pct END;
    `);
  } catch (_) {
    // Ignore migration errors to avoid crashing callers
  } finally {
    try {
      database.exec('DETACH DATABASE seed_ledger;');
    } catch (_) {}
  }
}

function packagedSeedPath(options = {}) {
  const explicit = String(options.seedPath || options.env?.TOKEN_MONITOR_LEDGER_SEED_PATH
    || process.env.TOKEN_MONITOR_LEDGER_SEED_PATH || '').trim();
  if (explicit) return path.resolve(explicit);
  if (process.resourcesPath) {
    const candidate = path.join(process.resourcesPath, 'token_ledger.seed.sqlite');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function historyFromDays(days) {
  const daily = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  daily.forEach((day) => {
    enforceDayComponentInvariant(day);
    day.tokens = Math.round(day.tokens);
    day.cost = Number(day.cost.toFixed(6));
    day.messages = Math.round(day.messages);
    day.cacheReadTokens = Math.round(day.cacheReadTokens);
    day.cacheWriteTokens = Math.round(day.cacheWriteTokens);
    day.outputTokens = Math.round(day.outputTokens);
    day.unclassifiedTokens = Math.round(day.unclassifiedTokens);
    for (const value of Object.values(day.perClient)) {
      value.tokens = Math.round(value.tokens);
      value.cost = Number(value.cost.toFixed(6));
      value.cacheReadTokens = Math.round(value.cacheReadTokens);
      value.cacheWriteTokens = Math.round(value.cacheWriteTokens);
      value.outputTokens = Math.round(value.outputTokens);
      value.unclassifiedTokens = Math.round(value.unclassifiedTokens);
    }
    for (const value of Object.values(day.perModel)) {
      value.tokens = Math.round(value.tokens);
      value.cost = Number(value.cost.toFixed(6));
      value.cacheReadTokens = Math.round(value.cacheReadTokens);
      value.cacheWriteTokens = Math.round(value.cacheWriteTokens);
      value.outputTokens = Math.round(value.outputTokens);
      value.unclassifiedTokens = Math.round(value.unclassifiedTokens);
    }
    enforceDayComponentInvariant(day);
    if (day.clientModels && typeof day.clientModels === 'object') {
      for (const models of Object.values(day.clientModels)) {
        if (models && typeof models === 'object') {
          for (const [m, count] of Object.entries(models)) {
            models[m] = Math.round(positive(count));
          }
        }
      }
    }
  });
  computeIntensities(daily);
  const monthly = monthlyRollup(daily);
  let totalTokens = 0;
  let totalCost = 0;
  let activeDays = 0;
  let peakDayTokens = 0;
  let messages = 0;
  let unpricedTokens = 0;
  const modelTotals = {};

  for (let i = 0; i < daily.length; i++) {
    const day = daily[i];
    totalTokens += day.tokens;
    totalCost += day.cost;
    if (day.tokens > 0) activeDays += 1;
    if (day.tokens > peakDayTokens) peakDayTokens = day.tokens;
    messages += day.messages;
    if (day.unpricedTokens > 0) unpricedTokens += positive(day.unpricedTokens);
    for (const [model, value] of Object.entries(day.perModel)) {
      modelTotals[model] = (modelTotals[model] || 0) + value.tokens;
    }
  }

  const sortedModels = Object.entries(modelTotals).sort((a, b) => b[1] - a[1]);
  const favoriteModel = sortedModels[0]?.[0] || '';
  const summary = {
    totalTokens,
    totalCost: Number(totalCost.toFixed(6)),
    activeDays,
    peakDayTokens,
    favoriteModel,
    messages,
    ...(unpricedTokens > 0 ? { unpricedTokens } : {})
  };
  return { daily, monthly, summary };
}

function periodFromDays(days) {
  const period = emptyPeriod();
  period.clientModels ||= {};
  for (const day of days) {
    period.totalTokens += positive(day.tokens);
    period.costUsd += Math.max(0, finite(day.cost));
    period.cacheReadTokens += positive(day.cacheReadTokens);
    period.cacheWriteTokens += positive(day.cacheWriteTokens);
    period.outputTokens += positive(day.outputTokens);
    period.unclassifiedTokens += positive(day.unclassifiedTokens);
    if (day.unpricedTokens) period.unpricedTokens = (period.unpricedTokens || 0) + positive(day.unpricedTokens);
    for (const [client, value] of Object.entries(day.perClient || {})) {
      period.clients[client] = (period.clients[client] || 0) + positive(value.tokens);
      period.clientCosts[client] = (period.clientCosts[client] || 0) + Math.max(0, finite(value.cost));
      period.clientCacheReads[client] = (period.clientCacheReads[client] || 0) + positive(value.cacheReadTokens);
      period.clientCacheWrites[client] = (period.clientCacheWrites[client] || 0) + positive(value.cacheWriteTokens);
      period.clientOutputs[client] = (period.clientOutputs[client] || 0) + positive(value.outputTokens);
      period.clientUnclassifiedTokens[client] = (period.clientUnclassifiedTokens[client] || 0) + positive(value.unclassifiedTokens);
    }
    for (const [model, value] of Object.entries(day.perModel || {})) {
      const canonical = canonicalModelKey(model);
      period.models[canonical] = (period.models[canonical] || 0) + positive(value.tokens);
      period.modelCosts[canonical] = (period.modelCosts[canonical] || 0) + Math.max(0, finite(value.cost));
      period.modelCacheReads[canonical] = (period.modelCacheReads[canonical] || 0) + positive(value.cacheReadTokens);
      period.modelCacheWrites[canonical] = (period.modelCacheWrites[canonical] || 0) + positive(value.cacheWriteTokens);
      period.modelOutputs[canonical] = (period.modelOutputs[canonical] || 0) + positive(value.outputTokens);
      period.modelUnclassifiedTokens[canonical] = (period.modelUnclassifiedTokens[canonical] || 0) + positive(value.unclassifiedTokens);
    }
    if (day.clientModels && typeof day.clientModels === 'object' && Object.keys(day.clientModels).length > 0) {
      for (const [client, models] of Object.entries(day.clientModels)) {
        if (models && typeof models === 'object') {
          period.clientModels[client] ||= {};
          for (const [model, count] of Object.entries(models)) {
            const canonical = canonicalModelKey(model);
            period.clientModels[client][canonical] = (period.clientModels[client][canonical] || 0) + positive(count);
          }
        }
      }
    } else if (Object.keys(day.perClient || {}).length === 1 && Object.keys(day.perModel || {}).length === 1) {
      const client = Object.keys(day.perClient)[0];
      const model = canonicalModelKey(Object.keys(day.perModel)[0]);
      period.clientModels[client] ||= {};
      period.clientModels[client][model] = (period.clientModels[client][model] || 0) + positive(day.tokens);
    }
  }

  const { cr, cw, out, unc } = clampBreakdownComponents(
    period.totalTokens,
    period.cacheReadTokens,
    period.cacheWriteTokens,
    period.outputTokens,
    period.unclassifiedTokens
  );
  period.cacheReadTokens = cr;
  period.cacheWriteTokens = cw;
  period.outputTokens = out;
  period.unclassifiedTokens = unc;

  for (const client of Object.keys(period.clients)) {
    const cTokens = positive(period.clients[client]);
    const clampedClient = clampBreakdownComponents(
      cTokens,
      period.clientCacheReads[client],
      period.clientCacheWrites[client],
      period.clientOutputs[client],
      period.clientUnclassifiedTokens[client]
    );
    period.clientCacheReads[client] = clampedClient.cr;
    period.clientCacheWrites[client] = clampedClient.cw;
    period.clientOutputs[client] = clampedClient.out;
    period.clientUnclassifiedTokens[client] = clampedClient.unc;
  }

  period.costUsd = Number(period.costUsd.toFixed(6));
  return period;
}

function readCollectorHistoryOverlay(options = {}) {
  if (options.path && !options.archivePath) {
    const defaultShared = resolveTokenLedgerPath({});
    if (path.resolve(options.path) !== path.resolve(defaultShared)) return null;
  }
  try {
    const { readDailyHistoryArchive, graphFromDailyHistoryArchive } = require('../dailyHistoryArchive');
    const { normalizeHistory, parseGraphResult } = require('../history');
    const archiveOptions = { ...options };
    delete archiveOptions.path;
    if (options.archivePath) {
      archiveOptions.path = options.archivePath;
    }
    const archive = readDailyHistoryArchive(archiveOptions);
    if (!archive || (!Object.keys(archive.days || {}).length && !Object.keys(archive.liveDays || {}).length)) {
      return null;
    }
    const todayKey = options.todayKey || localDayKey();
    const graph = graphFromDailyHistoryArchive([], archive, { todayKey });
    return normalizeHistory(parseGraphResult(graph), { todayKey });
  } catch (_) {
    return null;
  }
}

function createTokenLedgerStore(storeOptions = {}) {
  const options = storeOptions;
  const databasePath = resolveTokenLedgerPath(options);
  const explicitSeed = packagedSeedPath(options);
  const fallbackSeed = !options.path && path.resolve(repoLedgerPath()) !== path.resolve(databasePath) && fs.existsSync(repoLedgerPath())
    ? repoLedgerPath()
    : null;
  const seedPath = explicitSeed || fallbackSeed;
  let database = null;
  let available = false;

  function cleanStaleWal() {
    try { fs.rmSync(`${databasePath}-wal`, { force: true }); } catch (_) {}
    try { fs.rmSync(`${databasePath}-shm`, { force: true }); } catch (_) {}
  }

  function isCorrupt(db) {
    try {
      const check = db.prepare('PRAGMA quick_check').get();
      return !check || check.quick_check !== 'ok';
    } catch (_) {
      return true;
    }
  }

  function open() {
    if (database) return database;
    try {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });

      const dbExists = fs.existsSync(databasePath);
      let needsCopy = !dbExists;
      if (dbExists) {
        try {
          const stat = fs.statSync(databasePath);
          if (stat.size === 0) needsCopy = true;
        } catch (_) {
          needsCopy = true;
        }
      }

      if (needsCopy && seedPath && fs.existsSync(seedPath)) {
        cleanStaleWal();
        fs.copyFileSync(seedPath, databasePath);
      }

      database = new DatabaseSync(databasePath);
      if (isCorrupt(database)) {
        try { database.close(); } catch (_) {}
        database = null;
        if (seedPath && fs.existsSync(seedPath)) {
          cleanStaleWal();
          fs.copyFileSync(seedPath, databasePath);
          database = new DatabaseSync(databasePath);
        }
      }

      ensureSchema(database);
      if (seedPath && fs.existsSync(seedPath) && path.resolve(seedPath) !== path.resolve(databasePath)) {
        reconcileDailyUsage(database, seedPath);
      }
      available = true;
    } catch (_) {
      try { database?.close(); } catch (_) {}
      database = null;
      available = false;
    }
    return database;
  }

  function readHistory(readOptions = {}) {
    const options = { ...storeOptions, ...readOptions };
    if (!fs.existsSync(databasePath) && !(seedPath && fs.existsSync(seedPath))) return null;
    const db = open();
    if (!db) return null;
    const runtime = parseRuntimeRows(db);
    const coveredDates = new Set(runtime.map((row) => String(row.date || '').slice(0, 10)));
    const days = new Map();
    for (const row of baseRows(db, coveredDates)) addDayRow(days, row);
    for (const row of runtime) addDayRow(days, row);

    let overlay = Array.isArray(options.overlayHistory?.daily) ? options.overlayHistory.daily : null;
    if (overlay === null) {
      const collectorOverlay = readCollectorHistoryOverlay(options);
      overlay = Array.isArray(collectorOverlay?.daily) ? collectorOverlay.daily : [];
    }

    const today = (options.today || localDayKey()).slice(0, 10);
    const isSingleDayOverlay = overlay.length === 1;

    for (const row of overlay) {
      const date = String(row?.date || '').slice(0, 10);
      if (!date) continue;
      if (isSingleDayOverlay || date >= today) {
        days.delete(date);
        addDayRow(days, row);
      } else if (!days.has(date)) {
        addDayRow(days, row);
      } else {
        mergeOverlayDay(days, row);
      }
    }
    return historyFromDays(days);
  }

  function readPeriods(readOptions = {}) {
    const options = { ...storeOptions, ...readOptions };
    const history = readHistory(options);
    if (!history) return null;
    const today = localDayKey();
    const month = today.slice(0, 7);
    const periods = {
      today: periodFromDays(history.daily.filter((day) => day.date === today)),
      month: periodFromDays(history.daily.filter((day) => day.date.slice(0, 7) === month)),
      allTime: periodFromDays(history.daily)
    };

    const periodNames = ['today', 'month', 'allTime'];
    for (const name of periodNames) {
      const period = periods[name];
      const basePeriod = options.basePeriods?.[name]
        || options.activePeriods?.[name]
        || (options.basePeriod && options.basePeriod[name] ? options.basePeriod[name] : null)
        || (options.activePeriod && options.activePeriod[name] ? options.activePeriod[name] : null)
        || (name === 'allTime' ? (options.basePeriod || options.activePeriod) : null);

      if (basePeriod && typeof basePeriod === 'object') {
        const baseCost = Math.max(0, finite(basePeriod.costUsd));
        if (baseCost > period.costUsd) {
          period.costUsd = Number(baseCost.toFixed(6));
        }
        const baseTokens = Math.max(0, Math.round(Number(basePeriod.totalTokens) || 0));
        if (baseTokens > period.totalTokens) {
          period.totalTokens = baseTokens;
        }
        for (const field of ['cacheReadTokens', 'cacheWriteTokens', 'outputTokens', 'unclassifiedTokens']) {
          const baseCount = Math.max(0, Math.round(Number(basePeriod[field]) || 0));
          if (baseCount > (period[field] || 0)) {
            period[field] = baseCount;
          }
        }
        const clampedBase = clampBreakdownComponents(
          period.totalTokens,
          period.cacheReadTokens,
          period.cacheWriteTokens,
          period.outputTokens,
          period.unclassifiedTokens
        );
        period.cacheReadTokens = clampedBase.cr;
        period.cacheWriteTokens = clampedBase.cw;
        period.outputTokens = clampedBase.out;
        period.unclassifiedTokens = clampedBase.unc;

        if (basePeriod.clients && typeof basePeriod.clients === 'object') {
          period.clients ||= {};
          for (const [client, tokens] of Object.entries(filterAccountingClientMap(basePeriod.clients) || {})) {
            const count = Math.max(0, Math.round(Number(tokens) || 0));
            if (count > (period.clients[client] || 0)) {
              period.clients[client] = count;
            }
          }
        }
        if (basePeriod.models && typeof basePeriod.models === 'object') {
          period.models ||= {};
          for (const [model, tokens] of Object.entries(basePeriod.models)) {
            const canonical = canonicalModelKey(model);
            const count = Math.max(0, Math.round(Number(tokens) || 0));
            if (count > (period.models[canonical] || 0)) {
              period.models[canonical] = count;
            }
          }
        }
        if (basePeriod.clientCosts && typeof basePeriod.clientCosts === 'object') {
          period.clientCosts ||= {};
          for (const [client, cost] of Object.entries(basePeriod.clientCosts)) {
            const baseClientCost = Math.max(0, finite(cost));
            if (baseClientCost > (period.clientCosts[client] || 0)) {
              period.clientCosts[client] = Number(baseClientCost.toFixed(6));
            }
          }
        }
        if (basePeriod.clientModels && typeof basePeriod.clientModels === 'object') {
          period.clientModels ||= {};
          for (const [client, models] of Object.entries(filterAccountingClientMap(basePeriod.clientModels) || {})) {
            if (models && typeof models === 'object') {
              period.clientModels[client] ||= {};
              for (const [model, count] of Object.entries(models)) {
                const canonical = canonicalModelKey(model);
                period.clientModels[client][canonical] = Math.max(period.clientModels[client][canonical] || 0, positive(count));
              }
            }
          }
        }
        if (basePeriod.capabilities?.throughput === true) {
          period.capabilities.throughput = true;
          for (const field of ['timedTokens', 'timedOutputTokens', 'timedDurationMs']) {
            period[field] = Math.max(positive(period[field]), positive(basePeriod[field]));
          }
          if (basePeriod.modelThroughput && typeof basePeriod.modelThroughput === 'object') {
            period.modelThroughput ||= {};
            for (const [model, counters] of Object.entries(basePeriod.modelThroughput)) {
              if (!counters || typeof counters !== 'object') continue;
              period.modelThroughput[model] ||= { timedTokens: 0, timedOutputTokens: 0, timedDurationMs: 0 };
              for (const field of ['timedTokens', 'timedOutputTokens', 'timedDurationMs']) {
                period.modelThroughput[model][field] = Math.max(
                  positive(period.modelThroughput[model][field]),
                  positive(counters[field])
                );
              }
            }
          }
        }
        if (basePeriod.unpricedTokens) {
          period.unpricedTokens = Math.max(period.unpricedTokens || 0, positive(basePeriod.unpricedTokens));
        }
      }
    }
    return periods;
  }

  function writeHistory(history) {
    const db = open();
    if (!db || !history || !Array.isArray(history.daily)) return false;
    const now = Date.now();
    const insert = db.prepare(`
      INSERT INTO ${RUNTIME_HISTORY_TABLE} (date_bucket, payload_json, updated_at_ms)
      VALUES (?, ?, ?)
      ON CONFLICT(date_bucket) DO UPDATE SET payload_json = excluded.payload_json, updated_at_ms = excluded.updated_at_ms
    `);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`DELETE FROM ${RUNTIME_HISTORY_TABLE}`);
      for (const row of history.daily) {
        const date = String(row?.date || '').slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) insert.run(date, JSON.stringify(row), now);
      }
      db.exec('COMMIT');
      return true;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw error;
    }
  }

  function close() {
    try { database?.close(); } catch (_) {}
    database = null;
    available = false;
  }

  return {
    available: () => available || Boolean(open()),
    databasePath,
    readHistory,
    readPeriods,
    writeHistory,
    close
  };
}

module.exports = {
  addDayRow,
  baseRows,
  createTokenLedgerStore,
  emptyDay,
  packagedSeedPath,
  periodFromDays,
  resolveTokenLedgerPath
};
