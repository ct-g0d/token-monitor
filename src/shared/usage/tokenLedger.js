'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { sharedDataDir } = require('../config');
const { computeIntensities, localDayKey, monthlyRollup, parseModelIdentifier } = require('../history');
const { emptyPeriod, normalizeClientName } = require('../usage');
const { filterAccountingClientMap, isAccountingExcludedClient } = require('../clientTracking');
const { calculateTurnCost } = require('../pricing/formula');
const { PricingEngine } = require('../pricing/engine');

const defaultPricingEngine = new PricingEngine();

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
const TOKEN_LEDGER_SCHEMA_VERSION = 2;

function migrationNow() { return Date.now(); }

function normalizedFactClient(value) {
  const client = normalizeClientName(String(value || '').trim());
  if (!client || client === 'synthetic') throw new Error('usage event client_id must be a tracked client');
  return client;
}

function dateBucketFromMs(value) {
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? '1970-01-01' : date.toISOString().slice(0, 10);
}

function payloadHash(value) {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function backfillUsageEventCosts(database, pricingEngine = defaultPricingEngine) {
  try {
    const db = database?.database ? database.database() : database;
    if (!db) return 0;
    const models = db.prepare(`
      SELECT DISTINCT model_id
      FROM usage_events
      WHERE state = 'active' AND (cost_usd IS NULL OR cost_usd = 0.0)
    `).all();
    if (!models || models.length === 0) return 0;

    const stmt = db.prepare(`
      UPDATE usage_events
      SET cost_usd = ROUND((input_tokens * ?) + (cached_input_tokens * ?) + (cache_write_tokens * ?) + (output_tokens * ?), 6)
      WHERE model_id = ? AND state = 'active' AND (cost_usd IS NULL OR cost_usd = 0.0)
    `);

    let updated = 0;
    for (const row of models) {
      const rates = pricingEngine.resolveRates(row.model_id);
      if (rates) {
        stmt.run(
          rates.inputCostPerToken,
          rates.cacheReadCostPerToken,
          rates.cacheWriteCostPerToken,
          rates.outputCostPerToken,
          row.model_id
        );
        updated++;
      }
    }
    if (updated > 0) {
      clearCanonicalFactCache(db);
    }
    return updated;
  } catch (_) {
    return 0;
  }
}

function ensureFactSchema(database) {
  backfillUsageEventCosts(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS ingestion_runs (
      run_id INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS source_files (
      file_id INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS usage_events (
      event_id INTEGER PRIMARY KEY,
      natural_key TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      session_id TEXT,
      request_id TEXT,
      occurred_at_ms INTEGER NOT NULL,
      date_bucket TEXT NOT NULL,
      model_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL,
      cost_usd REAL,
      payload_hash TEXT NOT NULL,
      first_seen_run_id INTEGER REFERENCES ingestion_runs(run_id),
      last_seen_run_id INTEGER REFERENCES ingestion_runs(run_id),
      state TEXT NOT NULL DEFAULT 'active'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_usage_events_source_key ON usage_events(source_kind, source_id, natural_key);
    CREATE INDEX IF NOT EXISTS ix_usage_events_day_client ON usage_events(date_bucket, client_id);
    CREATE INDEX IF NOT EXISTS ix_usage_events_session ON usage_events(client_id, session_id, occurred_at_ms);
    CREATE TABLE IF NOT EXISTS source_watermarks (
      source_kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      cursor_type TEXT NOT NULL,
      cursor_json TEXT NOT NULL,
      file_id INTEGER REFERENCES source_files(file_id),
      generation INTEGER NOT NULL DEFAULT 1,
      source_mtime_ms INTEGER,
      source_size INTEGER,
      prefix_hash TEXT,
      last_success_run_id INTEGER REFERENCES ingestion_runs(run_id),
      last_success_at_ms INTEGER NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (source_kind, source_id)
    );
    CREATE INDEX IF NOT EXISTS ix_source_watermarks_dirty ON source_watermarks(dirty, source_kind);
    CREATE TABLE IF NOT EXISTS usage_sweep_runs (
      sweep_id INTEGER PRIMARY KEY,
      started_at_ms INTEGER NOT NULL,
      completed_at_ms INTEGER,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      event_count INTEGER NOT NULL DEFAULT 0,
      error_json TEXT
    );
    CREATE TABLE IF NOT EXISTS source_event_equivalence (
      canonical_natural_key TEXT NOT NULL,
      source_natural_key TEXT NOT NULL,
      relationship TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      PRIMARY KEY (canonical_natural_key, source_natural_key)
    );
  `);
}

function upsertUsageEvent(database, event, options = {}) {
  const occurred = Number(event.occurredAtMs ?? event.occurred_at_ms ?? migrationNow());
  const client = normalizedFactClient(event.clientId ?? event.client_id);
  const total = Math.max(0, Math.round(Number(event.totalTokens ?? event.total_tokens ?? 0)));
  const row = {
    naturalKey: String((event.naturalKey ?? event.natural_key ?? '')).trim(),
    clientId: client,
    sourceKind: String((event.sourceKind ?? event.source_kind ?? 'unknown')),
    sourceId: String((event.sourceId ?? event.source_id ?? 'default')),
    sessionId: event.sessionId ?? event.session_id ?? null,
    requestId: event.requestId ?? event.request_id ?? null,
    occurredAtMs: Number.isFinite(occurred) ? occurred : migrationNow(),
    dateBucket: String((event.dateBucket ?? event.date_bucket ?? dateBucketFromMs(occurred))).slice(0, 10),
    modelId: String((event.modelId ?? event.model_id ?? 'unknown')),
    inputTokens: Math.max(0, Math.round(Number(event.inputTokens ?? event.input_tokens ?? event.uncachedInput ?? 0))),
    cachedInputTokens: Math.max(0, Math.round(Number(event.cachedInputTokens ?? event.cached_input_tokens ?? 0))),
    cacheWriteTokens: Math.max(0, Math.round(Number(event.cacheWriteTokens ?? event.cache_write_tokens ?? 0))),
    outputTokens: Math.max(0, Math.round(Number(event.outputTokens ?? event.output_tokens ?? 0))),
    reasoningTokens: Math.max(0, Math.round(Number(event.reasoningTokens ?? event.reasoning_tokens ?? 0))),
    totalTokens: total,
    costUsd: (() => {
      let cost = event.costUsd ?? event.cost_usd ?? null;
      if ((cost === null || cost === undefined || Number(cost) === 0) && event.modelId) {
        const pe = options.pricingEngine || defaultPricingEngine;
        const rates = pe ? pe.resolveRates(event.modelId) : null;
        if (rates) {
          cost = calculateTurnCost({
            uncached_input: Math.max(0, Math.round(Number(event.inputTokens ?? event.input_tokens ?? event.uncachedInput ?? 0))),
            cached_input: Math.max(0, Math.round(Number(event.cachedInputTokens ?? event.cached_input_tokens ?? 0))),
            cache_write: Math.max(0, Math.round(Number(event.cacheWriteTokens ?? event.cache_write_tokens ?? 0))),
            output_tokens: Math.max(0, Math.round(Number(event.outputTokens ?? event.output_tokens ?? 0)))
          }, rates);
        }
      }
      return cost;
    })(),
    payloadHash: String((event.payloadHash ?? event.payload_hash ?? payloadHash(event))),
    runId: options.runId ?? event.lastSeenRunId ?? event.last_seen_run_id ?? null,
    state: String(event.state || 'active')
  };
  if (!row.naturalKey) throw new Error('usage event natural_key is required');
  const stmt = database.prepare(`
    INSERT INTO usage_events (natural_key, client_id, source_kind, source_id, session_id, request_id,
      occurred_at_ms, date_bucket, model_id, input_tokens, cached_input_tokens, cache_write_tokens,
      output_tokens, reasoning_tokens, total_tokens, cost_usd, payload_hash, first_seen_run_id, last_seen_run_id, state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(natural_key) DO UPDATE SET
      client_id=excluded.client_id, source_kind=excluded.source_kind, source_id=excluded.source_id,
      session_id=excluded.session_id, request_id=excluded.request_id, occurred_at_ms=excluded.occurred_at_ms,
      date_bucket=excluded.date_bucket, model_id=excluded.model_id, input_tokens=excluded.input_tokens,
      cached_input_tokens=excluded.cached_input_tokens, cache_write_tokens=excluded.cache_write_tokens,
      output_tokens=excluded.output_tokens, reasoning_tokens=excluded.reasoning_tokens, total_tokens=excluded.total_tokens,
      cost_usd=excluded.cost_usd, payload_hash=excluded.payload_hash,
      last_seen_run_id=COALESCE(excluded.last_seen_run_id, usage_events.last_seen_run_id), state=excluded.state
  `);
  stmt.run(row.naturalKey, row.clientId, row.sourceKind, row.sourceId, row.sessionId, row.requestId,
    row.occurredAtMs, row.dateBucket, row.modelId, row.inputTokens, row.cachedInputTokens, row.cacheWriteTokens,
    row.outputTokens, row.reasoningTokens, row.totalTokens, row.costUsd, row.payloadHash, row.runId, row.runId, row.state);
  clearCanonicalFactCache(database);
  return database.prepare('SELECT * FROM usage_events WHERE natural_key = ?').get(row.naturalKey);
}

function readSourceWatermark(database, sourceKind, sourceId) {
  const row = database.prepare('SELECT * FROM source_watermarks WHERE source_kind = ? AND source_id = ?').get(sourceKind, sourceId);
  if (!row) return null;
  return { ...row, cursor: JSON.parse(row.cursor_json || '{}') };
}

function writeSourceWatermark(database, watermark) {
  const now = Number(watermark.lastSuccessAtMs ?? watermark.last_success_at_ms ?? migrationNow());
  database.prepare(`INSERT INTO source_watermarks
    (source_kind, source_id, cursor_type, cursor_json, file_id, generation, source_mtime_ms, source_size, prefix_hash,
     last_success_run_id, last_success_at_ms, dirty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_kind, source_id) DO UPDATE SET cursor_type=excluded.cursor_type, cursor_json=excluded.cursor_json,
      file_id=excluded.file_id, generation=excluded.generation, source_mtime_ms=excluded.source_mtime_ms,
      source_size=excluded.source_size, prefix_hash=excluded.prefix_hash, last_success_run_id=excluded.last_success_run_id,
      last_success_at_ms=excluded.last_success_at_ms, dirty=excluded.dirty`).run(
    String(watermark.sourceKind ?? watermark.source_kind), String(watermark.sourceId ?? watermark.source_id),
    String((watermark.cursorType ?? watermark.cursor_type ?? 'opaque')), JSON.stringify(watermark.cursor ?? JSON.parse(watermark.cursor_json || '{}')),
    watermark.fileId ?? watermark.file_id ?? null, Number(watermark.generation || 1), watermark.sourceMtimeMs ?? watermark.source_mtime_ms ?? null,
    watermark.sourceSize ?? watermark.source_size ?? null, watermark.prefixHash ?? watermark.prefix_hash ?? null,
    watermark.lastSuccessRunId ?? watermark.last_success_run_id ?? null, now, Number(watermark.dirty || 0));
  return readSourceWatermark(database, watermark.sourceKind ?? watermark.source_kind, watermark.sourceId ?? watermark.source_id);
}

function recordSourceEquivalence(database, equivalence) {
  database.prepare(`INSERT INTO source_event_equivalence
    (canonical_natural_key, source_natural_key, relationship, evidence_json, created_at_ms)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(canonical_natural_key, source_natural_key) DO UPDATE SET
      relationship=excluded.relationship, evidence_json=excluded.evidence_json`).run(
    equivalence.canonicalNaturalKey ?? equivalence.canonical_natural_key,
    equivalence.sourceNaturalKey ?? equivalence.source_natural_key,
    equivalence.relationship || 'equivalent', JSON.stringify(equivalence.evidence || {}), migrationNow());
}

function beginSweepRun(database, { mode = 'full', startedAtMs = migrationNow() } = {}) {
  const result = database.prepare('INSERT INTO usage_sweep_runs (started_at_ms, mode, status) VALUES (?, ?, ?)').run(startedAtMs, mode, 'running');
  const sweepId = Number(result.lastInsertRowid);
  // source_watermarks keeps the historical ingestion_runs foreign key. A
  // sweep is an ingestion run for that compatibility surface as well.
  try {
    database.prepare("INSERT OR IGNORE INTO ingestion_runs (run_id, source_kind, started_at_ms, status) VALUES (?, 'usage_sweep', ?, 'running')").run(sweepId, startedAtMs);
  } catch (_) {
    database.prepare('INSERT OR IGNORE INTO ingestion_runs (run_id) VALUES (?)').run(sweepId);
  }
  return sweepId;
}

function finishSweepRun(database, sweepId, { status = 'completed', eventCount = 0, error = null, completedAtMs = migrationNow() } = {}) {
    clearCanonicalFactCache(database);
  database.prepare('UPDATE usage_sweep_runs SET completed_at_ms = ?, status = ?, event_count = ?, error_json = ? WHERE sweep_id = ?')
    .run(completedAtMs, status, eventCount, error ? JSON.stringify(error) : null, sweepId);
  return database.prepare('SELECT * FROM usage_sweep_runs WHERE sweep_id = ?').get(sweepId);
}

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
    CREATE TABLE IF NOT EXISTS runtime_history (\n      date_bucket TEXT PRIMARY KEY,\n      payload_json TEXT NOT NULL,\n      updated_at_ms INTEGER NOT NULL\n    );
    CREATE INDEX IF NOT EXISTS idx_runtime_history_date ON runtime_history(date_bucket);
  `);
  ensureFactSchema(database);
  const version = Number(database.prepare('PRAGMA user_version').get().user_version || 0);
  if (version < TOKEN_LEDGER_SCHEMA_VERSION) {
    backfillLegacyFacts(database);
    database.exec(`PRAGMA user_version = ${TOKEN_LEDGER_SCHEMA_VERSION}`);
  }
}

function backfillLegacyFacts(database) {
  const has = (table) => Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
  if (has('token_turns')) for (const row of database.prepare('SELECT * FROM token_turns').all()) {
    try { upsertUsageEvent(database, { naturalKey: `legacy:${row.provider}:${row.natural_key}`, clientId: row.provider, sourceKind: 'legacy-token-ledger', sourceId: 'token_turns', sessionId: row.session_id, requestId: row.request_id, occurredAtMs: row.timestamp_ms, dateBucket: row.date_bucket, modelId: row.model_codename, inputTokens: row.uncached_input, cachedInputTokens: row.cached_input, cacheWriteTokens: row.cache_write, outputTokens: row.output_tokens, reasoningTokens: row.reasoning_tokens, totalTokens: row.processed_tokens, costUsd: row.cost_usd, payloadHash: payloadHash(row) }); } catch (_) {}
  }
  if (has('historical_threads')) for (const row of database.prepare('SELECT * FROM historical_threads').all()) {
    try { upsertUsageEvent(database, { naturalKey: `legacy-thread:${row.provider}:${row.thread_id}`, clientId: row.provider, sourceKind: 'legacy-token-ledger', sourceId: 'historical_threads', sessionId: row.thread_id, occurredAtMs: row.created_at_ms, dateBucket: row.date_bucket, modelId: row.model_codename || 'unknown', totalTokens: row.total_tokens, payloadHash: payloadHash(row) }); } catch (_) {}
  }
  if (has('runtime_history')) for (const row of database.prepare('SELECT * FROM runtime_history').all()) {
    let payload; try { payload = JSON.parse(row.payload_json); } catch (_) { continue; }
    for (const [client, value] of Object.entries(payload.perClient || {})) {
      const models = Object.entries(payload.clientModels?.[client] || {});
      if (!models.length) models.push([Object.keys(payload.perModel || {})[0] || 'unknown', value?.tokens || payload.tokens || 0]);
      for (const [model, tokens] of models) try { upsertUsageEvent(database, { naturalKey: `runtime-history:${row.date_bucket}:${client}:${model}`, clientId: client, sourceKind: 'runtime-history', sourceId: 'runtime_history', occurredAtMs: row.updated_at_ms, dateBucket: row.date_bucket, modelId: model, totalTokens: tokens, costUsd: value?.cost, payloadHash: payloadHash({ row, client, model, tokens }) }); } catch (_) {}
    }
  }
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


const factRowsCache = new WeakMap();

function clearCanonicalFactCache(database) {
  if (database && typeof database === 'object') {
    factRowsCache.delete(database);
  }
}

function cloneFactDayRows(rows) {
  if (!Array.isArray(rows)) return [];
  const cloned = [];
  for (const r of rows) {
    const pc = {};
    if (r.perClient) {
      for (const [k, v] of Object.entries(r.perClient)) {
        pc[k] = { ...v };
      }
    }
    const pm = {};
    if (r.perModel) {
      for (const [k, v] of Object.entries(r.perModel)) {
        pm[k] = { ...v };
      }
    }
    const cm = {};
    if (r.clientModels) {
      for (const [k, v] of Object.entries(r.clientModels)) {
        cm[k] = { ...v };
      }
    }
    cloned.push({
      ...r,
      perClient: pc,
      perModel: pm,
      clientModels: cm
    });
  }
  return cloned;
}

const ANTIGRAVITY_PAST_DAY_SOURCES = Object.freeze([
  'antigravity-disk',
  'daily-history-archive',
  'token-ledger',
  'legacy-token-ledger'
]);

function canonicalFactDayRows(database, options = {}) {
  if (!database) return [];
  const hasEvents = getStatement(database, 'hasUsageEvents', "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usage_events'").get();
  if (!hasEvents) return [];

  const today = String(options.today || options.todayKey || localDayKey()).slice(0, 10);

  let sweepId = null;
  try {
    const sweepRow = database.prepare("SELECT sweep_id FROM usage_sweep_runs WHERE status = 'completed' ORDER BY sweep_id DESC LIMIT 1").get();
    if (sweepRow) sweepId = Number(sweepRow.sweep_id);
  } catch (_) {}

  if (sweepId !== null && options.bypassCache !== true) {
    const cached = factRowsCache.get(database);
    if (cached && cached.sweepId === sweepId && cached.today === today) {
      return cloneFactDayRows(cached.dayRows);
    }
  }
  const stmt = getStatement(database, 'canonicalFactRows', `
    SELECT
      date_bucket,
      client_id,
      source_kind,
      model_id,
      SUM(input_tokens) AS input_tokens,
      SUM(cached_input_tokens) AS cached_input_tokens,
      SUM(cache_write_tokens) AS cache_write_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(reasoning_tokens) AS reasoning_tokens,
      SUM(total_tokens) AS total_tokens,
      SUM(COALESCE(cost_usd, 0.0)) AS cost_usd,
      SUM(CASE WHEN cost_usd IS NULL OR cost_usd = 0.0 THEN total_tokens ELSE 0 END) AS unpriced_tokens,
      COUNT(*) AS messages
    FROM usage_events
    WHERE state = 'active'
    GROUP BY date_bucket, client_id, source_kind, model_id
    ORDER BY date_bucket, client_id, source_kind, model_id
  `);
  const rows = stmt.all();
  if (rows.length === 0) return [];

  const hierarchy = new Map();
  for (const r of rows) {
    const client = normalizeClientName(r.client_id) || r.client_id;
    if (!client || isAccountingExcludedClient(client)) continue;
    let dayMap = hierarchy.get(r.date_bucket);
    if (!dayMap) {
      dayMap = new Map();
      hierarchy.set(r.date_bucket, dayMap);
    }
    let clientMap = dayMap.get(client);
    if (!clientMap) {
      clientMap = new Map();
      dayMap.set(client, clientMap);
    }
    let sourceRows = clientMap.get(r.source_kind);
    if (!sourceRows) {
      sourceRows = [];
      clientMap.set(r.source_kind, sourceRows);
    }
    sourceRows.push(r);
  }

  const dayRows = [];
  for (const [date, clientMap] of hierarchy.entries()) {
    const dayRow = {
      date,
      date_bucket: date,
      perClient: {},
      perModel: {},
      clientModels: {},
      tokens: 0,
      cost: 0,
      messages: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      unclassifiedTokens: 0
    };

    for (const [client, sourceMap] of clientMap.entries()) {
      let chosenSourceKind;
      if (client === 'antigravity') {
        if (date === today) {
          const diskTok = (sourceMap.get('antigravity-disk') || []).reduce((sum, x) => sum + Number(x.total_tokens || 0), 0);
          const archiveTok = (sourceMap.get('daily-history-archive') || []).reduce((sum, x) => sum + Number(x.total_tokens || 0), 0);
          if (sourceMap.has('antigravity-disk') || sourceMap.has('daily-history-archive')) {
            chosenSourceKind = diskTok >= archiveTok ? 'antigravity-disk' : 'daily-history-archive';
          }
        } else {
          for (const preferred of ANTIGRAVITY_PAST_DAY_SOURCES) {
            if (sourceMap.has(preferred)) {
              chosenSourceKind = preferred;
              break;
            }
          }
        }
      } else {
        let maxTok = -1;
        for (const [sk, sRows] of sourceMap.entries()) {
          const tot = sRows.reduce((sum, x) => sum + Number(x.total_tokens || 0), 0);
          if (tot > maxTok) { maxTok = tot; chosenSourceKind = sk; }
        }
      }

      if (!chosenSourceKind) continue;

      const selectedRows = sourceMap.get(chosenSourceKind) || [];
      for (const r of selectedRows) {
        const clientVal = dayRow.perClient[client] ||= {
          tokens: 0, cost: 0, messages: 0,
          cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, unclassifiedTokens: 0
        };
        const tok = Number(r.total_tokens || 0);
        const cost = Number(r.cost_usd || 0);
        const msgs = Number(r.messages || 0);
        let cr = Number(r.cached_input_tokens || 0);
        let cw = Number(r.cache_write_tokens || 0);
        let out = Number(r.output_tokens || 0);

        const unc = Math.max(0, tok - (cr + cw + out));
        const unp = Number(r.unpriced_tokens || 0);

        clientVal.tokens += tok;
        clientVal.cost += cost;
        clientVal.messages += msgs;
        clientVal.cacheReadTokens += cr;
        clientVal.cacheWriteTokens += cw;
        clientVal.outputTokens += out;
        clientVal.unclassifiedTokens += unc;
        if (unp > 0) clientVal.unpricedTokens = (clientVal.unpricedTokens || 0) + unp;

        const model = canonicalModelKey(r.model_id) || 'unknown';
        const modelVal = dayRow.perModel[model] ||= {
          tokens: 0, cost: 0, messages: 0,
          cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, unclassifiedTokens: 0, unpricedTokens: 0
        };
        modelVal.tokens += tok;
        modelVal.cost += cost;
        modelVal.messages += msgs;
        modelVal.cacheReadTokens += cr;
        modelVal.cacheWriteTokens += cw;
        modelVal.outputTokens += out;
        modelVal.unclassifiedTokens += unc;
        if (unp > 0) modelVal.unpricedTokens = (modelVal.unpricedTokens || 0) + unp;

        dayRow.clientModels[client] ||= {};
        dayRow.clientModels[client][model] = (dayRow.clientModels[client][model] || 0) + tok;

        dayRow.tokens += tok;
        dayRow.cost += cost;
        dayRow.messages += msgs;
        dayRow.cacheReadTokens += cr;
        dayRow.cacheWriteTokens += cw;
        dayRow.outputTokens += out;
        dayRow.unclassifiedTokens += unc;
        if (unp > 0) dayRow.unpricedTokens = (dayRow.unpricedTokens || 0) + unp;
      }
    }

    if (dayRow.unpricedTokens > 0) dayRow.unpricedTokens = Math.round(dayRow.unpricedTokens);
    else delete dayRow.unpricedTokens;
    for (const val of Object.values(dayRow.perClient)) {
      if (val.unpricedTokens > 0) val.unpricedTokens = Math.round(val.unpricedTokens);
      else delete val.unpricedTokens;
    }
    for (const val of Object.values(dayRow.perModel)) {
      if (val.unpricedTokens > 0) val.unpricedTokens = Math.round(val.unpricedTokens);
      else delete val.unpricedTokens;
    }

    dayRows.push(dayRow);
  }

  if (sweepId !== null) {
    factRowsCache.set(database, {
      sweepId,
      today,
      dayRows
    });
  }

  return cloneFactDayRows(dayRows);
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
    if (day.unpricedTokens > 0) day.unpricedTokens = Math.round(day.unpricedTokens);
    else delete day.unpricedTokens;
    for (const value of Object.values(day.perClient)) {
      value.tokens = Math.round(value.tokens);
      value.cost = Number(value.cost.toFixed(6));
      value.cacheReadTokens = Math.round(value.cacheReadTokens);
      value.cacheWriteTokens = Math.round(value.cacheWriteTokens);
      value.outputTokens = Math.round(value.outputTokens);
      value.unclassifiedTokens = Math.round(value.unclassifiedTokens);
      if (value.unpricedTokens > 0) value.unpricedTokens = Math.round(value.unpricedTokens);
      else delete value.unpricedTokens;
    }
    for (const value of Object.values(day.perModel)) {
      value.tokens = Math.round(value.tokens);
      value.cost = Number(value.cost.toFixed(6));
      value.cacheReadTokens = Math.round(value.cacheReadTokens);
      value.cacheWriteTokens = Math.round(value.cacheWriteTokens);
      value.outputTokens = Math.round(value.outputTokens);
      value.unclassifiedTokens = Math.round(value.unclassifiedTokens);
      if (value.unpricedTokens > 0) value.unpricedTokens = Math.round(value.unpricedTokens);
      else delete value.unpricedTokens;
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


function checkFactCoverage(databaseOrStore, options = {}) {
  if (options && options.sqlCoverageComplete !== undefined) {
    return {
      complete: Boolean(options.sqlCoverageComplete),
      reason: options.sqlCoverageComplete ? null : (options.diagnosticReason || 'forced-incomplete')
    };
  }
  const db = typeof databaseOrStore?.database === 'function'
    ? databaseOrStore.database()
    : (databaseOrStore?.db || databaseOrStore || null);
  if (!db || typeof db.prepare !== 'function') {
    return { complete: false, reason: 'database-unavailable' };
  }
  try {
    const hasSweepTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usage_sweep_runs'").get();
    if (!hasSweepTable) {
      return { complete: false, reason: 'sweep-table-missing' };
    }
    const completed = db.prepare("SELECT 1 FROM usage_sweep_runs WHERE status = 'completed' LIMIT 1").get();
    if (!completed) {
      return { complete: false, reason: 'no-completed-sweep' };
    }
    const latest = db.prepare("SELECT status FROM usage_sweep_runs ORDER BY sweep_id DESC LIMIT 1").get();
    if (latest && latest.status === 'failed') {
      return { complete: false, reason: 'latest-sweep-failed' };
    }
    const hasWatermarks = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'source_watermarks'").get();
    if (hasWatermarks) {
      const dirty = db.prepare("SELECT 1 FROM source_watermarks WHERE dirty = 1 LIMIT 1").get();
      if (dirty) {
        return { complete: false, reason: 'watermark-dirty' };
      }
    }
    return { complete: true, reason: null };
  } catch (err) {
    return { complete: false, reason: `check-failed:${err.message}` };
  }
}

function isFactCoverageComplete(databaseOrStore, options = {}) {
  return checkFactCoverage(databaseOrStore, options).complete;
}

function queryDistinctSessionMap(db, startDate, endDate) {
  if (!db || typeof db.prepare !== 'function') return {};
  const hasEvents = getStatement(db, 'hasUsageEvents', "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usage_events'").get();
  if (!hasEvents) return {};

  const map = {};
  let sql = `
    SELECT ue.client_id, COUNT(DISTINCT ue.session_id) as cnt
    FROM usage_events ue
    WHERE ue.state = 'active'
      AND ue.session_id IS NOT NULL
      AND ue.session_id != ''
      AND ue.session_id NOT LIKE 'disk-%'
      AND ue.total_tokens > 0
      AND LOWER(ue.client_id) != 'dsh'
      AND (
        (ue.client_id = 'antigravity' AND ue.source_kind = 'antigravity-disk') OR
        (ue.client_id = 'codex' AND ue.source_kind = 'codex-sessions') OR
        (ue.client_id = 'claude' AND ue.source_kind = 'claude-projects') OR
        (ue.client_id = 'opencode' AND ue.source_kind = 'opencode-db') OR
        (ue.client_id = 'workbuddy' AND ue.source_kind = 'workbuddy-projects') OR
        (ue.client_id = 'zcode' AND ue.source_kind = 'zcode-db') OR
        (ue.source_kind NOT IN ('legacy-token-ledger', 'daily-history-archive', 'runtime-history', 'token-ledger'))
      )
  `;
  const params = [];
  if (startDate && endDate) {
    sql += ' AND ue.date_bucket BETWEEN ? AND ?';
    params.push(startDate, endDate);
  } else if (startDate) {
    sql += ' AND ue.date_bucket >= ?';
    params.push(startDate);
  } else if (endDate) {
    sql += ' AND ue.date_bucket <= ?';
    params.push(endDate);
  }
  sql += ' GROUP BY ue.client_id';
  const rows = db.prepare(sql).all(...params);
  for (const r of rows) {
    const client = normalizeClientName(r.client_id) || r.client_id;
    if (isAccountingExcludedClient(client)) continue;
    map[client] = (map[client] || 0) + Number(r.cnt || 0);
  }
  return map;
}

function computeSessionsByWindow(database, options = {}) {
  const db = database?.database ? database.database() : database;
  if (!db || typeof db.prepare !== 'function') return undefined;
  const hasEvents = getStatement(db, 'hasUsageEvents', "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usage_events'").get();
  if (!hasEvents) return undefined;

  const now = options.now ? new Date(options.now) : new Date();
  const today = options.today || localDayKey(now);
  const windows = ['1', '7', '30', '90'];
  const res = {};
  for (const w of windows) {
    const days = Number(w);
    const [y, m, d] = today.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - (days - 1));
    const start = localDayKey(dt);
    const windowObj = queryDistinctSessionMap(db, start, today);
    const total = Object.values(windowObj).reduce((a, b) => a + b, 0);
    windowObj.total = total;
    res[w] = windowObj;
  }
  return res;
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
    const days = new Map();
    const useFacts = options.useFacts !== false && isFactCoverageComplete(db, options);
    let loadedFromFacts = false;

    if (useFacts) {
      const factDays = canonicalFactDayRows(db, options);
      if (factDays.length > 0) {
        for (const row of factDays) addDayRow(days, row);
        loadedFromFacts = true;
      }
    }

    if (!loadedFromFacts) {
      const runtime = parseRuntimeRows(db);
      const coveredDates = new Set(runtime.map((row) => String(row.date || '').slice(0, 10)));
      for (const row of baseRows(db, coveredDates)) addDayRow(days, row);
      for (const row of runtime) addDayRow(days, row);
    }

    let overlay = Array.isArray(options.overlayHistory?.daily) ? options.overlayHistory.daily : null;
    if (overlay === null) {
      const collectorOverlay = readCollectorHistoryOverlay(options);
      overlay = Array.isArray(collectorOverlay?.daily) ? collectorOverlay.daily : [];
    }

    const today = String(options.today || options.todayKey || localDayKey()).slice(0, 10);

    for (const row of overlay) {
      const date = String(row?.date || '').slice(0, 10);
      if (!date) continue;
      if (loadedFromFacts) {
        if (date >= today) {
          if (!days.has(date)) {
            addDayRow(days, row);
          } else {
            mergeOverlayDay(days, row);
          }
        }
      } else {
        const isSingleDayOverlay = overlay.length === 1;
        if (isSingleDayOverlay || date >= today) {
          days.delete(date);
          addDayRow(days, row);
        } else if (!days.has(date)) {
          addDayRow(days, row);
        } else {
          mergeOverlayDay(days, row);
        }
      }
    }
    return historyFromDays(days);
  }

  function readPeriods(readOptions = {}) {
    const options = { ...storeOptions, ...readOptions };
    const history = readHistory(options);
    if (!history) return null;
    const today = String(options.today || options.todayKey || localDayKey()).slice(0, 10);
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
    try {
      const db = open();
      if (db) {
        const monthStart = `${month}-01`;
        const sessionScopes = {
          today: queryDistinctSessionMap(db, today, today),
          month: queryDistinctSessionMap(db, monthStart, today),
          allTime: queryDistinctSessionMap(db, options.windowStart || null, options.windowEnd || null)
        };

        for (const name of periodNames) {
          const clientMap = sessionScopes[name] || {};
          if (Object.keys(clientMap).length > 0) {
            periods[name].clientSessions = clientMap;
            periods[name].distinctSessions = Object.values(clientMap).reduce((a, b) => a + b, 0);
          }
        }
      }
    } catch (_) {}

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

  function status() {
    const db = open();
    return { available: Boolean(db), path: databasePath, schemaVersion: db ? Number(db.prepare('PRAGMA user_version').get().user_version || 0) : 0 };
  }

  function withSweepTransaction(work, options = {}) {
    const db = open();
    if (!db) throw new Error('token ledger unavailable');
    db.exec('BEGIN IMMEDIATE');
    let sweepId;
    try {
      sweepId = beginSweepRun(db, options);
      const result = work({ db, sweepId });
      finishSweepRun(db, sweepId, { eventCount: result?.eventCount || 0 });
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { if (sweepId) finishSweepRun(db, sweepId, { status: 'failed', error }); } catch (_) {}
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw error;
    }
  }

  return {
    available: () => available || Boolean(open()),
    databasePath,
    readHistory,
    readPeriods,
    canonicalFactDayRows: (opts) => canonicalFactDayRows(open(), opts),
    sessionsByWindow: (opts) => computeSessionsByWindow(open(), opts),
    writeHistory,
    status,
    database: () => open(),
    upsertUsageEvent: (event, options) => upsertUsageEvent(open(), event, options),
    upsertFact: (event, options) => upsertUsageEvent(open(), event, options),
    readSourceWatermark: (sourceKind, sourceId) => readSourceWatermark(open(), sourceKind, sourceId),
    getWatermark: (sourceKind, sourceId) => readSourceWatermark(open(), sourceKind, sourceId),
    writeSourceWatermark: (watermark) => writeSourceWatermark(open(), watermark),
    setWatermark: (watermark) => writeSourceWatermark(open(), watermark),
    recordSourceEquivalence: (equivalence) => recordSourceEquivalence(open(), equivalence),
    beginSweepRun: (options) => beginSweepRun(open(), options),
    finishSweepRun: (sweepId, options) => finishSweepRun(open(), sweepId, options),
    withSweepTransaction,
    atomicSweepRun: withSweepTransaction,
    close
  };
}


function ninetyDayWindow(today = localDayKey()) {
  const todayKey = String(today || localDayKey()).slice(0, 10);
  const [y, m, d] = todayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 89);
  return { start: localDayKey(date), end: todayKey };
}

module.exports = {
  ANTIGRAVITY_PAST_DAY_SOURCES,
  checkFactCoverage,
  checkSqlCoverage: checkFactCoverage,
  isFactCoverageComplete,
  clearCanonicalFactCache,
  addDayRow,
  baseRows,
  canonicalFactDayRows,
  createTokenLedgerStore,
  emptyDay,
  packagedSeedPath,
  periodFromDays,
  resolveTokenLedgerPath
  ,ensureFactSchema, upsertUsageEvent, readSourceWatermark, writeSourceWatermark,
  recordSourceEquivalence, beginSweepRun, finishSweepRun,
  ninetyDayWindow,
  window90Days: ninetyDayWindow,
  computeSessionsByWindow,
  backfillUsageEventCosts
};
