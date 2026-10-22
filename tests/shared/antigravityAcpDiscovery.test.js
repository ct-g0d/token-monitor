'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverAntigravityAcpRoots } = require('../../src/shared/providers/antigravity/paths');
const { tokscaleExtraDirsEnv } = require('../../src/shared/customScanPaths');
const { extractUsageBundleFromTokscale } = require('../../src/shared/usage');

test('discoverAntigravityAcpRoots finds conversations under GEMINI_HOME', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-acp-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const acpConv = path.join(tempDir, 'antigravity-acp', 'conversations');
  fs.mkdirSync(acpConv, { recursive: true });

  const roots = discoverAntigravityAcpRoots({
    env: { GEMINI_HOME: tempDir },
    homeDir: tempDir,
    platform: process.platform
  });

  assert.equal(roots.length, 1);
  assert.equal(path.resolve(roots[0]), path.resolve(acpConv));
});

test('discoverAntigravityAcpRoots finds conversations under T3 userdata providers', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-t3-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const profileConv = path.join(tempDir, 'userdata', 'providers', 'antigravity', 'test-profile-hash', 'antigravity-acp', 'conversations');
  fs.mkdirSync(profileConv, { recursive: true });

  const roots = discoverAntigravityAcpRoots({
    env: { T3CODE_HOME: tempDir },
    homeDir: tempDir,
    platform: process.platform
  });

  assert.equal(roots.length, 1);
  assert.equal(path.resolve(roots[0]), path.resolve(profileConv));
});

test('tokscaleExtraDirsEnv with discoverAcp: true emits antigravity-cli extra scan paths', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-extra-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const acpConv = path.join(tempDir, 'antigravity-acp', 'conversations');
  fs.mkdirSync(acpConv, { recursive: true });

  const extraDirs = tokscaleExtraDirsEnv({}, '', {
    env: { GEMINI_HOME: tempDir },
    homeDir: tempDir,
    discoverAcp: true,
    platform: process.platform
  });

  assert.match(extraDirs, /antigravity-cli:/);
  assert.ok(extraDirs.includes(acpConv));
});

test('partition invariant: tokscale output for antigravity-cli folds into antigravity partition', () => {
  const sampleTokscaleOutput = {
    totalInput: 1000,
    totalOutput: 200,
    totalCacheRead: 5000,
    totalCost: 0.05,
    entries: [
      {
        client: 'antigravity-cli',
        model: 'gemini-3.8-flash',
        input: 1000,
        output: 200,
        cacheRead: 5000,
        cost: 0.05,
        messages: 10
      }
    ]
  };

  const bundle = extractUsageBundleFromTokscale(sampleTokscaleOutput);
  assert.deepEqual(Object.keys(bundle.byClient), ['antigravity']);
  assert.equal(bundle.byClient.antigravity.totalTokens, 6200);
  assert.equal(bundle.byClient.antigravity.costUsd, 0.05);
});
