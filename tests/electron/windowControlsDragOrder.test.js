'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..', '..');

function readUiSource(name) {
  return fs.readFileSync(path.join(repoRoot, 't3_app_ui', 'src', name), 'utf8');
}

// Chromium walks drag regions in DOM order and a later `drag` element overrides
// an earlier overlapping `no-drag` one. PageHeader is a drag region, so rendering
// the window controls before <main> hands the top-right corner back to the page
// header and the buttons stop receiving clicks.
test('window controls render after the page content that also drags the window', () => {
  const app = readUiSource('App.tsx');
  const controls = app.indexOf('<WindowControls');
  const main = app.indexOf('</main>');

  assert.notEqual(controls, -1, 'App.tsx should render WindowControls');
  assert.notEqual(main, -1, 'App.tsx should render main');
  assert.ok(
    controls > main,
    'the window controls overlay must come after </main> so no page drag region overrides its no-drag buttons',
  );
});
