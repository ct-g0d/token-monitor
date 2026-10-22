'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const {
  discoverAntigravityRoots,
  makeAntigravityUsageCache,
  readAntigravityUsage
} = require('../../src/shared/providers/antigravity/conversationReader');

const {
  buildAntigravityUsageView,
  mergeAntigravityGraph
} = require('../../src/shared/providers/antigravity/conversationUsage');

function encodeVarint(num) {
  const bytes = [];
  let n = num;
  while (n > 127) {
    bytes.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  bytes.push(n & 0x7f);
  return bytes;
}

function fieldVarint(tag, num) {
  return [...encodeVarint((tag << 3) | 0), ...encodeVarint(num)];
}

function fieldBytes(tag, bytes) {
  return [...encodeVarint((tag << 3) | 2), ...encodeVarint(bytes.length), ...bytes];
}

function fieldString(tag, str) {
  return fieldBytes(tag, Buffer.from(str, 'utf8'));
}

function buildMockGenPayload({
  model = 'gemini-1.5-pro',
  timestampSeconds = 1792400000,
  uncachedInput = 1000,
  cachedInput = 200,
  output = 500,
  reasoning = 100,
  responseId = 'resp-1'
} = {}) {
  const usageBytes = [
    ...fieldVarint(2, uncachedInput),
    ...fieldVarint(3, output),
    ...fieldVarint(5, cachedInput),
    ...fieldVarint(9, reasoning),
    ...fieldString(11, responseId)
  ];
  const timestampBytes = [
    ...fieldVarint(1, timestampSeconds),
    ...fieldVarint(2, 0)
  ];
  const timeContainer = [
    ...fieldBytes(4, timestampBytes)
  ];
  const dataBytes = [
    ...fieldString(19, model),
    ...fieldBytes(4, usageBytes),
    ...fieldBytes(9, timeContainer)
  ];
  return Buffer.from(fieldBytes(1, dataBytes));
}

function createMockConversationDb(filePath, rows = []) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec('CREATE TABLE gen_metadata (idx INTEGER, data BLOB, retry BLOB)');
  db.exec('CREATE TABLE steps (step INTEGER, idx INTEGER, metadata BLOB, state BLOB)');

  const ins = db.prepare('INSERT INTO gen_metadata (idx, data) VALUES (?, ?)');
  rows.forEach((row, index) => {
    ins.run(index, row);
  });
  db.close();
}

