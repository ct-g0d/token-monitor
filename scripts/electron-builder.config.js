'use strict';

const packageJson = require('../package.json');
const { createBuilderConfig } = require('./macos-packaging');
const { resolveElectronVersionOverride } = require('./electron-builder-version');

// electron-builder downloads the framework selected by this top-level option.
// The release workflow sets the override only for the Linux artifact, so macOS
// and Windows continue to use the package.json Electron version.
const electronVersion = resolveElectronVersionOverride();

const baseConfig = {
  ...packageJson.build,
  ...(electronVersion ? { electronVersion } : {})
};

// When building Windows targets in an environment without a code signing certificate,
// omit signtoolOptions and verifyUpdateCodeSignature to allow local/packaging builds to succeed.
if (process.platform === 'win32' && !process.env.SIGNPATH_API_TOKEN && !process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
  if (baseConfig.win) {
    baseConfig.win = { ...baseConfig.win };
    delete baseConfig.win.signtoolOptions;
    delete baseConfig.win.verifyUpdateCodeSignature;
  }
}

module.exports = createBuilderConfig({
  baseConfig
});
