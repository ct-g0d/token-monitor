'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const packageJson = require('../../package.json');

const runtimeScripts = ['start', 'widget', 'dev', 'agent', 'agent:once', 'pack', 'dist:win', 'dist:win:dir', 'dist:linux'];

test('runtime and packaging scripts explicitly ensure vendored tokscale', () => {
  for (const name of runtimeScripts) assert.match(packageJson.scripts[name], /ensure:tokscale/, name);
  assert.match(packageJson.scripts['dist:win:dir'], /--platform=win32-x64/);
  assert.match(packageJson.scripts['dist:linux'], /--platform=linux-x64/);
});

test('ordinary install-adjacent scripts do not pull the vendored binary', () => {
  for (const name of ['hub', 'test', 'lint', 'verify', 'dist:win:prepackaged']) {
    assert.doesNotMatch(packageJson.scripts[name], /ensure:tokscale/, name);
  }
  assert.equal(packageJson.scripts.postinstall, undefined);
  assert.equal(packageJson.scripts.prepack, undefined);
});

test('vendored CI keeps the complete Release asset verifier wired in', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'vendor-tokscale.yml'), 'utf8');
  assert.match(workflow, /verify-release-assets:/);
  assert.match(workflow, /node scripts\/verify-vendored-tokscale-release\.js/);
  assert.match(workflow, /'scripts\/verify-vendored-tokscale-release\.js'/);
});
