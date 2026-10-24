'use strict';

const {
  ensureFactSchema,
  upsertUsageEvent,
  readSourceWatermark,
  writeSourceWatermark,
  recordSourceEquivalence,
  beginSweepRun,
  finishSweepRun,
  backfillUsageEventCosts
} = require('./tokenLedger');
const {
  createAppendFileAdapter,
  createSnapshotAdapter,
  createSqliteAdapter,
  createAntigravityAdapter,
  createClaudeAdapter,
  createOpenCodeAdapter,
  createCodexAdapter,
  createWorkBuddyAdapter,
  createZCodeAdapter,
  sourceIdForRoot,
  normalizeSourceId
} = require('./sourceAdapters');

function rawDatabase(value) {
  if (value && typeof value.prepare === 'function') return value;
  if (value && typeof value.database === 'function') return value.database();
  if (value && value.db && typeof value.db.prepare === 'function') return value.db;
  throw new TypeError('sweepUsage requires a token ledger store or DatabaseSync');
}

function adaptersForRoots(roots = [], options = {}) {
  const flattened = Array.isArray(roots)
    ? roots
    : (typeof roots === 'object' && roots !== null
        ? Object.entries(roots).flatMap(([client, dirs]) =>
            Array.isArray(dirs)
              ? dirs.map((d) => ({ path: d, kind: client, clientId: client }))
              : [{ path: dirs, kind: client, clientId: client }]
          )
        : []);
  return flattened.map((root) => {
    if (root && typeof root.read === 'function') return root;
    const rootPath = typeof root === 'string' ? root : (root?.path || root?.filePath || root?.dir || root);
    const rootObj = typeof root === 'object' && root !== null ? root : {};
    let kind = rootObj.sourceKind || rootObj.kind || options.sourceKind;
    if (!kind && typeof rootPath === 'string') {
      const lower = rootPath.toLowerCase();
      if (lower.endsWith('.db') || lower.endsWith('.sqlite')) {
        kind = 'sqlite';
      } else if (lower.endsWith('.jsonl') || lower.endsWith('.log') || lower.endsWith('.ndjson')) {
        kind = 'append-file';
      } else if (lower.endsWith('.json')) {
        kind = 'snapshot';
      } else {
        const segments = lower.split(/[\\/]/);
        if (segments.some((s) => s === '.claude' || s === 'claude' || s === 'claude-projects')) kind = 'claude';
        else if (segments.some((s) => s === '.codex' || s === 'codex' || s === 'codex-sessions')) kind = 'codex';
        else if (segments.some((s) => s === '.opencode' || s === 'opencode')) kind = 'opencode';
        else if (segments.some((s) => s === '.workbuddy' || s === 'workbuddy' || s === '.workbuddy-ai')) kind = 'workbuddy';
        else if (segments.some((s) => s === '.zcode' || s === 'zcode')) kind = 'zcode';
        else if (segments.some((s) => s === '.antigravity' || s === 'antigravity')) kind = 'antigravity';
        else kind = 'append-file';
      }
    }
    kind ||= 'append-file';
    const common = {
      ...rootObj,
      path: rootPath,
      filePath: rootPath,
      dirPath: rootPath,
      sourceId: rootObj.sourceId || sourceIdForRoot(root, kind)
    };
    if (kind === 'sqlite') return createSqliteAdapter(common);
    if (kind === 'snapshot' || kind === 'snapshot-file') return createSnapshotAdapter(common);
    if (kind === 'antigravity' || kind === 'antigravity-disk') return createAntigravityAdapter(common);
    if (kind === 'claude' || kind === 'claude-projects') return createClaudeAdapter(common);
    if (kind === 'opencode' || kind === 'opencode-db') return createOpenCodeAdapter(common);
    if (kind === 'codex' || kind === 'codex-sessions') return createCodexAdapter(common);
    if (kind === 'workbuddy' || kind === 'workbuddy-projects') return createWorkBuddyAdapter(common);
    if (kind === 'zcode' || kind === 'zcode-db') return createZCodeAdapter(common);
    return createAppendFileAdapter(common);
  });
}

function createSourceAdapters(options = {}) {
  return adaptersForRoots(options.roots || [], options);
}

