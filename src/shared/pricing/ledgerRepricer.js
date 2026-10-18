'use strict';

const { calculateTurnCost, calculateCacheSavings } = require('./formula');

function repriceLedger(database, pricingEngine, options = {}) {
  const overwriteAll = options.overwriteAll === true;
  const filterClause = overwriteAll ? 'WHERE 1=1' : "WHERE cost_usd IS NULL OR pricing_status != 'priced'";

  const turns = database.prepare(`
    SELECT turn_id, provider, model_codename, uncached_input, cached_input, cache_write, output_tokens, processed_tokens
    FROM token_turns
    ${filterClause}
  `).all();

  if (turns.length === 0) return { repricedTurns: 0, distinctModels: 0 };

  const updateStmt = database.prepare(`
    UPDATE token_turns
    SET cost_usd = ?, cache_savings_pct = ?, pricing_status = ?
    WHERE turn_id = ?
  `);

  const distinctModels = new Map(); // key: `${provider}:${model}` -> { provider, model }

  database.exec('BEGIN TRANSACTION;');
  try {
    for (const turn of turns) {
      const key = `${turn.provider}:${turn.model_codename}`;
      if (!distinctModels.has(key)) {
        distinctModels.set(key, { provider: turn.provider, model: turn.model_codename });
      }

      const rates = pricingEngine.resolveRates(turn.model_codename);
      if (!rates) {
        updateStmt.run(null, 0.0, 'unknown', turn.turn_id);
        continue;
      }

      const cost = calculateTurnCost(turn, rates);
      const { savingsPct } = calculateCacheSavings(turn, rates);
      updateStmt.run(cost, savingsPct, 'priced', turn.turn_id);
    }

    // Populate model_catalog in SQLite
    const upsertCatalog = database.prepare(`
      INSERT INTO model_catalog (provider, model_codename, display_name, input_cost_per_m, cached_cost_per_m, output_cost_per_m)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, model_codename) DO UPDATE SET
        input_cost_per_m = excluded.input_cost_per_m,
        cached_cost_per_m = excluded.cached_cost_per_m,
        output_cost_per_m = excluded.output_cost_per_m
    `);

    for (const { provider, model } of distinctModels.values()) {
      const rates = pricingEngine.resolveRates(model);
      if (rates) {
        upsertCatalog.run(provider, model, model, rates.inputPerM, rates.cacheReadPerM, rates.outputPerM);
      }
    }

    // Check if historical_threads table exists
    const hasHistoricalThreads = Boolean(database.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'historical_threads'"
    ).get());

    // Materialize hourly_usage (turns only)
    database.exec(`
      DELETE FROM hourly_usage;

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

    // Materialize daily_usage (unified)
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

    database.exec(`
      DELETE FROM daily_usage;

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

    // Materialize provider_usage (unified)
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

    database.exec(`
      DELETE FROM provider_usage;

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

    // Materialize model_usage (unified)
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

    database.exec(`
      DELETE FROM model_usage;

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

    // Materialize session_summaries (unified)
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

    database.exec(`
      DELETE FROM session_summaries;

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

    database.exec('COMMIT;');
  } catch (err) {
    database.exec('ROLLBACK;');
    throw err;
  }

  return { repricedTurns: turns.length, distinctModels: distinctModels.size };
}

module.exports = {
  repriceLedger
};
