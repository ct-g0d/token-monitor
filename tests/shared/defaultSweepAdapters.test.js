'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildDefaultSweepAdapters } = require('../../src/shared/usage/defaultSweepAdapters');

test('buildDefaultSweepAdapters returns default adapters array and handles missing paths gracefully', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-default-adapters-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const nonExistentDb = path.join(tempDir, 'no_ledger.sqlite');
  const nonExistentArchive = path.join(tempDir, 'no_archive.json');

  const adapters = buildDefaultSweepAdapters({
    homeDir: tempDir,
    liveLedgerPath: nonExistentDb,
    archivePath: nonExistentArchive
  });

  assert.ok(Array.isArray(adapters));
  // At minimum, antigravity-disk adapter is present
  assert.ok(adapters.some((a) => a.sourceKind === 'antigravity-disk'));
  // Missing DB and archive are not added
  assert.equal(adapters.some((a) => a.sourceKind === 'token-ledger'), false);
  assert.equal(adapters.some((a) => a.sourceKind === 'daily-history-archive'), false);
});

test('buildDefaultSweepAdapters discovers existing live ledger and archive snapshot', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-default-adapters-existing-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const fakeDb = path.join(tempDir, 'token_ledger.sqlite');
  const fakeArchive = path.join(tempDir, 'daily-history-archive.json');
  fs.writeFileSync(fakeDb, '');
  fs.writeFileSync(fakeArchive, JSON.stringify({ days: {} }));

  const adapters = buildDefaultSweepAdapters({
    homeDir: tempDir,
    liveLedgerPath: fakeDb,
    archivePath: fakeArchive
  });

  const sqliteAdapter = adapters.find((a) => a.sourceKind === 'token-ledger');
  assert.ok(sqliteAdapter, 'token-ledger adapter must be present');
  assert.equal(sqliteAdapter.sourceId, 'live-ledger');

  const archiveAdapter = adapters.find((a) => a.sourceKind === 'daily-history-archive');
  assert.ok(archiveAdapter, 'daily-history-archive adapter must be present');
  assert.equal(archiveAdapter.sourceId, 'daily-history-archive.json');

  const agAdapter = adapters.find((a) => a.sourceKind === 'antigravity-disk');
  assert.ok(agAdapter, 'antigravity-disk adapter must be present');
});

test('buildDefaultSweepAdapters appends custom scan path roots via adaptersForRoots', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-default-adapters-custom-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const customLog = path.join(tempDir, 'custom.jsonl');
  fs.writeFileSync(customLog, '');

  const adapters = buildDefaultSweepAdapters({
    homeDir: tempDir,
    liveLedgerPath: path.join(tempDir, 'missing.sqlite'),
    archivePath: path.join(tempDir, 'missing.json'),
    customScanPaths: [customLog]
  });

  assert.ok(adapters.some((a) => a.sourceKind === 'append-file' && a.path === customLog));
});
