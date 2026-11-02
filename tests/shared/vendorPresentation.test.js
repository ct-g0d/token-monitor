'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  COLOUR_MARKS,
  DEFAULT_VENDOR_COLOR,
  MARK_IDS,
  ROW_ICON_MASKS,
  VENDOR_IDS,
  VENDOR_LABELS,
  VENDOR_PRESENTATION,
  trayIconFile,
  vendorColors,
  widgetVendorPalette
} = require('../../src/shared/vendorPresentation');
const { rowIconColourRules, rowIconMaskRules } = require('../../src/electron/renderer/rowIconMasks');

const iconsDir = path.join(__dirname, '..', '..', 'assets', 'icons');
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

test('each mark id appears once and names only safe characters', () => {
  // rowIconMasks.js writes ids and file stems into CSS unquoted.
  assert.equal(new Set(MARK_IDS).size, MARK_IDS.length, 'duplicate vendor entries');
  for (const entry of VENDOR_PRESENTATION) {
    for (const value of [entry.id, entry.icon, entry.mask, entry.trayIcon].filter(Boolean)) {
      assert.match(value, /^[a-z0-9-]+$/, `${entry.id}: ${value}`);
    }
  }
});

test('every artwork file an entry names exists', () => {
  for (const entry of VENDOR_PRESENTATION) {
    for (const file of new Set([ROW_ICON_MASKS[entry.id], trayIconFile(entry.id), entry.icon || entry.id])) {
      assert.ok(fs.existsSync(path.join(iconsDir, `${file}.svg`)), `${entry.id} needs assets/icons/${file}.svg`);
    }
  }
});

test('every coloured vendor has a label, from the catalog or its own entry', () => {
  for (const id of VENDOR_IDS) {
    assert.ok(VENDOR_LABELS[id], `${id} needs a label: add it to the entry, or it is not a catalog client`);
  }
  assert.equal(VENDOR_LABELS.default, 'Default');
});

test('the widget fields say something the brand colour does not', () => {
  for (const entry of VENDOR_PRESENTATION) {
    if (entry.color) assert.match(entry.color, HEX, `${entry.id} color`);
    if (entry.widgetColor) {
      assert.match(entry.widgetColor, HEX, `${entry.id} widgetColor`);
      assert.notEqual(entry.widgetColor.toLowerCase(), entry.color?.toLowerCase(), `${entry.id}: drop a widgetColor equal to color`);
    }
    assert.ok(!(entry.widgetInk && entry.widgetColor), `${entry.id}: widgetInk and widgetColor contradict`);
  }
});

test('vendorColors hands out a fresh map with the default last', () => {
  const first = vendorColors();
  first.claude = '#123456';
  const second = vendorColors();
  assert.notEqual(second.claude, '#123456', 'overrides applied to one copy must not leak into the next');
  assert.deepEqual(Object.keys(second), [...VENDOR_IDS, 'default']);
  assert.equal(second.default, DEFAULT_VENDOR_COLOR);
});

test('the widget palette omits entries that restate the defaults', () => {
  const palette = widgetVendorPalette();
  assert.deepEqual(palette.default, { color: DEFAULT_VENDOR_COLOR });
  assert.equal(palette.newapi, undefined);
  assert.deepEqual(palette.grok, { ink: true });
  assert.deepEqual(palette.hermes, { color: '#d4af37', icon: 'hermes-agent' });
});

test('every mark is either masked or painted, never both', () => {
  const masks = rowIconMaskRules('../../../assets/icons/').split('\n');
  const painted = rowIconColourRules('../../../assets/icons/').split('\n');
  assert.equal(masks.length + painted.length, MARK_IDS.length);
  assert.equal(painted.length, COLOUR_MARKS.length);
  assert.ok(masks.includes('.row-icon-grok { -webkit-mask-image: url("../../../assets/icons/xai.svg"); mask-image: url("../../../assets/icons/xai.svg"); }'));
  assert.ok(painted.includes('.row-icon-claude { -webkit-mask-image: none; mask-image: none; background: transparent url("../../../assets/icons/claude.svg") center / contain no-repeat; }'));
});

test('the painted marks are exactly the artwork that has a colour of its own', () => {
  // White ink on a stripped tile: legible only as an ink, so it stays masked
  // until a dark-surface variant exists. Everything else that is not painted
  // must be drawn in currentColor, or it silently loses its colour.
  const whiteInk = new Set(['kimi', 'pi', 'proma', 'catpaw']);
  const artwork = (id) => fs.readFileSync(path.join(iconsDir, `${ROW_ICON_MASKS[id]}.svg`), 'utf8');
  for (const id of COLOUR_MARKS) {
    assert.ok(!/currentcolor/i.test(artwork(id)), `${id} is painted but its artwork uses currentColor`);
  }
  for (const id of MARK_IDS) {
    if (COLOUR_MARKS.includes(id) || /currentcolor/i.test(artwork(id))) continue;
    assert.ok(whiteInk.has(id), `${id} names artwork with its own colour: put it in COLOUR_MARKS, or explain why it must stay a mask`);
  }
});

test('a mask url survives an install path with parentheses', () => {
  // A Windows install under `C:\Program Files (x86)` makes the base URL contain
  // a literal `(`: `new URL()` does not percent-encode parentheses. The url()
  // token has to be quoted, or the token ends at that `)`, the declaration is
  // invalid CSS and every vendor mark degrades to a solid currentColor square.
  const base = 'file:///C:/Program%20Files%20(x86)/Token%20Monitor/resources/app.asar/assets/icons/';
  const masks = rowIconMaskRules(base).split('\n');
  const painted = rowIconColourRules(base).split('\n');
  assert.equal(masks.length + painted.length, MARK_IDS.length);
  assert.ok(
    masks.includes(`.row-icon-grok { -webkit-mask-image: url("${base}xai.svg"); mask-image: url("${base}xai.svg"); }`)
  );
  for (const rule of masks) {
    // Exactly the two quoted url() tokens, each containing no bare `)`.
    assert.match(rule, /^\.row-icon-[a-z0-9-]+ \{ -webkit-mask-image: url\("([^"\\]|\\.)*"\); mask-image: url\("([^"\\]|\\.)*"\); \}$/);
  }
  for (const rule of painted) {
    assert.match(rule, /^\.row-icon-[a-z0-9-]+ \{ -webkit-mask-image: none; mask-image: none; background: transparent url\("([^"\\]|\\.)*"\) center \/ contain no-repeat; \}$/);
  }
});

test('a mask url escapes quotes and backslashes in the base', () => {
  // A POSIX install path can contain `"` or `\`; either would end the quoted
  // url() token early (and `\` escapes whatever follows it).
  const quoted = rowIconMaskRules('file:///tmp/a"b/assets/icons/').split('\n')[0];
  assert.equal((quoted.match(/[^\\]"/g) || []).length, 4, quoted);
  assert.ok(quoted.includes(String.raw`a\"b`), quoted);
  const slashed = rowIconMaskRules(String.raw`file:///tmp/a\b/assets/icons/`).split('\n')[0];
  assert.ok(slashed.includes(String.raw`a\\b`), slashed);
});