test('discoverAntigravityRoots discovers standard and T3 userdata roots', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-discovery-test-'));
  try {
    const rootStd = path.join(tmpBase, '.gemini', 'antigravity', 'conversations');
    const rootIde = path.join(tmpBase, '.gemini', 'antigravity-ide', 'conversations');
    const rootT3 = path.join(tmpBase, '.t3', 'userdata', 'providers', 'antigravity', 'profile1', 'antigravity-acp', 'conversations');

    fs.mkdirSync(rootStd, { recursive: true });
    fs.mkdirSync(rootIde, { recursive: true });
    fs.mkdirSync(rootT3, { recursive: true });

    const discovered = discoverAntigravityRoots({
      homeDir: tmpBase,
      env: {}
    });

    assert.ok(discovered.includes(rootStd), `Expected ${rootStd} to be discovered`);
    assert.ok(discovered.includes(rootIde), `Expected ${rootIde} to be discovered`);
    assert.ok(discovered.includes(rootT3), `Expected ${rootT3} to be discovered`);
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('discoverAntigravityRoots respects ANTIGRAVITY_DATA_DIR override', () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-custom-test-'));
  try {
    const customDir = path.join(tmpBase, 'custom-convos');
    fs.mkdirSync(customDir, { recursive: true });

    const discovered = discoverAntigravityRoots({
      env: {
        ANTIGRAVITY_DATA_DIR: customDir
      }
    });

    assert.ok(discovered.includes(customDir), 'Expected customDir to be included');
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});

test('readAntigravityUsage decodes tokens and deduplicates by responseId', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-read-test-'));
  try {
    const sessionId = '11111111-2222-3333-4444-555555555555';
    const dbPath = path.join(tmpDir, `${sessionId}.db`);

    // Two generation rows that share the same responseId (deduped via union-find)
    const row1 = buildMockGenPayload({
      model: 'gemini-1.5-pro',
      timestampSeconds: 1792400000,
      uncachedInput: 1000,
      cachedInput: 200,
      output: 500,
      reasoning: 100,
      responseId: 'shared-response-id'
    });
    const row2 = buildMockGenPayload({
      model: 'gemini-1.5-pro',
      timestampSeconds: 1792400000,
      uncachedInput: 800,
      cachedInput: 100,
      output: 400,
      reasoning: 50,
      responseId: 'shared-response-id'
    });

    createMockConversationDb(dbPath, [row1, row2]);

    const result = readAntigravityUsage([tmpDir], 0);
    assert.equal(result.files.length, 1);
    assert.equal(result.errors.length, 0);
    // Because responseId was shared, union-find merges them into 1 candidate
    assert.equal(result.records.length, 1);

    const rec = result.records[0];
    assert.equal(rec.sessionId, sessionId);
    assert.equal(rec.model, 'gemini-1.5-pro');
    assert.equal(rec.totals.uncachedInputTokens, 1000);
    assert.equal(rec.totals.cachedInputTokens, 200);
    assert.equal(rec.totals.outputTokens, 500);
    assert.equal(rec.totals.reasoningTokens, 100);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readAntigravityUsage uses fingerprint cache on warm scan', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cache-test-'));
  try {
    const sessionId = 'cache-test-sess';
    const dbPath = path.join(tmpDir, `${sessionId}.db`);
    const row = buildMockGenPayload({ model: 'gemini-1.5-flash', uncachedInput: 500, output: 200 });
    createMockConversationDb(dbPath, [row]);

    const cache = makeAntigravityUsageCache();
    const first = readAntigravityUsage([tmpDir], 0, cache);
    assert.equal(first.records.length, 1);
    assert.equal(cache.size, 1);

    // Second call without modifying the file must use cached result
    const second = readAntigravityUsage([tmpDir], 0, cache);
    assert.equal(second.records.length, 1);
    assert.equal(second.records[0].model, 'gemini-1.5-flash');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildAntigravityUsageView dedupes against Tokscale reported sessions and enforces partition invariants', () => {
  const reportedSession = 'sess-reported-1';
  const newSession = 'sess-new-2';
  const timestampMs = Date.parse('2026-10-20T12:00:00Z');

  const records = [
    {
      sessionId: reportedSession,
      timestampMs,
      model: 'gemini-1.5-pro',
      totals: {
        uncachedInputTokens: 1000,
        cachedInputTokens: 200,
        cacheCreationTokens: 0,
        outputTokens: 500,
        reasoningTokens: 100
      }
    },
    {
      sessionId: newSession,
      timestampMs,
      model: 'gemini-1.5-flash',
      totals: {
        uncachedInputTokens: 2000,
        cachedInputTokens: 300,
        cacheCreationTokens: 0,
        outputTokens: 600,
        reasoningTokens: 150
      }
    }
  ];

  const nativePeriod = {
    sessions: {
      [`antigravity:${reportedSession}`]: {
        client: 'antigravity',
        sessionId: reportedSession
      }
    }
  };

  const view = buildAntigravityUsageView(records, {
    nativePeriod,
    now: new Date('2026-10-22T00:00:00Z'),
    allTimeSince: '2026-07-25'
  });

  // Only newSession should be included
  assert.equal(view.sessionKeys.length, 1);
  assert.equal(view.sessionKeys[0], `antigravity:${newSession}`);

  // Invariant 1: client is strictly 'antigravity'
  const clients = Object.keys(view.allTime.clients);
  assert.deepEqual(clients, ['antigravity']);

  // Invariant 2: disjoint reasoning arithmetic
  // Input: 2000, Cached: 300, Output: 600 (450 disjoint output + 150 reasoning), Total: 2900
  const agClient = view.allTime.clients.antigravity;
  assert.equal(agClient, 2900);
  assert.equal(view.allTime.totalTokens, 2900);
  assert.equal(view.allTime.cacheReadTokens, 300);
  // Folded output tokens = disjoint output (450) + reasoning (150) = 600
  assert.equal(view.allTime.outputTokens, 600);

  // Invariant 3: session breakdown preservation
  const session = view.allTime.sessions[`antigravity:${newSession}`];
  assert.ok(session, 'Expected session to exist');
  assert.equal(session.client, 'antigravity');
  assert.equal(session.inputTokens, 2000);
  assert.equal(session.outputTokens, 600);
  assert.equal(session.reasoningTokens, 150);
  assert.equal(session.cacheReadTokens, 300);
  assert.equal(session.totalTokens, 2900);

  // Invariant 4: graph contribution
  assert.equal(view.graph.contributions.length, 1);
  assert.equal(view.graph.contributions[0].clients[0].client, 'antigravity');
});

test('mergeAntigravityGraph keeps the larger antigravity reading per day and never sums the two', () => {
  const retained = { contributions: [
    { date: '2026-10-01', activeTimeMs: 5, clients: [
      { client: 'antigravity-cli', modelId: 'gemini', tokens: { input: 300 } },
      { client: 'codex', modelId: 'gpt', tokens: { input: 10 } }
    ] },
    { date: '2026-10-02', clients: [{ client: 'antigravity', modelId: 'gemini', tokens: { input: 800 } }] }
  ] };
  const reader = { contributions: [
    { date: '2026-10-01', clients: [{ client: 'antigravity', modelId: 'gemini', tokens: { input: 500 } }] },
    { date: '2026-10-02', clients: [{ client: 'antigravity', modelId: 'gemini', tokens: { input: 500 } }] },
    { date: '2026-10-04', clients: [{ client: 'antigravity', modelId: 'claude', tokens: { input: 70, reasoning: 30 } }] }
  ] };

  const merged = mergeAntigravityGraph(retained, reader);
  const day = (date) => merged.contributions.find((row) => row.date === date);
  const antigravityOn = (date) => day(date).clients
    .filter((row) => row.client.startsWith('antigravity'))
    .reduce((sum, row) => sum + Object.values(row.tokens).reduce((a, b) => a + b, 0), 0);

  // Reader wins: the tokscale alias is replaced, the unrelated client is kept.
  assert.equal(antigravityOn('2026-10-01'), 500);
  assert.equal(day('2026-10-01').clients.find((row) => row.client === 'codex').tokens.input, 10);
  // Retained wins: the reader's 500 is not added on top of 800.
  assert.equal(antigravityOn('2026-10-02'), 800);
  // Reader-only day is added, reasoning included as the history total counts it.
  assert.equal(antigravityOn('2026-10-04'), 100);
  assert.equal(day('2026-10-04').activeTimeMs, 0);
  assert.equal(merged.contributions.length, 3);
  assert.equal(mergeAntigravityGraph(retained, { contributions: [] }), retained);
});
