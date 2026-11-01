'use strict';

const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { loadDotEnv, sharedDataDir } = require('../src/shared/config');
const { createSessionUsageArchiveStore, sessionUsageArchiveDatabasePath } = require('../src/shared/usage/sessionUsageArchiveStore');
const { dailyHistoryArchivePath, readDailyHistoryArchive, writeDailyHistoryArchive } = require('../src/shared/dailyHistoryArchive');

loadDotEnv();

const os = require('node:os');
const path = require('node:path');

function resolveCandidateSources() {
  const candidates = new Set();
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  candidates.add(path.join(appData, 'Token Monitor', 'token_ledger.sqlite'));
  const userProfile = process.env.USERPROFILE || os.homedir();
  const usersDir = path.dirname(userProfile);
  if (fs.existsSync(usersDir)) {
    try {
      for (const entry of fs.readdirSync(usersDir)) {
        const candidate = path.join(usersDir, entry, 'AppData', 'Roaming', 'Token Monitor', 'token_ledger.sqlite');
        if (fs.existsSync(candidate)) candidates.add(candidate);
      }
    } catch (_) {}
  }
  return [...candidates];
}

function normalizeProviderName(provider) {
  const p = String(provider || '').trim().toLowerCase();
  if (p === 'antigravity-cli') return 'antigravity';
  return p;
}

