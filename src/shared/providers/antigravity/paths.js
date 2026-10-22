'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function expandHomePath(value, homeDir) {
  const raw = String(value || '');
  if (raw === '~') return homeDir;
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return path.join(homeDir, raw.slice(2));
  return raw;
}

function dirContains(root, leaf) {
  if (!root || !leaf) return false;
  const rel = path.relative(root, leaf);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function discoverAntigravityAcpRoots(options = {}) {
  // Respect explicit test opt-out
  if (options.discoverAcp === false) return [];
  const platform = options.platform || process.platform;
  const isHost = platform === process.platform;
  const home = options.homeDir || options.home || (isHost ? os.homedir() : '');
  const env = options.env || (isHost ? process.env : {});
  if (!home && !env.GEMINI_HOME && !env.GEMINI_CLI_HOME) return [];

  const roots = [];

  // 1. GEMINI_HOME or GEMINI_CLI_HOME environment variables
  const configuredGemini = env.GEMINI_HOME || env.GEMINI_CLI_HOME;
  if (configuredGemini) {
    const base = path.resolve(expandHomePath(configuredGemini, home || os.homedir()));
    // Inherited host env vars must stay within the active home unless explicitly passed in options.env
    const allowed = options.env ? true : (!home || dirContains(home, base));
    if (allowed) {
      for (const sub of ['antigravity-acp/conversations', 'antigravity-cli/conversations', 'conversations']) {
        const p = path.join(base, ...sub.split('/'));
        try {
          if (fs.existsSync(p) && fs.statSync(p).isDirectory()) roots.push(p);
        } catch (_) {}
      }
    }
  }

  // 2. T3 user data providers directory: ~/.t3/userdata/providers/antigravity/*/antigravity-acp/conversations
  if (home) {
    const configuredT3 = env.T3CODE_HOME;
    const t3Home = configuredT3 ? path.resolve(expandHomePath(configuredT3, home)) : path.join(home, '.t3');
    const allowedT3 = options.env ? true : dirContains(home, t3Home);
    if (allowedT3) {
      const t3Providers = path.join(t3Home, 'userdata', 'providers', 'antigravity');
      try {
        if (fs.existsSync(t3Providers) && fs.statSync(t3Providers).isDirectory()) {
          const entries = fs.readdirSync(t3Providers, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const conv = path.join(t3Providers, entry.name, 'antigravity-acp', 'conversations');
              if (fs.existsSync(conv) && fs.statSync(conv).isDirectory()) roots.push(conv);
            }
          }
        }
      } catch (_) {}
    }
  }

  return [...new Set(roots)];
}

module.exports = {
  discoverAntigravityAcpRoots
};