function rollupUsageEvents(database) {
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
  database.exec(`
    INSERT INTO daily_usage (
      date_bucket, provider, model_codename, turn_count,
      total_uncached_in, total_cached_in, total_cache_write,
      total_output, total_reasoning, total_processed, total_known_cost_usd,
      unknown_pricing_turn_count, cache_savings_pct
    )
    SELECT
      date_bucket,
      client_id AS provider,
      model_id AS model_codename,
      COUNT(*) AS turn_count,
      COALESCE(SUM(input_tokens), 0) AS total_uncached_in,
      COALESCE(SUM(cached_input_tokens), 0) AS total_cached_in,
      COALESCE(SUM(cache_write_tokens), 0) AS total_cache_write,
      COALESCE(SUM(output_tokens), 0) AS total_output,
      COALESCE(SUM(reasoning_tokens), 0) AS total_reasoning,
      COALESCE(SUM(total_tokens), 0) AS total_processed,
      COALESCE(SUM(cost_usd), 0.0) AS total_known_cost_usd,
      SUM(CASE WHEN cost_usd IS NULL OR cost_usd = 0.0 THEN 1 ELSE 0 END) AS unknown_pricing_turn_count,
      0.0 AS cache_savings_pct
    FROM usage_events
    WHERE state = 'active' AND LOWER(client_id) <> 'dsh'
    GROUP BY date_bucket, client_id, model_id
    ON CONFLICT(date_bucket, provider, model_codename) DO UPDATE SET
      turn_count = excluded.turn_count,
      total_uncached_in = excluded.total_uncached_in,
      total_cached_in = excluded.total_cached_in,
      total_cache_write = excluded.total_cache_write,
      total_output = excluded.total_output,
      total_reasoning = excluded.total_reasoning,
      total_processed = excluded.total_processed,
      total_known_cost_usd = excluded.total_known_cost_usd,
      unknown_pricing_turn_count = excluded.unknown_pricing_turn_count,
      cache_savings_pct = excluded.cache_savings_pct;
  `);
}

function normalizePartitionKey(key, dateBucket) {
  if (key && typeof key === 'object') return key;
  return { dateBucket: dateBucket || '1970-01-01', naturalKey: String(key || '') };
}

function applyAdapterResult(database, adapter, result, watermark, sweepId, now) {
  const events = Array.isArray(result?.events) ? result.events : [];
  const sourceKind = String(adapter.sourceKind || 'local');
  const sourceId = normalizeSourceId(adapter.sourceId || 'default');
  const generation = Number(result?.generation || watermark?.generation || 1);
  const rewrite = Boolean(result?.rewrite || result?.coverage?.rewrite);

  if (rewrite) {
    database.prepare(`
      UPDATE usage_events
      SET state = 'superseded', last_seen_run_id = ?
      WHERE source_kind = ? AND source_id = ? AND state = 'active'
    `).run(sweepId, sourceKind, sourceId);
  }

  const prefix = `${sourceKind}:${sourceId}:`;
  const seenPartitions = new Set();
  if (events.length > 0) {
    for (const event of events) {
      const rawKey = String(event.naturalKey || event.natural_key || '');
      const naturalKey = rawKey.startsWith(prefix) ? rawKey : `${prefix}${rawKey}`;
      const enriched = {
        ...event,
        naturalKey,
        sourceKind,
        sourceId,
        firstSeenRunId: watermark?.lastSuccessRunId ? undefined : sweepId,
        lastSeenRunId: sweepId
      };
      upsertUsageEvent(database, enriched, { sweepId, now });
      const partition = normalizePartitionKey(event?.partitionKey || naturalKey, enriched.dateBucket);
      seenPartitions.add(`${partition.dateBucket}::${partition.naturalKey}`);
    }

    // If the adapter emitted granular session-level events, supersede legacy coarse daily rows
    if (sourceKind === 'antigravity-disk') {
      const hasGranularEvents = events.some((e) => e.sessionId && !String(e.sessionId).startsWith('disk-'));
      if (hasGranularEvents) {
        const dates = [...new Set(events.filter((e) => e.sessionId && !String(e.sessionId).startsWith('disk-')).map((e) => e.dateBucket))];
        const BATCH_SIZE = 100;
        for (let i = 0; i < dates.length; i += BATCH_SIZE) {
          const chunk = dates.slice(i, i + BATCH_SIZE);
          database.prepare(`
            UPDATE usage_events
            SET state = 'superseded', last_seen_run_id = ?
            WHERE source_kind = ? AND source_id = ? AND state = 'active'
              AND (session_id LIKE 'disk-%' OR natural_key LIKE '%:disk-%')
              AND date_bucket IN (${chunk.map(() => '?').join(',')})
          `).run(sweepId, sourceKind, sourceId, ...chunk);
        }
      }
    }
  }

  const cursor = result?.cursor || result?.nextCursor || null;
  const fp = result?.sourceFingerprint;
  const sourceMtimeMs = Number(fp?.mtimeMs ?? cursor?.sourceMtimeMs ?? cursor?.mtimeMs ?? watermark?.source_mtime_ms ?? null) || null;
  const sourceSize = Number(fp?.size ?? cursor?.sourceSize ?? cursor?.size ?? watermark?.source_size ?? null) || null;
  const prefixHash = (typeof fp?.prefixHash === 'string' ? fp.prefixHash : null)
    || (typeof cursor?.prefixHash === 'string' ? cursor.prefixHash : null)
    || watermark?.prefix_hash || null;

  const newWatermark = {
    sourceKind,
    sourceId,
    generation,
    cursor,
    sourceMtimeMs,
    sourceSize,
    prefixHash,
    watermark: result?.watermark || null,
    lastSuccessRunId: sweepId,
    lastSuccessAtMs: now,
    eventCount: events.length,
    bytesRead: result?.bytesRead || 0
  };
  writeSourceWatermark(database, newWatermark);

  for (const equiv of result?.equivalences || []) {
    recordSourceEquivalence(database, equiv);
  }

  return {
    sourceKind,
    sourceId,
    eventCount: events.length,
    watermark: newWatermark
  };
}

