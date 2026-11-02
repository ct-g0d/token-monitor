'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const rootPackage = require('../../package.json');
const {
  referencedArtifactNames,
  verifyUpdaterArtifactNames
} = require('../../scripts/verify-updater-artifact-names');
const { resolveElectronVersionOverride } = require('../../scripts/electron-builder-version');
function extractReleaseNotes(value) {
  if (typeof value !== 'string' || !value.trim()) return {};
  const notes = {};
  for (const locale of ['en', 'zh', 'zh-TW', 'ko', 'ja']) {
    const startMarker = `<!-- app-update-notes:${locale}:start -->`;
    const endMarker = `<!-- app-update-notes:${locale}:end -->`;
    const start = value.indexOf(startMarker);
    if (start < 0) continue;
    const end = value.indexOf(endMarker, start + startMarker.length);
    if (end < 0) continue;
    const section = value.slice(start + startMarker.length, end);
    const groups = [];
    let current = null;
    for (const line of section.split(/\r?\n/)) {
      const heading = /^\s*###\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        if (current?.title && current.items.length > 0) groups.push(current);
        current = { title: heading[1].trim(), items: [] };
        continue;
      }
      const bullet = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
      if (bullet && current) current.items.push(bullet[1].trim());
    }
    if (current?.title && current.items.length > 0) groups.push(current);
    if (groups.length > 0) notes[locale] = groups;
  }
  return notes;
}

test('release artifact templates use GitHub-safe names', () => {
  const patterns = [
    rootPackage.build.linux.artifactName,
    rootPackage.build.nsis.artifactName,
    rootPackage.build.portable.artifactName
  ];
  assert.deepEqual(patterns, [
    'Token-Monitor-${version}.${ext}',
    'Token-Monitor-Setup-${version}.${ext}',
    'Token-Monitor-${version}.${ext}'
  ]);
  for (const pattern of patterns) assert.doesNotMatch(pattern, /\s/);
});

test('release body template carries every localized release-note section', () => {
  const releaseTemplate = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'RELEASE_TEMPLATE.md'), 'utf8');
  const notes = extractReleaseNotes(releaseTemplate);
  assert.deepEqual(Object.keys(notes), ['en', 'zh', 'zh-TW', 'ko', 'ja']);
  for (const locale of Object.keys(notes)) {
    assert.ok(notes[locale].length > 0, `${locale} has no release-note groups`);
    assert.ok(notes[locale].every((group) => group.items.length > 0), `${locale} has an empty release-note group`);
  }
});

test('release workflow contains only Windows and Linux artifact jobs', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'release.yml'), 'utf8');
  assert.doesNotMatch(workflow, /macOS|macos|darwin|Widget|latest-mac|\.dmg|\.zip/);
  assert.match(workflow, /target: win/);
  assert.match(workflow, /target: linux/);
});

test('release workflow uses the package Electron version on every platform', () => {
  assert.equal(rootPackage.devDependencies.electron, '45.1.0');
  assert.match(rootPackage.scripts['dist:linux'], /^npm run ensure:tokscale -- --platform=linux-x64 && electron-builder --config scripts\/electron-builder\.config\.js --linux --x64 --publish never$/);
  assert.equal(resolveElectronVersionOverride({}), undefined);
  assert.equal(resolveElectronVersionOverride({ TOKEN_MONITOR_ELECTRON_TARGET: 'linux', TOKEN_MONITOR_LINUX_ELECTRON_VERSION: '43.2.0' }), '43.2.0');
  assert.throws(() => resolveElectronVersionOverride({ TOKEN_MONITOR_LINUX_ELECTRON_VERSION: '43.2.0' }), /only valid for a Linux build/);
  const config = execFileSync(process.execPath, ['-e', "process.stdout.write(String(require('./scripts/electron-builder.config.js').electronVersion || ''))"], { cwd: path.join(__dirname, '..', '..'), env: { ...process.env, TOKEN_MONITOR_ELECTRON_TARGET: '', TOKEN_MONITOR_LINUX_ELECTRON_VERSION: '' } }).toString();
  assert.equal(config, '');
  const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(workflow, /- name: Verify Electron packaging version\s+run: \|\s+node -e /);
  assert.match(workflow, /require\('\.\/scripts\/electron-builder\.config\.js'\)/);
});

test('release icons use source assets without the legacy generator', () => {
  const projectRoot = path.join(__dirname, '..', '..');
  for (const iconSource of new Set([rootPackage.build.win.icon, rootPackage.build.linux.icon])) {
    assert.ok(fs.existsSync(path.join(projectRoot, iconSource)), `missing release icon source: ${iconSource}`);
  }
  assert.equal(rootPackage.scripts.icons, undefined);
  assert.equal(rootPackage.devDependencies['electron-icon-builder'], undefined);
});

test('extracts updater artifact names from url and path fields', () => {
  const names = referencedArtifactNames(['files:', '  - url: Token-Monitor-0.25.0.AppImage', 'path: "Token-Monitor-0.25.0.AppImage"'].join('\n'));
  assert.deepEqual(names, ['Token-Monitor-0.25.0.AppImage']);
});

test('fails when updater metadata references an asset that will not be uploaded', (t) => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-release-'));
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(distDir, 'latest.yml'), ['version: 0.25.0', 'files:', '  - url: Token-Monitor-0.25.0.exe', 'path: Token-Monitor-0.25.0.exe'].join('\n'));
  assert.throws(() => verifyUpdaterArtifactNames(distDir), /latest.yml -> Token-Monitor-0\.25\.0\.exe/);
  fs.writeFileSync(path.join(distDir, 'Token-Monitor-0.25.0.exe'), 'artifact');
  assert.deepEqual(verifyUpdaterArtifactNames(distDir), { metadataFiles: ['latest.yml'] });
});
