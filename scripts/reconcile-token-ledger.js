'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { PricingEngine } = require('../src/shared/pricing/engine');
const { calculateTurnCost, calculateCacheSavings } = require('../src/shared/pricing/formula');

const LEDGER_PATH = path.resolve(__dirname, '..', 'data', 'token_ledger.sqlite');
const BACKUP_PATH = path.resolve(__dirname, '..', 'data', 'token_ledger.sqlite.bak');
const USER_LEDGER_PATH = path.join(
  process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : path.join(process.env.HOME, '.config')),
  'Token Monitor',
  'token_ledger.sqlite'
);

console.log('--- RECONCILING TOKEN LEDGER (STANDALONE NATIVE ENGINE) ---');
console.log('Target ledger:', LEDGER_PATH);

// 1. Backup original database if backup doesn't exist
if (!fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(LEDGER_PATH, BACKUP_PATH);
  console.log('Created backup at:', BACKUP_PATH);
}

// 2. Initialize the standalone pricing engine; the packaged app reads only its local ledger.
const pricingEngine = new PricingEngine();

// 3. Open DB and start reconciliation
const db = new DatabaseSync(LEDGER_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

db.exec('BEGIN TRANSACTION;');

try {
  // Step A: Content-aware deduplication of Codex turns (protecting multi-turn conversations)
  console.log('Step A: Content-aware deduplication of Codex turns...');
  
  db.exec(`
    CREATE TEMP TABLE codex_dups AS
    SELECT turn_id FROM token_turns
    WHERE provider = 'codex' AND turn_id NOT IN (
      SELECT MIN(turn_id) 
      FROM token_turns 
      WHERE provider = 'codex'
      GROUP BY session_id, timestamp_ms, uncached_input, cached_input, output_tokens, model_codename
    );
  `);
  
  const dupCount = db.prepare('SELECT count(*) as c FROM codex_dups').get().c;
  console.log(`Found ${dupCount} duplicate turns to remove.`);
  
  db.exec('DELETE FROM token_turns WHERE turn_id IN (SELECT turn_id FROM codex_dups);');
  db.exec('DROP TABLE codex_dups;');

  // Step B: Re-price all existing turns in the ledger using standalone PricingEngine
  console.log('Step B: Re-pricing all turns using standalone PricingEngine...');
  const turnsToPrice = db.prepare(`
    SELECT turn_id, model_codename, uncached_input, cached_input, cache_write, output_tokens
    FROM token_turns
  `).all();
  
  const updatePriceStmt = db.prepare(`
    UPDATE token_turns 
    SET cost_usd = ?, cache_savings_pct = ?, pricing_status = ? 
    WHERE turn_id = ?
  `);

  let pricedCount = 0;
  for (const t of turnsToPrice) {
    const rates = pricingEngine.resolveRates(t.model_codename);
    if (rates) {
      const cost = calculateTurnCost(t, rates);
      const { savingsPct } = calculateCacheSavings(t, rates);
      updatePriceStmt.run(cost, savingsPct, 'priced', t.turn_id);
      pricedCount++;
    } else {
      updatePriceStmt.run(null, 0.0, 'unknown', t.turn_id);
    }
  }
  console.log(`Priced ${pricedCount} turns.`);

  // Step C: Scan and Ingest Antigravity native session databases
  console.log('Step C: Scanning and ingesting Antigravity native session databases...');
  
  // Protobuf decoder functions
  function fields(bytes) {
    let offset = 0;
    const result = new Map();
    const varint = () => {
      let value = 0n;
      for (let shift = 0n; shift < 70n; shift += 7n) {
        const byte = bytes[offset++];
        if (byte === undefined || (shift === 63n && byte > 1)) throw new Error("Invalid varint");
        value |= BigInt(byte & 127) << shift;
        if (byte < 128) return value > BigInt(Number.MAX_SAFE_INTEGER) ? value : Number(value);
      }
      throw new Error("Invalid varint");
    };
    while (offset < bytes.length) {
      const tag = varint();
      if (typeof tag !== "number") throw new Error("Invalid protobuf field");
      const number = Math.floor(tag / 8);
      const wire = tag % 8;
      if (number === 0) throw new Error("Invalid protobuf field");
      let value;
      if (wire === 0) value = varint();
      else if (wire === 1 || wire === 5 || wire === 2) {
        const length = wire === 2 ? varint() : wire === 1 ? 8 : 4;
        if (typeof length !== "number") throw new Error("Invalid length");
        if (length > bytes.length - offset) throw new Error("Truncated");
        value = bytes.subarray(offset, offset + length);
        offset += length;
        if (wire !== 2) continue;
      } else throw new Error("Unsupported wire type");
      const entries = result.get(number) ?? [];
      entries.push(value);
      result.set(number, entries);
    }
    return result;
  }

  const numberAt = (value, key) => {
    const entry = value.get(key)?.[0];
    return typeof entry === "number" ? entry : 0;
  };
  const bytesAt = (value, key) => {
    const entry = value.get(key)?.[0];
    return entry instanceof Uint8Array ? entry : undefined;
  };
  const nested = (value, key) => {
    const bytes = bytesAt(value, key);
    return bytes === undefined ? new Map() : fields(bytes);
  };
  const textAt = (value, key) => {
    const bytes = bytesAt(value, key);
    if (!bytes) return "";
    try { return new TextDecoder("utf-8").decode(bytes).trim(); } catch (_) { return ""; }
  };
  const timestamp = (value) => {
    const seconds = numberAt(value, 1);
    return seconds > 0 ? seconds * 1e3 + Math.floor(numberAt(value, 2) / 1e6) : null;
  };

  const MODEL_IDS = {
    246: "gemini-2.5-pro",
    312: "gemini-2.5-flash",
    313: "gemini-2.5-flash-thinking",
    329: "gemini-2.5-flash-thinking",
    330: "gemini-2.5-flash-lite",
    281: "claude-sonnet-4",
    282: "claude-sonnet-4",
    290: "claude-opus-4",
    291: "claude-opus-4",
    333: "claude-sonnet-4-5",
    334: "claude-sonnet-4-5",
    340: "claude-haiku-4-5",
    341: "claude-haiku-4-5",
    1026: "claude-opus-4-6",
    1035: "claude-sonnet-4-6",
    1016: "gemini-3.1-pro",
    1036: "gemini-3.1-pro",
    1037: "gemini-3.1-pro",
    1018: "gemini-3-flash-preview",
    1084: "gemini-3-flash-preview",
    1047: "gemini-3-flash-preview"
  };

  function modelName(name, id) {
    if (name) {
      const normalized = name.toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").replaceAll(" ", "-");
      if (normalized.startsWith("claude-")) return normalized.replace(/^claude-(4(?:\.\d+)?)-(sonnet|opus|haiku)/, "claude-$2-$1").replaceAll(".", "-");
      return normalized;
    }
    return MODEL_IDS[id] ?? (id > 0 ? `antigravity-model-${id}` : "");
  }

  function metadata(bytes, step) {
    const root = fields(bytes);
    if (!step && bytesAt(root, 1) === undefined) return null;
    const data = step ? root : nested(root, 1);
    const model = step ? nested(data, 24) : data;
    const usage = bytesAt(data, step ? 9 : 4);
    const usages = usage === undefined ? [] : [fields(usage.slice())];
    for (const retry of data.get(step ? 28 : 17) ?? []) {
      if (retry instanceof Uint8Array) {
        const retryUsage = bytesAt(fields(retry), 2);
        if (retryUsage !== undefined) usages.push(fields(retryUsage.slice()));
      }
    }
    return {
      model: modelName(textAt(model, step ? 12 : 19) || textAt(model, step ? 8 : 21), numberAt(model, step ? 1 : 3)),
      timestampMs: step ? timestamp(nested(data, 8)) ?? timestamp(nested(data, 1)) : timestamp(nested(nested(data, 9), 4)),
      usages
    };
  }

  function findDbFiles(dir) {
    let results = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(findDbFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.db') && !entry.name.includes('-shm') && !entry.name.includes('-wal') && !entry.name.includes('conversation_summaries')) {
          results.push(fullPath);
        }
      }
    } catch (_e) {}
    return results;
  }

  const antigravityDirs = [
    path.join(process.env.GEMINI_CLI_HOME || os.homedir(), 'antigravity-cli'),
    path.join(os.homedir(), '.gemini')
  ];

  let allDbs = [];
  for (const d of antigravityDirs) {
    if (fs.existsSync(d)) allDbs = allDbs.concat(findDbFiles(d));
  }

  const uniqueDbs = new Map();
  for (const f of allDbs) {
    const sid = path.basename(f, '.db');
    if (!uniqueDbs.has(sid)) uniqueDbs.set(sid, f);
  }

  console.log(`Found ${uniqueDbs.size} unique Antigravity databases.`);

  db.prepare(`
    INSERT OR IGNORE INTO ingestion_runs (run_id, source_kind, started_at_ms, completed_at_ms, turns_ingested, turns_skipped, status)
    VALUES (4, 'antigravity_native_scan', ?, ?, 0, 0, 'success')
  `).run(Date.now(), Date.now());

  const insertTurnStmt = db.prepare(`
    INSERT OR IGNORE INTO token_turns (
      natural_key, provider, session_id, request_id, file_id, ingestion_run_id,
      timestamp_ms, hour_bucket, date_bucket, model_codename, project_id,
      uncached_input, cached_input, cache_write, output_tokens, reasoning_tokens,
      processed_tokens, cache_savings_pct, cost_usd, pricing_status, source, coverage, dedupe_status
    ) VALUES (
      ?, 'antigravity', ?, ?, NULL, 4,
      ?, ?, ?, ?, '',
      ?, ?, ?, ?, ?,
      ?, ?, ?, 'priced', 'antigravity_scan', 'complete', 'unique'
    )
  `);

  let antigravityTurnCount = 0;
  let antigravityTokens = 0;
  let antigravityCost = 0;
  const dedupeSet = new Set();

  for (const [sid, dbPath] of uniqueDbs.entries()) {
    try {
      const agDb = new DatabaseSync(dbPath, { readOnly: true });
      const tables = new Set(agDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
      if (!tables.has('gen_metadata') && !tables.has('steps')) continue;

      let sessionModel = '';

      if (tables.has('gen_metadata')) {
        const gens = agDb.prepare('SELECT rowid, idx, data FROM gen_metadata').all();
        for (const g of gens) {
          if (!g.data) continue;
          const m = metadata(new Uint8Array(g.data), false);
          if (!m) continue;
          const model = m.model || 'gemini-3.8-flash';
          sessionModel = model;
          const ts = m.timestampMs || Date.now();
          const d = new Date(ts);
          const dateBucket = d.toISOString().slice(0, 10);
          const hourBucket = d.toISOString().slice(0, 13) + ':00:00.000Z';

          for (const [uIdx, u] of m.usages.entries()) {
            const uncached = numberAt(u, 2);
            const cached = numberAt(u, 5);
            const write = numberAt(u, 4);
            const out = Math.max(numberAt(u, 3), numberAt(u, 9) + numberAt(u, 10));
            const reasoning = Math.min(out, numberAt(u, 9));
            const tok = uncached + cached + write + out;
            if (tok === 0) continue;

            const dedupeId = textAt(u, 11) || textAt(u, 12) || `${sid}:gen:${g.idx}:${uIdx}`;
            if (dedupeSet.has(dedupeId)) continue;
            dedupeSet.add(dedupeId);

            const natKey = `antigravity:${sid}:gen:${g.idx}:${uIdx}:${dedupeId}`;
            const rates = pricingEngine.resolveRates(model);
            const turnUsage = { uncached_input: uncached, cached_input: cached, cache_write: write, output_tokens: out };
            const cost = rates ? calculateTurnCost(turnUsage, rates) : 0;
            const savings = (uncached + cached) > 0 ? Number((cached / (uncached + cached) * 100).toFixed(2)) : 0;

            insertTurnStmt.run(
              natKey, sid, dedupeId, ts, hourBucket, dateBucket, model,
              uncached, cached, write, out, reasoning, tok, savings, cost
            );

            antigravityTurnCount++;
            antigravityTokens += tok;
            antigravityCost += cost;
          }
        }
      }

      if (tables.has('steps')) {
        const steps = agDb.prepare('SELECT rowid, idx, metadata as data FROM steps WHERE metadata IS NOT NULL').all();
        for (const s of steps) {
          if (!s.data) continue;
          const m = metadata(new Uint8Array(s.data), true);
          if (!m) continue;
          const model = m.model || sessionModel || 'gemini-3.8-flash';
          const ts = m.timestampMs || Date.now();
          const d = new Date(ts);
          const dateBucket = d.toISOString().slice(0, 10);
          const hourBucket = d.toISOString().slice(0, 13) + ':00:00.000Z';

          for (const [uIdx, u] of m.usages.entries()) {
            const uncached = numberAt(u, 2);
            const cached = numberAt(u, 5);
            const write = numberAt(u, 4);
            const out = Math.max(numberAt(u, 3), numberAt(u, 9) + numberAt(u, 10));
            const reasoning = Math.min(out, numberAt(u, 9));
            const tok = uncached + cached + write + out;
            if (tok === 0) continue;

            const dedupeId = textAt(u, 11) || textAt(u, 12) || `${sid}:step:${s.idx}:${uIdx}`;
            if (dedupeSet.has(dedupeId)) continue;
            dedupeSet.add(dedupeId);

            const natKey = `antigravity:${sid}:step:${s.idx}:${uIdx}:${dedupeId}`;
            const rates = pricingEngine.resolveRates(model);
            const turnUsage = { uncached_input: uncached, cached_input: cached, cache_write: write, output_tokens: out };
            const cost = rates ? calculateTurnCost(turnUsage, rates) : 0;
            const savings = (uncached + cached) > 0 ? Number((cached / (uncached + cached) * 100).toFixed(2)) : 0;

            insertTurnStmt.run(
              natKey, sid, dedupeId, ts, hourBucket, dateBucket, model,
              uncached, cached, write, out, reasoning, tok, savings, cost
            );

            antigravityTurnCount++;
            antigravityTokens += tok;
            antigravityCost += cost;
          }
        }
      }
    } catch (err) {
      console.error('Error in Antigravity db:', dbPath, err.message);
    }
  }

  console.log(`Ingested ${antigravityTurnCount} Antigravity turns totaling ${(antigravityTokens / 1e9).toFixed(3)}B tokens ($${antigravityCost.toFixed(2)}).`);

  // Step D: Rebuild Materialized Rollup Tables with Verified SQL
  console.log('Step D: Rebuilding rollups (hourly_usage, daily_usage, provider_usage, model_usage, session_summaries)...');

  const hasHistoricalThreads = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'historical_threads'"
  ).get());

  // 1. hourly_usage (turns only)
  db.exec('DELETE FROM hourly_usage;');
  db.exec(`
    INSERT INTO hourly_usage (
      hour_bucket, provider, model_codename, turn_count,
      total_uncached_in, total_cached_in, total_cache_write,
      total_output, total_reasoning, total_processed,
      total_known_cost_usd, unknown_pricing_turn_count, cache_savings_pct
    )
    SELECT 
      hour_bucket, provider, model_codename,
      COUNT(*) AS turn_count,
      SUM(uncached_input) AS total_uncached_in,
      SUM(cached_input) AS total_cached_in,
      SUM(cache_write) AS total_cache_write,
      SUM(output_tokens) AS total_output,
      SUM(reasoning_tokens) AS total_reasoning,
      SUM(processed_tokens) AS total_processed,
      ROUND(SUM(COALESCE(cost_usd, 0.0)), 6) AS total_known_cost_usd,
      SUM(CASE WHEN pricing_status != 'priced' OR cost_usd IS NULL THEN 1 ELSE 0 END) AS unknown_pricing_turn_count,
      CASE 
        WHEN SUM(uncached_input + cached_input) > 0 
        THEN ROUND(100.0 * SUM(cached_input) / SUM(uncached_input + cached_input), 2)
        ELSE 0.0 
      END AS cache_savings_pct
    FROM token_turns
    GROUP BY hour_bucket, provider, model_codename;
  `);

  // 2. daily_usage (unified)
  const dailyHistoricalUnion = hasHistoricalThreads ? `
    UNION ALL
    SELECT 
      date_bucket, provider, COALESCE(model_codename, 'unknown') AS model_codename,
      COUNT(*) AS turn_count,
      SUM(total_tokens) AS total_uncached_in,
      0 AS total_cached_in,
      0 AS total_cache_write,
      0 AS total_output,
      0 AS total_reasoning,
      SUM(total_tokens) AS total_processed,
      0.0 AS total_known_cost_usd,
      COUNT(*) AS unknown_pricing_turn_count
    FROM historical_threads
    GROUP BY date_bucket, provider, model_codename
  ` : '';

  db.exec('DELETE FROM daily_usage;');
  db.exec(`
    INSERT INTO daily_usage (
      date_bucket, provider, model_codename, turn_count,
      total_uncached_in, total_cached_in, total_cache_write,
      total_output, total_reasoning, total_processed,
      total_known_cost_usd, unknown_pricing_turn_count, cache_savings_pct
    )
    SELECT 
      date_bucket, provider, model_codename,
      SUM(turn_count) AS turn_count,
      SUM(total_uncached_in) AS total_uncached_in,
      SUM(total_cached_in) AS total_cached_in,
      SUM(total_cache_write) AS total_cache_write,
      SUM(total_output) AS total_output,
      SUM(total_reasoning) AS total_reasoning,
      SUM(total_processed) AS total_processed,
      ROUND(SUM(total_known_cost_usd), 6) AS total_known_cost_usd,
      SUM(unknown_pricing_turn_count) AS unknown_pricing_turn_count,
      CASE 
        WHEN SUM(total_uncached_in + total_cached_in) > 0 
        THEN ROUND(100.0 * SUM(total_cached_in) / SUM(total_uncached_in + total_cached_in), 2)
        ELSE 0.0 
      END AS cache_savings_pct
    FROM (
      SELECT 
        date_bucket, provider, model_codename,
        COUNT(*) AS turn_count,
        SUM(uncached_input) AS total_uncached_in,
        SUM(cached_input) AS total_cached_in,
        SUM(cache_write) AS total_cache_write,
        SUM(output_tokens) AS total_output,
        SUM(reasoning_tokens) AS total_reasoning,
        SUM(processed_tokens) AS total_processed,
        COALESCE(SUM(cost_usd), 0.0) AS total_known_cost_usd,
        SUM(CASE WHEN pricing_status != 'priced' OR cost_usd IS NULL THEN 1 ELSE 0 END) AS unknown_pricing_turn_count
      FROM token_turns
      GROUP BY date_bucket, provider, model_codename
      ${dailyHistoricalUnion}
    )
    GROUP BY date_bucket, provider, model_codename;
  `);

  // 3. provider_usage (unified, 7 columns)
  const providerHistoricalUnion = hasHistoricalThreads ? `
    UNION ALL
    SELECT 
      provider,
      COUNT(*) AS turn_count,
      SUM(total_tokens) AS total_processed,
      0.0 AS total_known_cost_usd,
      COUNT(*) AS unknown_pricing_turn_count,
      MIN(created_at_ms) AS first_seen_ms,
      MAX(created_at_ms) AS last_seen_ms
    FROM historical_threads
    GROUP BY provider
  ` : '';

  db.exec('DELETE FROM provider_usage;');
  db.exec(`
    INSERT INTO provider_usage (
      provider, turn_count, total_processed,
      total_known_cost_usd, unknown_pricing_turn_count,
      first_seen_ms, last_seen_ms
    )
    SELECT 
      provider,
      SUM(turn_count) AS turn_count,
      SUM(total_processed) AS total_processed,
      ROUND(SUM(total_known_cost_usd), 6) AS total_known_cost_usd,
      SUM(unknown_pricing_turn_count) AS unknown_pricing_turn_count,
      MIN(first_seen_ms) AS first_seen_ms,
      MAX(last_seen_ms) AS last_seen_ms
    FROM (
      SELECT 
        provider,
        COUNT(*) AS turn_count,
        SUM(processed_tokens) AS total_processed,
        COALESCE(SUM(cost_usd), 0.0) AS total_known_cost_usd,
        SUM(CASE WHEN pricing_status != 'priced' OR cost_usd IS NULL THEN 1 ELSE 0 END) AS unknown_pricing_turn_count,
        MIN(timestamp_ms) AS first_seen_ms,
        MAX(timestamp_ms) AS last_seen_ms
      FROM token_turns
      GROUP BY provider
      ${providerHistoricalUnion}
    )
    GROUP BY provider;
  `);

  // 4. model_usage (unified, 8 columns)
  const modelHistoricalUnion = hasHistoricalThreads ? `
    UNION ALL
    SELECT 
      provider, COALESCE(model_codename, 'unknown') AS model_codename,
      COUNT(*) AS turn_count,
      SUM(total_tokens) AS total_processed,
      0.0 AS total_known_cost_usd,
      COUNT(*) AS unknown_pricing_turn_count,
      MIN(created_at_ms) AS first_seen_ms,
      MAX(created_at_ms) AS last_seen_ms
    FROM historical_threads
    GROUP BY provider, model_codename
  ` : '';

  db.exec('DELETE FROM model_usage;');
  db.exec(`
    INSERT INTO model_usage (
      provider, model_codename, turn_count, total_processed,
      total_known_cost_usd, unknown_pricing_turn_count,
      first_seen_ms, last_seen_ms
    )
    SELECT 
      provider, model_codename,
      SUM(turn_count) AS turn_count,
      SUM(total_processed) AS total_processed,
      ROUND(SUM(total_known_cost_usd), 6) AS total_known_cost_usd,
      SUM(unknown_pricing_turn_count) AS unknown_pricing_turn_count,
      MIN(first_seen_ms) AS first_seen_ms,
      MAX(last_seen_ms) AS last_seen_ms
    FROM (
      SELECT 
        provider, model_codename,
        COUNT(*) AS turn_count,
        SUM(processed_tokens) AS total_processed,
        COALESCE(SUM(cost_usd), 0.0) AS total_known_cost_usd,
        SUM(CASE WHEN pricing_status != 'priced' OR cost_usd IS NULL THEN 1 ELSE 0 END) AS unknown_pricing_turn_count,
        MIN(timestamp_ms) AS first_seen_ms,
        MAX(timestamp_ms) AS last_seen_ms
      FROM token_turns
      GROUP BY provider, model_codename
      ${modelHistoricalUnion}
    )
    GROUP BY provider, model_codename;
  `);

  // 5. session_summaries (unified, 10 columns)
  const sessionHistoricalUnion = hasHistoricalThreads ? `
    UNION ALL
    SELECT 
      provider,
      thread_id AS session_id,
      NULL AS project_id,
      title,
      1 AS turn_count,
      total_tokens AS total_processed,
      0.0 AS total_known_cost_usd,
      created_at_ms AS first_activity_ms,
      created_at_ms AS last_activity_ms,
      coverage
    FROM historical_threads
  ` : '';

  db.exec('DELETE FROM session_summaries;');
  db.exec(`
    INSERT INTO session_summaries (
      provider, session_id, project_id, title, turn_count,
      total_processed, total_known_cost_usd, first_activity_ms,
      last_activity_ms, coverage
    )
    SELECT 
      provider, session_id, project_id, title, turn_count,
      total_processed, total_known_cost_usd, first_activity_ms,
      last_activity_ms, coverage
    FROM (
      SELECT 
        provider,
        session_id,
        MAX(project_id) AS project_id,
        NULL AS title,
        COUNT(*) AS turn_count,
        SUM(processed_tokens) AS total_processed,
        ROUND(SUM(COALESCE(cost_usd, 0.0)), 6) AS total_known_cost_usd,
        MIN(timestamp_ms) AS first_activity_ms,
        MAX(timestamp_ms) AS last_activity_ms,
        MAX(coverage) AS coverage
      FROM token_turns
      GROUP BY provider, session_id
      ${sessionHistoricalUnion}
    );
  `);

  // 6. Update model_catalog
  const allModels = db.prepare('SELECT DISTINCT provider, model_codename FROM model_usage').all();
  const upsertCatalog = db.prepare(`
    INSERT INTO model_catalog (provider, model_codename, display_name, input_cost_per_m, cached_cost_per_m, output_cost_per_m)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, model_codename) DO UPDATE SET
      input_cost_per_m = excluded.input_cost_per_m,
      cached_cost_per_m = excluded.cached_cost_per_m,
      output_cost_per_m = excluded.output_cost_per_m
  `);

  for (const m of allModels) {
    const rates = pricingEngine.resolveRates(m.model_codename);
    if (rates) {
      upsertCatalog.run(m.provider, m.model_codename, m.model_codename, rates.inputPerM, rates.cacheReadPerM, rates.outputPerM);
    }
  }

  db.exec('COMMIT;');
  console.log('Transaction committed successfully.');
} catch (err) {
  db.exec('ROLLBACK;');
  console.error('Reconciliation failed, rolled back:', err);
  process.exit(1);
}

// 4. Copy newly reconciled database to user AppData
if (fs.existsSync(USER_LEDGER_PATH)) {
  fs.copyFileSync(LEDGER_PATH, USER_LEDGER_PATH);
  console.log(`Synced reconciled ledger to user AppData: ${USER_LEDGER_PATH}`);
}

// 5. Print Grand Totals
console.log('\n=== RECONCILED PROVIDER TOTALS IN LEDGER ===');
const providerStats = db.prepare('SELECT provider, turn_count, total_processed, total_known_cost_usd FROM provider_usage ORDER BY total_processed DESC').all();
for (const p of providerStats) {
  console.log(`${p.provider}: ${(p.total_processed / 1e9).toFixed(3)}B tokens, ${p.turn_count} turns, $${p.total_known_cost_usd.toFixed(2)}`);
}

const grand = db.prepare('SELECT SUM(total_processed) as tok, SUM(total_known_cost_usd) as cost, SUM(turn_count) as turns FROM provider_usage').get();
console.log(`\nGRAND TOTAL IN LEDGER: ${(grand.tok / 1e9).toFixed(3)}B tokens, ${grand.turns} turns, $${grand.cost.toFixed(2)}`);