function runInTransaction(database, mode, now, fn) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const sweepId = beginSweepRun(database, { mode, startedAtMs: now });
    const result = fn(sweepId);
    finishSweepRun(database, sweepId, {
      status: 'completed',
      eventCount: result.eventCount,
      completedAtMs: now
    });
    database.exec('COMMIT');
    return { ...result, sweepId, status: 'completed' };
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch (_) {}
    // Preserve a diagnostic failed run after the write transaction rolls back;
    // facts and watermarks from the failed attempt remain untouched.
    try {
      database.exec('BEGIN IMMEDIATE');
      const failedId = beginSweepRun(database, { mode, startedAtMs: now });
      finishSweepRun(database, failedId, { status: 'failed', error, completedAtMs: now });
      database.exec('COMMIT');
    } catch (_) {
      try { database.exec('ROLLBACK'); } catch (__) {}
    }
    throw error;
  }
}

const NATIVE_SOURCES = [
  { client: 'opencode', sourceKind: 'opencode-db' },
  { client: 'claude', sourceKind: 'claude-projects' },
  { client: 'codex', sourceKind: 'codex-sessions' },
  { client: 'workbuddy', sourceKind: 'workbuddy-projects' },
  { client: 'zcode', sourceKind: 'zcode-db' }
];

function supersedeLegacyByNative(database, sweepId) {
  for (const { client, sourceKind } of NATIVE_SOURCES) {
    database.prepare(`UPDATE usage_events SET state = 'superseded', last_seen_run_id = ?
      WHERE client_id = ? AND source_kind <> ? AND state = 'active'
      AND date_bucket IN (
        SELECT DISTINCT date_bucket FROM usage_events WHERE client_id = ? AND source_kind = ? AND state = 'active'
      )`).run(sweepId, client, sourceKind, client, sourceKind);
  }
}

function sweepUsage({ db, store, roots = [], adapters, now = Date.now(), mode = 'full', sourceAdapters = null } = {}) {
  const database = rawDatabase(db || store);
  ensureFactSchema(database);
  const selected = adapters || sourceAdapters || adaptersForRoots(roots);
  if (!Array.isArray(selected)) throw new TypeError('sweepUsage adapters must be an array');

  const result = runInTransaction(database, mode, Number(now), (sweepId) => {
    let eventCount = 0;
    const sources = [];
    for (const adapter of selected) {
      const sourceKind = String(adapter.sourceKind || 'local');
      const sourceId = normalizeSourceId(adapter.sourceId || 'default');
      const watermark = readSourceWatermark(database, sourceKind, sourceId);
      const read = adapter.read || adapter;
      if (typeof read !== 'function') throw new TypeError(`adapter ${sourceKind}/${sourceId} has no read method`);
      const value = read({ watermark, now: Number(now), mode });
      if (value && typeof value.then === 'function') throw new TypeError('sweep adapters must be synchronous');
      if (!value || !Array.isArray(value.events)) throw new TypeError(`adapter ${sourceKind}/${sourceId} returned an invalid result`);
      const applied = applyAdapterResult(database, adapter, value, watermark, sweepId, Number(now));
      if (applied.eventCount > 0 && NATIVE_SOURCES.some((s) => s.sourceKind === sourceKind)) {
        supersedeLegacyByNative(database, sweepId);
      }
      eventCount += applied.eventCount;
      sources.push(applied);
    }
    if (eventCount > 0) {
      supersedeLegacyByNative(database, sweepId);
      backfillUsageEventCosts(database);
      rollupUsageEvents(database);
    } else {
      const hasDaily = Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'daily_usage'").get());
      if (!hasDaily) {
        rollupUsageEvents(database);
      }
    }
    return { eventCount, sources };
  });
  return result;
}

module.exports = {
  adaptersForRoots,
  createSourceAdapters,
  sweepUsage,
  applyAdapterResult,
  runInTransaction,
  supersedeLegacyByNative,
  rollupUsageEvents,
  rebuildUsageRollups: rollupUsageEvents
};
