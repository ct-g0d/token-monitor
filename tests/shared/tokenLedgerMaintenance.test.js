'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');

const {
  createTokenLedgerStore,
  ensureSchema,
  ensureFactSchema,
  upsertUsageEvent
} = require('../../src/shared/usage/tokenLedger');

function tempLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-ledger-maintenance-'));
  const file = path.join(dir, 'token_ledger.sqlite');
  return { dir, file };
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

test('token ledger maintenance: skips cost backfill with maintenance: false and backfills on default options', () => {
  const fixture = tempLedger();
  try {
    const db = new DatabaseSync(fixture.file);
    ensureSchema(db, { maintenance: false });

    // Build fixture row through existing tokenLedger API:
    // upsert an active usage_events row having cost_usd = 0 for a model that
    // the default pricing engine prices ('gpt-5.6-luna').
    upsertUsageEvent(db, {
      natural_key: 'maintenance-test-event-1',
      client_id: 'codex',
      source_kind: 'codex-sessions',
      source_id: 'default',
      occurred_at_ms: 1780000000000,
      model_id: 'gpt-5.6-luna',
      input_tokens: 1000,
      cached_input_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 500,
      total_tokens: 1500,
      cost_usd: 0,
      state: 'active'
    }, { pricingEngine: { resolveRates: () => null } });

    const initialRow = db.prepare('SELECT cost_usd, model_id, state FROM usage_events WHERE natural_key = ?').get('maintenance-test-event-1');
    assert.equal(initialRow.cost_usd, 0);
    assert.equal(initialRow.model_id, 'gpt-5.6-luna');
    assert.equal(initialRow.state, 'active');
    db.close();

    // (a) a store with { path, maintenance: false }: after open(), row's cost_usd is still 0
    const mainStore = createTokenLedgerStore({ path: fixture.file, maintenance: false });
    const mainDb = mainStore.open();
    assert.ok(mainDb);
    const rowAfterMain = mainDb.prepare('SELECT cost_usd FROM usage_events WHERE natural_key = ?').get('maintenance-test-event-1');
    assert.equal(rowAfterMain.cost_usd, 0, 'cost_usd should remain 0 when maintenance: false');
    mainStore.close();

    // (b) the same ledger opened with default options: cost_usd becomes > 0 (current behavior preserved)
    const defaultStore = createTokenLedgerStore({ path: fixture.file });
    const defaultDb = defaultStore.open();
    assert.ok(defaultDb);
    const rowAfterDefault = defaultDb.prepare('SELECT cost_usd FROM usage_events WHERE natural_key = ?').get('maintenance-test-event-1');
    assert.ok(rowAfterDefault.cost_usd > 0, `cost_usd should be backfilled to > 0 on default options (got ${rowAfterDefault.cost_usd})`);
    defaultStore.close();
  } finally {
    cleanup(fixture.dir);
  }
});

test('ensureFactSchema and ensureSchema: default to maintenance: true, respect maintenance: false', () => {
  const fixture = tempLedger();
  try {
    const db = new DatabaseSync(fixture.file);
    ensureSchema(db, { maintenance: false });

    upsertUsageEvent(db, {
      natural_key: 'schema-test-event-1',
      client_id: 'codex',
      source_kind: 'codex-sessions',
      source_id: 'default',
      occurred_at_ms: 1780000000000,
      model_id: 'gpt-5.6-luna',
      input_tokens: 1000,
      cached_input_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 500,
      total_tokens: 1500,
      cost_usd: 0,
      state: 'active'
    }, { pricingEngine: { resolveRates: () => null } });

    // ensureFactSchema with maintenance: false leaves cost_usd at 0
    ensureFactSchema(db, { maintenance: false });
    const row1 = db.prepare('SELECT cost_usd FROM usage_events WHERE natural_key = ?').get('schema-test-event-1');
    assert.equal(row1.cost_usd, 0);

    // ensureFactSchema with default options backfills cost_usd > 0
    ensureFactSchema(db);
    const row2 = db.prepare('SELECT cost_usd FROM usage_events WHERE natural_key = ?').get('schema-test-event-1');
    assert.ok(row2.cost_usd > 0);

    db.close();
  } finally {
    cleanup(fixture.dir);
  }
});
