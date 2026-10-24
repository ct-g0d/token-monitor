'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { DEFAULT_VERIFY_DB_PATH, runBackfill } = require('./backfill-token-sql');

const DEFAULT_REFERENCE = {
  codex: 5570000000,
  claude: 1130000000,
  opencode: 1900000000,
  antigravity: 9400000000
};

const DEFAULT_MIN_TOTAL = 18000000000;
const DEFAULT_WINDOW_START = '2026-07-26';
const DEFAULT_WINDOW_END = '2026-10-23';
const DEFAULT_TOLERANCE = 0.02; // ±2%

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    db: process.env.TOKEN_MONITOR_VERIFY_DB || DEFAULT_VERIFY_DB_PATH,
    windowStart: DEFAULT_WINDOW_START,
    windowEnd: DEFAULT_WINDOW_END,
    min: DEFAULT_MIN_TOTAL,
    reference: { ...DEFAULT_REFERENCE },
    referenceFile: null,
    tolerance: DEFAULT_TOLERANCE,
    includeDsh: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--db' && args[i + 1]) {
      options.db = path.resolve(args[++i]);
    } else if (arg.startsWith('--db=')) {
      options.db = path.resolve(arg.slice(5));
    } else if (arg === '--window' && args[i + 1]) {
      const parts = args[++i].split(':');
      options.windowStart = parts[0] || DEFAULT_WINDOW_START;
      options.windowEnd = parts[1] || DEFAULT_WINDOW_END;
    } else if (arg.startsWith('--window=')) {
      const parts = arg.slice(9).split(':');
      options.windowStart = parts[0] || DEFAULT_WINDOW_START;
      options.windowEnd = parts[1] || DEFAULT_WINDOW_END;
    } else if (arg === '--min' && args[i + 1]) {
      options.min = Number(args[++i]);
    } else if (arg.startsWith('--min=')) {
      options.min = Number(arg.slice(6));
    } else if (arg === '--reference' && args[i + 1]) {
      options.referenceFile = path.resolve(args[++i]);
    } else if (arg.startsWith('--reference=')) {
      options.referenceFile = path.resolve(arg.slice(12));
    } else if (arg === '--tolerance' && args[i + 1]) {
      options.tolerance = Number(args[++i]);
    } else if (arg.startsWith('--tolerance=')) {
      options.tolerance = Number(arg.slice(12));
    } else if (arg === '--include-dsh') {
      options.includeDsh = true;
    }
  }

  if (options.referenceFile && fs.existsSync(options.referenceFile)) {
    try {
      options.reference = JSON.parse(fs.readFileSync(options.referenceFile, 'utf8'));
    } catch (e) {
      console.warn(`Warning: failed to read reference file ${options.referenceFile}: ${e.message}`);
    }
  }

  return options;
}

