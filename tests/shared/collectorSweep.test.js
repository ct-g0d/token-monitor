'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

const { startCollector } = require('../../src/shared/collector');

test('collector runs sweep with only tokenLedgerPath and records completed row in usage_sweep_runs', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collector-sweep-test-'));
  const tempLedgerPath = path.join(tempDir, 'ledger.sqlite');
  const updates = [];

  const collector = startCollector({
    clients: 'codex',
    deviceId: 'test-device',
    allTimeSince: '2026-01-01',
    tokenLedgerPath: tempLedgerPath,
    homeDir: tempDir,
    runTokscale: async () => ({ entries: [] }),
    watchEnabled: false,
    limitsEnabled: false,
    projectsEnabled: false,
    wslScanEnabled: false,
    historyEnabled: false,
    anchorPersistenceEnabled: false,
    onUpdate: (summary, reason) => updates.push({ summary, reason })
  });

  try {
    await collector.whenIdle();
    assert.ok(fs.existsSync(tempLedgerPath));
    const db = new DatabaseSync(tempLedgerPath);
    try {
      const row = db.prepare("SELECT * FROM usage_sweep_runs WHERE status = 'completed'").get();
      assert.ok(row, 'expected completed sweep row');
      assert.equal(row.status, 'completed');
    } finally {
      db.close();
    }

    // Run another tick to verify store reuse across ticks
    await collector.tick('manual');
    const db2 = new DatabaseSync(tempLedgerPath);
    try {
      const count = db2.prepare("SELECT COUNT(*) AS total FROM usage_sweep_runs WHERE status = 'completed'").get();
      assert.ok(count.total >= 1, 'expected at least one completed sweep run');
    } finally {
      db2.close();
    }
  } finally {
    collector.stop();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
});