function runBackfill() {
  const targetDbPath = sessionUsageArchiveDatabasePath();
  console.log(`[backfill] Target SQLite database: ${targetDbPath}`);
  console.log(`[backfill] Target sharedDataDir: ${sharedDataDir()}`);

  const store = createSessionUsageArchiveStore();

  for (const sourcePath of resolveCandidateSources()) {
    if (!fs.existsSync(sourcePath)) {
      console.log(`[backfill] Source not found, skipping: ${sourcePath}`);
      continue;
    }

    console.log(`\n[backfill] Reading source: ${sourcePath}`);
    let sourceDb;
    try {
      sourceDb = new DatabaseSync(sourcePath, { readOnly: true });
    } catch (err) {
      console.warn(`[backfill] Failed to open ${sourcePath}: ${err.message}`);
      continue;
    }

    // 1. Query turn-level model aggregations per session from token_turns
    let turnSessions = [];
    try {
      turnSessions = sourceDb.prepare(`
        SELECT 
          provider,
          session_id,
          model_codename,
          min(timestamp_ms) as min_ts,
          max(timestamp_ms) as max_ts,
          count(*) as turn_count,
          sum(processed_tokens) as model_tokens,
          sum(cost_usd) as model_cost,
          sum(uncached_input + cached_input) as model_input,
          sum(output_tokens) as model_output,
          sum(cached_input) as model_cache_read,
          sum(cache_write) as model_cache_write
        FROM token_turns
        WHERE session_id IS NOT NULL AND session_id != ''
        GROUP BY provider, session_id, model_codename
      `).all();
    } catch (err) {
      console.warn(`[backfill] Could not query token_turns: ${err.message}`);
    }

    console.log(`[backfill] Extracted ${turnSessions.length} session-model turn slices from ${sourcePath}`);

    // Group into whole sessions with multi-model breakdown
    const sessionMap = new Map();
    for (const slice of turnSessions) {
      const client = normalizeProviderName(slice.provider);
      const sessionId = slice.session_id;
      const key = `${client}:${sessionId}`;

      let session = sessionMap.get(key);
      if (!session) {
        session = {
          client,
          sessionId,
          firstActivityMs: slice.min_ts,
          lastActivityMs: slice.max_ts,
          totalTokens: 0,
          costUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          messageCount: 0,
          models: {},
          modelCosts: {},
          modelTokenComponents: {}
        };
        sessionMap.set(key, session);
      }

      if (slice.min_ts && (!session.firstActivityMs || slice.min_ts < session.firstActivityMs)) {
        session.firstActivityMs = slice.min_ts;
      }
      if (slice.max_ts && (!session.lastActivityMs || slice.max_ts > session.lastActivityMs)) {
        session.lastActivityMs = slice.max_ts;
      }

      const model = slice.model_codename || 'unknown';
      const mTokens = slice.model_tokens || 0;
      const mCost = slice.model_cost || 0;
      const mInput = slice.model_input || 0;
      const mOutput = slice.model_output || 0;
      const mCacheRead = slice.model_cache_read || 0;
      const mCacheWrite = slice.model_cache_write || 0;

      session.totalTokens += mTokens;
      session.costUsd += mCost;
      session.inputTokens += mInput;
      session.outputTokens += mOutput;
      session.cacheReadTokens += mCacheRead;
      session.cacheWriteTokens += mCacheWrite;
      session.messageCount += slice.turn_count || 1;

      session.models[model] = (session.models[model] || 0) + mTokens;
      session.modelCosts[model] = (session.modelCosts[model] || 0) + mCost;
      session.modelTokenComponents[model] = {
        inputTokens: (session.modelTokenComponents[model]?.inputTokens || 0) + mInput,
        outputTokens: (session.modelTokenComponents[model]?.outputTokens || 0) + mOutput,
        cacheReadTokens: (session.modelTokenComponents[model]?.cacheReadTokens || 0) + mCacheRead,
        cacheWriteTokens: (session.modelTokenComponents[model]?.cacheWriteTokens || 0) + mCacheWrite
      };
    }

    // Also include any sessions from session_summaries not already covered
    let summaryRows = [];
    try {
      summaryRows = sourceDb.prepare(`
        SELECT 
          provider, session_id, project_id, title, turn_count,
          total_processed, total_known_cost_usd, first_activity_ms, last_activity_ms
        FROM session_summaries
        WHERE session_id IS NOT NULL AND session_id != ''
      `).all();
    } catch (err) {
      console.warn(`[backfill] Could not query session_summaries: ${err.message}`);
    }

    for (const s of summaryRows) {
      const client = normalizeProviderName(s.provider);
      const sessionId = s.session_id;
      const key = `${client}:${sessionId}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          client,
          sessionId,
          firstActivityMs: s.first_activity_ms,
          lastActivityMs: s.last_activity_ms,
          totalTokens: s.total_processed || 0,
          costUsd: s.total_known_cost_usd || 0,
          inputTokens: s.total_processed || 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          messageCount: s.turn_count || 1,
          models: { 'unknown': s.total_processed || 0 },
          modelCosts: { 'unknown': s.total_known_cost_usd || 0 },
          modelTokenComponents: {}
        });
      }
    }

    // Convert into Token Monitor archive session entries
    const sessionEntries = [];
    for (const [key, s] of sessionMap) {
      const capturedDate = s.firstActivityMs ? new Date(s.firstActivityMs) : new Date();
      const day = capturedDate.toISOString().slice(0, 10);
      const month = day.slice(0, 7);

      const entry = {
        client: s.client,
        sessionId: s.sessionId,
        capturedAt: capturedDate.toISOString(),
        day,
        month,
        periodWindows: {
          allTime: { capturedAt: capturedDate.toISOString() }
        },
        periods: {
          allTime: {
            client: s.client,
            sessionId: s.sessionId,
            totalTokens: s.totalTokens,
            costUsd: s.costUsd,
            inputTokens: s.inputTokens,
            outputTokens: s.outputTokens,
            cacheReadTokens: s.cacheReadTokens,
            cacheWriteTokens: s.cacheWriteTokens,
            models: s.models,
            modelCosts: s.modelCosts,
            modelTokenComponents: s.modelTokenComponents,
            messageCount: s.messageCount
          }
        }
      };
      sessionEntries.push([key, entry]);
    }

    // Insert all session entries atomically into SQLite sessions table
    console.log(`[backfill] Inserting ${sessionEntries.length} sessions into sessions table...`);
    const insertedCount = store.batchUpsertSessions(sessionEntries);
    console.log(`[backfill] Successfully stored ${insertedCount} sessions in sessions table!`);

    // 2. Ingest daily_usage rows
    let dailyRows = [];
    try {
      dailyRows = sourceDb.prepare(`
        SELECT 
          date_bucket, provider, model_codename,
          total_uncached_in, total_cached_in, total_cache_write,
          total_output, total_reasoning, total_processed,
          total_known_cost_usd, turn_count
        FROM daily_usage
        ORDER BY date_bucket ASC
      `).all();
    } catch (err) {
      console.warn(`[backfill] Failed to query daily_usage from ${sourcePath}: ${err.message}`);
    }

    console.log(`[backfill] Found ${dailyRows.length} daily_usage rows in ${sourcePath}`);

    let sourceTokens = 0;
    let minDate = null;
    let maxDate = null;

    for (const row of dailyRows) {
      const date = row.date_bucket;
      const client = normalizeProviderName(row.provider);
      const model = row.model_codename || 'unknown';
      const input = (row.total_uncached_in || 0) + (row.total_cached_in || 0);
      const output = row.total_output || 0;
      const cacheRead = row.total_cached_in || 0;
      const cacheWrite = row.total_cache_write || 0;
      const total = row.total_processed || (input + output);
      const cost = row.total_known_cost_usd || 0.0;
      const turnCount = row.turn_count || 1;

      store.upsertDailyRollup(
        date, client, model,
        input, output, cacheRead, cacheWrite, total, cost, turnCount
      );

      sourceTokens += total;
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    }

    store.recordBackfillAudit(sourcePath, dailyRows.length, sessionEntries.length, sourceTokens, minDate, maxDate);
    try { sourceDb.close(); } catch (_) {}
  }

  // 3. Update daily-history-archive.json on D: drive
  const rollups = store.getDailyRollups();
  console.log(`\n[backfill] Total distinct daily_rollups in SQLite: ${rollups.length}`);

  const archiveFile = dailyHistoryArchivePath();
  console.log(`[backfill] Updating daily-history-archive at: ${archiveFile}`);

  let currentArchive;
  try {
    currentArchive = readDailyHistoryArchive();
  } catch (_) {
    currentArchive = { version: 1, days: {} };
  }
  if (!currentArchive || typeof currentArchive !== 'object') currentArchive = { version: 1, days: {} };
  if (!currentArchive.days) currentArchive.days = {};

  for (const r of rollups) {
    const date = r.date;
    if (!currentArchive.days[date]) {
      currentArchive.days[date] = {
        date,
        activeTimeMs: 0,
        observations: {}
      };
    }
    const day = currentArchive.days[date];
    const obsKey = `${r.client}:${r.model}`;
    const existingObs = day.observations[obsKey];
    const existingTokens = existingObs?.tokens || 0;

    if (r.total_tokens > existingTokens) {
      day.observations[obsKey] = {
        client: r.client,
        modelId: r.model,
        tokens: r.total_tokens,
        cost: r.cost || 0,
        messages: r.turn_count || 1,
        outputTokens: r.output_tokens || 0,
        cacheReadTokens: r.cache_read_tokens || 0,
        cacheWriteTokens: r.cache_write_tokens || 0
      };
    }
  }

  writeDailyHistoryArchive(currentArchive);
  console.log(`[backfill] Successfully updated daily-history-archive.json!`);

  // Verify counts directly from SQLite
  const db = new DatabaseSync(targetDbPath, { readOnly: true });
  const sessionCount = db.prepare('SELECT count(*) as count FROM sessions').get()?.count || 0;
  const rollupCount = db.prepare('SELECT count(*) as count, sum(total_tokens) as total_tokens, sum(cost) as total_cost FROM daily_rollups').get();
  const minMax = db.prepare('SELECT min(date) as min_date, max(date) as max_date FROM daily_rollups').get();
  db.close();

  console.log(`\n================ BACKFILL VERIFICATION ================`);
  console.log(`Target Database:  ${targetDbPath}`);
  console.log(`Sessions Stored:  ${sessionCount.toLocaleString()} sessions in sessions table`);
  console.log(`Daily Rollups:    ${rollupCount.count} rollup rows`);
  console.log(`Date Range:       ${minMax.min_date} to ${minMax.max_date}`);
  console.log(`Total Tokens:     ${(rollupCount.total_tokens || 0).toLocaleString()} (~${((rollupCount.total_tokens || 0) / 1e9).toFixed(2)}B tokens)`);
  console.log(`Total Cost:       $${(rollupCount.total_cost || 0).toFixed(2)}`);
  console.log(`=======================================================\n`);

  store.close();
}

runBackfill();
