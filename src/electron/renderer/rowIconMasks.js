'use strict';

// Installs the `.row-icon-<id>` rules from the vendor presentation table, so a
// mark added there needs no stylesheet edit. styles.css keeps the sizing
// (`.row-icon`, `.limit-icon`) and the few masks that are not vendor marks.
//
// Two kinds of rule come out of the table: a mask for the marks that are a
// single ink, and the artwork itself for the marks in COLOUR_MARKS, which carry
// a fill of their own that a mask would throw away.
//
// The rules go into their own adopted stylesheet. Adopted sheets cascade after
// the document's, which is what lets the painted rules replace the
// `background-color: currentColor` that styles.css puts under a mask and the
// `background` shorthand `.home-list-mark` sets. The one stylesheet rule that
// overrides a vendor mask (`.limit-icon.row-icon-grok`) is more specific than a
// single class. Load after vendorPresentation.js and before any script that
// paints a mark.
(function exposeRowIconMasks(root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('../../shared/vendorPresentation') : root?.TokenMonitorVendorPresentation);
  if (node) module.exports = api;
  if (root) {
    root.TokenMonitorRowIconMasks = api;
    // Resolved against this script rather than the page, because the edge dock
    // loads it from a subdirectory. It sits beside styles.css, so the relative
    // path is the one the stylesheet used.
    const script = root.document?.currentScript;
    if (script && root.CSSStyleSheet) {
      api.installRowIconMasks(root.document, new URL('../../../assets/icons/', script.src).href);
    }
  }
})(typeof window !== 'undefined' ? window : null, function createRowIconMasksApi(vendorPresentation) {
  const painted = new Set(vendorPresentation.COLOUR_MARKS);

  // Quoted, because the installed sheet passes an absolute file:// URL and a
  // Windows install path may contain parentheses (C:\Program Files (x86)).
  // An unquoted url() token ends at the first `)`, so the declaration — and
  // with it the whole rule — is invalid CSS and gets dropped, leaving the
  // mark as a solid currentColor square. Ids and file stems stay unquoted:
  // they are [a-z0-9-] (vendorPresentation.test.js).
  function urlFor(iconBaseUrl, file) {
    return `${iconBaseUrl}${file}.svg`.replace(/["\\]/g, '\\$&');
  }

  function rowIconMaskRules(iconBaseUrl) {
    return Object.entries(vendorPresentation.ROW_ICON_MASKS)
      .filter(([id]) => !painted.has(id))
      .map(([id, file]) => {
        const url = urlFor(iconBaseUrl, file);
        return `.row-icon-${id} { -webkit-mask-image: url("${url}"); mask-image: url("${url}"); }`;
      })
      .join('\n');
  }

  function rowIconColourRules(iconBaseUrl) {
    return Object.entries(vendorPresentation.ROW_ICON_MASKS)
      .filter(([id]) => painted.has(id))
      .map(([id, file]) => {
        const url = urlFor(iconBaseUrl, file);
        return `.row-icon-${id} { -webkit-mask-image: none; mask-image: none; background: transparent url("${url}") center / contain no-repeat; }`;
      })
      .join('\n');
  }

  function installRowIconMasks(document, iconBaseUrl) {
    const sheet = new document.defaultView.CSSStyleSheet();
    sheet.replaceSync([rowIconMaskRules(iconBaseUrl), rowIconColourRules(iconBaseUrl)].filter(Boolean).join('\n'));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    return sheet;
  }

  return { installRowIconMasks, rowIconColourRules, rowIconMaskRules };
});
