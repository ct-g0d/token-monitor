'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createTokenLedgerStore,
  readSourceWatermark,
  resolveTokenLedgerPath
} = require('../src/shared/usage/tokenLedger');
const { sweepUsage } = require('../src/shared/usage/tokenLedgerSweep');
const { buildDefaultSweepAdapters } = require('../src/shared/usage/defaultSweepAdapters');

const DEFAULT_VERIFY_DB_PATH = path.join(os.tmpdir(), 'tokex-verification-ledger.sqlite');

function parseArgs(args = process.argv.slice(2)) {
  const options = {
    db: process.env.TOKEN_MONITOR_VERIFY_DB || DEFAULT_VERIFY_DB_PATH,
    force: false,
    liveLedger: null,
    archive: null,
    home: process.env.USERPROFILE || os.homedir(),
    start: '2026-07-26',
    end: '2026-10-23'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--db' && args[i + 1]) {
      options.db = path.resolve(args[++i]);
    } else if (arg.startsWith('--db=')) {
      options.db = path.resolve(arg.slice(5));
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--live-ledger' && args[i + 1]) {
      options.liveLedger = path.resolve(args[++i]);
    } else if (arg === '--archive' && args[i + 1]) {
      options.archive = path.resolve(args[++i]);
    } else if (arg === '--home' && args[i + 1]) {
      options.home = path.resolve(args[++i]);
    } else if (arg === '--start' && args[i + 1]) {
      options.start = args[++i];
    } else if (arg === '--end' && args[i + 1]) {
      options.end = args[++i];
    }
  }

  return options;
}

function runBackfill(options = {}) {
  const targetDbPath = path.resolve(options.db || options.dbPath || DEFAULT_VERIFY_DB_PATH);
  const liveLedgerPath = path.resolve(
    options.liveLedger || options.liveLedgerPath || resolveTokenLedgerPath()
  );
  const archivePath = path.resolve(
    options.archive || options.archivePath || path.join(path.dirname(liveLedgerPath), 'daily-history-archive.json')
  );
  const homeDir = options.home || options.homeDir || process.env.USERPROFILE || os.homedir();
  const force = Boolean(options.force);
  const now = options.now || Date.now();

  // Guard against overwriting live ledger
  if (targetDbPath.toLowerCase() === liveLedgerPath.toLowerCase()) {
    throw new Error(`Refusing to overwrite live ledger at ${liveLedgerPath}! Specify a new path with --db.`);
  }

  // Refuse to overwrite existing DB unless --force
  if (fs.existsSync(targetDbPath)) {
    if (!force) {
      const msg = `Database already exists at ${targetDbPath}. Use --force to overwrite.`;
      if (options.throwOnExists !== false) {
        throw new Error(msg);
      }
      console.error(msg);
      return { success: false, error: msg };
    }
    try {
      fs.rmSync(targetDbPath, { force: true });
      fs.rmSync(`${targetDbPath}-wal`, { force: true });
      fs.rmSync(`${targetDbPath}-shm`, { force: true });
    } catch (_) {}
  }

  const store = createTokenLedgerStore({ path: targetDbPath });
  const db = store.database();

  const adapters = options.adapters || buildDefaultSweepAdapters({
    liveLedgerPath,
    archivePath,
    homeDir,
    env: process.env,
    now,
    end: options.end
  });

  const sweepResult = sweepUsage({
    db,
    adapters,
    mode: 'full',
    now
  });

  const watermarks = [];
  for (const source of sweepResult.sources) {
    const wm = readSourceWatermark(db, source.sourceKind, source.sourceId);
    const rowCount = db.prepare(
      'SELECT COUNT(*) AS count FROM usage_events WHERE source_kind = ? AND source_id = ?'
    ).get(source.sourceKind, source.sourceId).count;
    watermarks.push({
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      rowCount,
      watermark: wm
    });
    console.log(`Source watermark: kind=${source.sourceKind} id=${source.sourceId} rows=${rowCount} lastSuccessRunId=${wm?.last_success_run_id} dirty=${wm?.dirty}`);
  }

  const totalEvents = db.prepare('SELECT COUNT(*) AS count FROM usage_events').get().count;
  console.log(`Backfill completed: totalEvents=${totalEvents} sweepId=${sweepResult.sweepId}`);

  store.close();
  return {
    success: true,
    targetDbPath,
    totalEvents,
    watermarks,
    sweepResult
  };
}

if (require.main === module) {
  try {
    const args = parseArgs();
    runBackfill(args);
  } catch (err) {
    console.error(`Backfill failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_VERIFY_DB_PATH,
  parseArgs,
  runBackfill
};