function verifySql90d(rawOptions = {}) {
  const reference = rawOptions.reference !== undefined
    ? rawOptions.reference
    : DEFAULT_REFERENCE;

  const options = {
    db: rawOptions.db || rawOptions.dbPath || process.env.TOKEN_MONITOR_VERIFY_DB || DEFAULT_VERIFY_DB_PATH,
    windowStart: rawOptions.windowStart || DEFAULT_WINDOW_START,
    windowEnd: rawOptions.windowEnd || DEFAULT_WINDOW_END,
    min: rawOptions.min != null ? Number(rawOptions.min) : DEFAULT_MIN_TOTAL,
    reference,
    tolerance: rawOptions.tolerance != null ? Number(rawOptions.tolerance) : DEFAULT_TOLERANCE,
    includeDsh: Boolean(rawOptions.includeDsh)
  };

  if (rawOptions.window) {
    const parts = String(rawOptions.window).split(':');
    options.windowStart = parts[0] || options.windowStart;
    options.windowEnd = parts[1] || options.windowEnd;
  }

  const dbPath = path.resolve(options.db);

  if (!fs.existsSync(dbPath)) {
    console.log(`Database not found at ${dbPath}; auto-running backfill...`);
    runBackfill({ dbPath, force: true });
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const failures = [];

  // 1. Check duplicate natural keys
  const duplicateRows = db.prepare(`
    SELECT natural_key, COUNT(*) AS count
    FROM usage_events
    GROUP BY natural_key
    HAVING count > 1
  `).all();

  if (duplicateRows.length > 0) {
    failures.push(`Duplicate natural keys found: ${duplicateRows.length} duplicates detected`);
    for (const dup of duplicateRows.slice(0, 5)) {
      failures.push(`  Duplicate natural_key: ${dup.natural_key} (count: ${dup.count})`);
    }
  }

  // 2. Check source watermarks
  const watermarks = db.prepare('SELECT * FROM source_watermarks').all();
  if (watermarks.length === 0) {
    failures.push('Missing source watermarks: no watermarks found in source_watermarks table');
  }

  for (const wm of watermarks) {
    if (wm.dirty === 1) {
      failures.push(`Stale/dirty watermark: ${wm.source_kind}:${wm.source_id} is marked dirty=1`);
    }
    if (wm.last_success_run_id == null || wm.last_success_at_ms == null || wm.last_success_at_ms <= 0) {
      failures.push(`Incomplete watermark: ${wm.source_kind}:${wm.source_id} missing last_success`);
    }
  }

  // 3. Query SQL facts and apply per-client/day equivalence rule
  const factRows = db.prepare(`
    SELECT date_bucket, client_id, source_kind, SUM(total_tokens) AS tokens
    FROM usage_events
    WHERE state = 'active' AND date_bucket BETWEEN ? AND ?
    GROUP BY date_bucket, client_id, source_kind
  `).all(options.windowStart, options.windowEnd);

  const dayMap = {};
  for (const r of factRows) {
    dayMap[r.date_bucket] ||= {};
    dayMap[r.date_bucket][r.client_id] ||= {};
    dayMap[r.date_bucket][r.client_id][r.source_kind] = Number(r.tokens || 0);
  }

  const sortedDates = Object.keys(dayMap).sort();
  let sourceCompleteExcludingDsh = 0;
  let sourceCompleteIncludingDsh = 0;
  let dshTotal = 0;
  const clientTotals = {};
  const dayTotals = {};

  for (const date of sortedDates) {
    const clients = dayMap[date];
    let dayEx = 0;
    let dayIn = 0;

    for (const [client, sources] of Object.entries(clients)) {
      let selected;
      if (client === 'antigravity') {
        if (date === options.windowEnd) {
          selected = Math.max(sources['antigravity-disk'] || 0, sources['daily-history-archive'] || 0);
        } else {
          selected = sources['antigravity-disk'] || 0;
        }
      } else {
        selected = Math.max(...Object.values(sources));
      }
      if (client === 'dsh') {
        dshTotal += selected;
        dayIn += selected;
      } else {
        clientTotals[client] = (clientTotals[client] || 0) + selected;
        dayEx += selected;
        dayIn += selected;
      }
    }

    sourceCompleteExcludingDsh += dayEx;
    sourceCompleteIncludingDsh += dayIn;
    dayTotals[date] = { excludeDsh: dayEx, includeDsh: dayIn };
  }

  // 4. Verify minimum threshold
  if (sourceCompleteExcludingDsh < options.min) {
    failures.push(
      `Total excluding DSH (${sourceCompleteExcludingDsh}) is below minimum gate (${options.min})`
    );
  }

  // 5. Verify reference values (±tolerance)
  const referenceResults = {};
  if (options.reference && typeof options.reference === 'object' && Object.keys(options.reference).length > 0) {
    for (const [provider, refTokens] of Object.entries(options.reference)) {
      const ref = Number(refTokens);
      const actual = clientTotals[provider] || 0;
      const diffPct = ref > 0 ? (actual - ref) / ref : 0;
      const pass = Math.abs(diffPct) <= options.tolerance;
      referenceResults[provider] = {
        actual,
        reference: ref,
        diffPercent: diffPct * 100,
        pass
      };
      if (!pass) {
        failures.push(
          `Provider '${provider}' tokens (${actual.toLocaleString('en-US')}) outside ±${(options.tolerance * 100).toFixed(1)}% of reference (${ref.toLocaleString('en-US')}) [diff: ${(diffPct * 100).toFixed(2)}%]`
        );
      }
    }
  }

  const status = failures.length === 0 ? 'PASS' : 'FAIL';

  // Format and print output
  console.log('================================================================');
  console.log(`90-Day Token Verification Window: ${options.windowStart} to ${options.windowEnd}`);
  console.log(`Database: ${dbPath}`);
  console.log('----------------------------------------------------------------');
  console.log('Per-client totals:');
  const allClients = Object.keys(clientTotals).sort();
  for (const client of allClients) {
    console.log(`  ${client.padEnd(16)}: ${clientTotals[client].toLocaleString('en-US').padStart(14)}`);
  }
  if (dshTotal > 0) {
    console.log(`  ${'dsh (policy-excl)'.padEnd(16)}: ${dshTotal.toLocaleString('en-US').padStart(14)}`);
  }
  console.log('----------------------------------------------------------------');
  if (Object.keys(referenceResults).length > 0) {
    console.log('Reference validation (±2% tolerance):');
    for (const [prov, res] of Object.entries(referenceResults)) {
      const sign = res.diffPercent >= 0 ? '+' : '';
      const tag = res.pass ? 'PASS' : 'FAIL';
      console.log(
        `  ${prov.padEnd(14)}: actual=${res.actual.toLocaleString('en-US').padStart(14)} ref=${res.reference.toLocaleString('en-US').padStart(14)} diff=${sign}${res.diffPercent.toFixed(2)}% [${tag}]`
      );
    }
    console.log('----------------------------------------------------------------');
  }
  if (failures.length > 0) {
    console.log('Failures:');
    for (const fail of failures) {
      console.log(`  * ${fail}`);
    }
    console.log('----------------------------------------------------------------');
  }

  console.log(`sourceCompleteExcludingDsh=${sourceCompleteExcludingDsh}`);
  console.log(`sourceCompleteIncludingDsh=${sourceCompleteIncludingDsh}`);
  console.log(`status=${status}`);
  console.log('================================================================');

  db.close();

  return {
    status,
    sourceCompleteExcludingDsh,
    sourceCompleteIncludingDsh,
    dshTotal,
    clientTotals,
    dayTotals,
    referenceResults,
    failures
  };
}

if (require.main === module) {
  try {
    const args = parseArgs();
    const result = verifySql90d(args);
    if (result.status !== 'PASS') {
      process.exit(1);
    }
  } catch (err) {
    console.error(`Verification error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_MIN_TOTAL,
  DEFAULT_REFERENCE,
  DEFAULT_TOLERANCE,
  DEFAULT_WINDOW_END,
  DEFAULT_WINDOW_START,
  parseArgs,
  verifySql90d
};
