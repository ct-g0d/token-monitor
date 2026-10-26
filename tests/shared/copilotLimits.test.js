'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  copilotToken,
  normalizedEnterpriseHost,
  copilotApiHost,
  copilotUsageUrl,
  parseQuotaSnapshot,
  isPlaceholder,
  parseCopilotUsageResponse,
  parseQuotaResetDate,
  mapCopilotUsageToProvider,
  readCopilotLocalCredentials,
  resolveCopilotAutomaticCredential,
  fetchCopilotLimits
} = require('../../src/shared/providers/copilot/limits');
const { parseLimitProviders } = require('../../src/shared/limits/collector');

test('parseLimitProviders includes Copilot in the default provider set', () => {
  assert.ok(parseLimitProviders().includes('copilot'));
});

test('copilotToken prefers explicit settings over env', () => {
  assert.equal(copilotToken({ COPILOT_API_TOKEN: 'env-token' }, { copilotApiToken: 'settings-token' }), 'settings-token');
  assert.equal(copilotToken({ COPILOT_API_TOKEN: 'env-token' }), 'env-token');
});

test('copilotToken accepts CodexBar-compatible Copilot env names only', () => {
  assert.equal(copilotToken({ GITHUB_COPILOT_TOKEN: '  "gho-copilot"  ' }), 'gho-copilot');
  assert.equal(copilotToken({ GITHUB_TOKEN: 'gho-generic' }), '');
});

test('normalizedEnterpriseHost accepts hostnames and URLs', () => {
  assert.equal(normalizedEnterpriseHost(''), 'github.com');
  assert.equal(normalizedEnterpriseHost('https://octocorp.ghe.com/login'), 'octocorp.ghe.com');
  assert.equal(copilotApiHost('octocorp.ghe.com'), 'api.octocorp.ghe.com');
  assert.equal(copilotUsageUrl('octocorp.ghe.com'), 'https://api.octocorp.ghe.com/copilot_internal/user');
});

test('parseQuotaSnapshot derives percent remaining from entitlement and remaining', () => {
  const snapshot = parseQuotaSnapshot({
    entitlement: 500,
    remaining: 450,
    quota_id: 'premium_interactions'
  });
  assert.equal(snapshot.percentRemaining, 90);
  assert.equal(snapshot.hasPercentRemaining, true);
});

test('isPlaceholder drops zero-entitlement business billing placeholders', () => {
  const snapshot = parseQuotaSnapshot({
    entitlement: 0,
    remaining: 0,
    percent_remaining: 100,
    quota_id: 'premium_interactions'
  });
  assert.equal(isPlaceholder(snapshot), true);
});

test('parseCopilotUsageResponse maps premium and chat windows', () => {
  const usage = parseCopilotUsageResponse({
    copilot_plan: 'pro',
    quota_reset_date: '2026-07-01',
    quota_snapshots: {
      premium_interactions: {
        entitlement: 500,
        remaining: 400,
        percent_remaining: 80,
        quota_id: 'premium_interactions'
      },
      chat: {
        entitlement: 300,
        remaining: 150,
        percent_remaining: 50,
        quota_id: 'chat'
      }
    }
  });
  assert.equal(usage.copilotPlan, 'pro');
  assert.equal(usage.premium.remaining, 400);
  assert.equal(usage.chat.remaining, 150);
});

test('parseCopilotUsageResponse falls back to monthly and limited quotas', () => {
  const usage = parseCopilotUsageResponse({
    copilot_plan: 'free',
    monthly_quotas: { chat: 500, completions: 300 },
    limited_user_quotas: { chat: 125, completions: 60 }
  });
  assert.equal(usage.chat.percentRemaining, 25);
  assert.equal(usage.premium.percentRemaining, 20);
});

test('parseCopilotUsageResponse keeps unlimited chat quotas', () => {
  const usage = parseCopilotUsageResponse({
    copilot_plan: 'individual',
    quota_snapshots: {
      chat_messages: {
        entitlement: 0,
        remaining: 0,
        percent_remaining: 100,
        quota_id: 'chat_messages',
        unlimited: true
      }
    }
  });
  assert.equal(usage.chat.unlimited, true);
  assert.equal(usage.chat.percentRemaining, 100);
});

test('mapCopilotUsageToProvider renders Premium and Chat windows', () => {
  const provider = mapCopilotUsageToProvider({
    premium: parseQuotaSnapshot({
      entitlement: 500,
      remaining: 400,
      percent_remaining: 80,
      quota_id: 'premium_interactions'
    }),
    chat: parseQuotaSnapshot({
      entitlement: 300,
      remaining: 150,
      percent_remaining: 50,
      quota_id: 'chat'
    }),
    copilotPlan: 'pro',
    tokenBasedBilling: false,
    quotaResetDate: '2026-07-01'
  }, {
    accountKey: 'sha256:test',
    updatedAt: '2026-06-25T00:00:00.000Z',
    source: 'api'
  });

  assert.equal(provider.provider, 'copilot');
  assert.equal(provider.status, 'ok');
  assert.equal(provider.accountLabel, 'Pro');
  assert.equal(provider.windows.length, 2);
  assert.equal(provider.windows[0].kind, 'billing');
  assert.equal(provider.windows[0].label, 'Premium');
  assert.equal(provider.windows[0].usedPercent, 20);
  assert.equal(provider.windows[1].kind, 'billing');
  assert.equal(provider.windows[1].label, 'Chat');
  assert.equal(provider.windows[1].usedPercent, 50);
  assert.equal(parseQuotaResetDate('2026-07-01'), provider.windows[0].resetsAt);
});

test('mapCopilotUsageToProvider marks token-based billing without quotas unavailable', () => {
  const provider = mapCopilotUsageToProvider({
    premium: null,
    chat: null,
    copilotPlan: 'business',
    tokenBasedBilling: true,
    quotaResetDate: null
  }, { updatedAt: '2026-06-25T00:00:00.000Z' });
  assert.equal(provider.status, 'unavailable');
  assert.equal(provider.accountLabel, 'Business');
  assert.deepEqual(provider.windows, []);
});

test('fetchCopilotLimits returns notConfigured without a token', async () => {
  const provider = await fetchCopilotLimits({}, { env: {}, now: () => Date.parse('2026-06-25T00:00:00.000Z') });
  assert.equal(provider.provider, 'copilot');
  assert.equal(provider.status, 'notConfigured');
});

test('fetchCopilotLimits uses the GitHub OAuth token directly for Copilot internal usage', async () => {
  const authorizations = [];
  const provider = await fetchCopilotLimits(
    { copilotApiToken: 'gho-token' },
    {
      env: {},
      now: () => Date.parse('2026-06-25T00:00:00.000Z'),
      fetch: async (url, init) => {
        authorizations.push(init.headers.Authorization);
        if (String(url).includes('/copilot_internal/user')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              copilot_plan: 'free',
              quota_reset_date: '2026-07-01',
              quota_snapshots: {
                premium_interactions: {
                  entitlement: 500,
                  remaining: 450,
                  percent_remaining: 90,
                  quota_id: 'premium_interactions'
                },
                chat: {
                  entitlement: 300,
                  remaining: 150,
                  percent_remaining: 50,
                  quota_id: 'chat'
                }
              }
            })
          };
        }
        if (String(url) === 'https://api.github.com/user') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ login: 'octocat', id: 42 })
          };
        }
        throw new Error(`unexpected fetch url: ${url}`);
      }
    }
  );

  assert.equal(provider.status, 'ok');
  assert.equal(provider.accountName, 'octocat');
  assert.equal(provider.accountLabel, 'Free');
  assert.equal(provider.accountEmail, '');
  assert.equal(provider.windows.length, 2);
  assert.equal(provider.windows[0].usedPercent, 10);
  assert.equal(provider.windows[1].usedPercent, 50);
  assert.equal(authorizations[0], 'token gho-token');
  assert.equal(authorizations[1], 'token gho-token');
});

test('fetchCopilotLimits surfaces unauthorized responses', async () => {
  const provider = await fetchCopilotLimits(
    { copilotApiToken: 'bad-token' },
    {
      env: {},
      now: () => Date.parse('2026-06-25T00:00:00.000Z'),
      fetch: async () => ({
        ok: false,
        status: 401,
        json: async () => ({})
      })
    }
  );
  assert.equal(provider.status, 'unauthorized');
});

// The fetch timeout has to stay armed while the body is read, otherwise a response whose
// head arrives and whose body never does is unbounded by it.
test('fetchCopilotLimits bounds a body that stalls after the headers', { timeout: 5000 }, async () => {
  const provider = await fetchCopilotLimits(
    { copilotApiToken: 'gho-token' },
    {
      env: {},
      now: () => Date.parse('2026-06-25T00:00:00.000Z'),
      fetchTimeoutMs: 10,
      fetch: async (_url, init) => ({
        ok: true,
        status: 200,
        json: () => new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        })
      })
    }
  );
  assert.equal(provider.status, 'unavailable');
});

test('readCopilotLocalCredentials extracts credentials from hosts.json', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-copilot-test-'));
  try {
    const cfgDir = path.join(tmpHome, '.config', 'github-copilot');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'hosts.json'), JSON.stringify({
      'github.com': {
        user: 'monalisa',
        oauth_token: 'gho_secret123456'
      }
    }));

    const result = readCopilotLocalCredentials({}, { homeDir: tmpHome, platform: 'linux' });
    assert.equal(result.detected, true);
    assert.equal(result.source, 'hosts.json');
    assert.equal(result.user, 'monalisa');
    assert.equal(result.token, 'gho_secret123456');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('readCopilotLocalCredentials extracts credentials from hosts.yml', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-copilot-test-'));
  try {
    const ghDir = path.join(tmpHome, '.config', 'gh');
    fs.mkdirSync(ghDir, { recursive: true });
    fs.writeFileSync(path.join(ghDir, 'hosts.yml'), 'github.com:\n  user: octocat\n  oauth_token: gho_ghcli999\n');

    const result = readCopilotLocalCredentials({}, { homeDir: tmpHome, platform: 'linux' });
    assert.equal(result.detected, true);
    assert.equal(result.source, 'gh-cli');
    assert.equal(result.user, 'octocat');
    assert.equal(result.token, 'gho_ghcli999');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('readCopilotLocalCredentials handles corrupt or invalid json/yaml gracefully', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-copilot-test-'));
  try {
    const cfgDir = path.join(tmpHome, '.config', 'github-copilot');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'hosts.json'), '{not json at all!!!');

    const ghDir = path.join(tmpHome, '.config', 'gh');
    fs.mkdirSync(ghDir, { recursive: true });
    fs.writeFileSync(path.join(ghDir, 'hosts.yml'), 'random content without tokens');

    const result = readCopilotLocalCredentials({}, { homeDir: tmpHome, platform: 'linux' });
    assert.equal(result.detected, false);
    assert.equal(result.token, '');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('readCopilotLocalCredentials supports no-secret directory fallback', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-copilot-test-'));
  try {
    const copilotDir = path.join(tmpHome, '.copilot');
    fs.mkdirSync(copilotDir, { recursive: true });

    const result = readCopilotLocalCredentials({}, { homeDir: tmpHome, platform: 'linux' });
    assert.equal(result.detected, true);
    assert.equal(result.source, 'copilot-dir');
    assert.equal(result.token, '');
    assert.equal(result.user, '');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('readCopilotLocalCredentials returns empty when files and directories are missing', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-copilot-test-'));
  try {
    const result = readCopilotLocalCredentials({}, { homeDir: tmpHome, platform: 'linux' });
    assert.equal(result.detected, false);
    assert.equal(result.source, '');
    assert.equal(result.token, '');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('resolveCopilotAutomaticCredential prioritizes env and detects local files with no-secret fallback', () => {
  // Env priority
  assert.deepEqual(resolveCopilotAutomaticCredential({ COPILOT_API_TOKEN: 'token-abc' }), { source: 'env' });
  assert.deepEqual(resolveCopilotAutomaticCredential({ GITHUB_COPILOT_TOKEN: 'token-gho' }), { source: 'env' });

  // Missing files fallback
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-copilot-test-'));
  try {
    assert.deepEqual(resolveCopilotAutomaticCredential({}, { homeDir: emptyHome, platform: 'linux' }), { source: '' });

    // Local file with token
    const cfgDir = path.join(emptyHome, '.config', 'github-copilot');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'hosts.json'), JSON.stringify({
      'github.com': { user: 'hubot', oauth_token: 'gho_hubot' }
    }));
    assert.deepEqual(resolveCopilotAutomaticCredential({}, { homeDir: emptyHome, platform: 'linux' }), {
      source: 'copilot-auto',
      user: 'hubot',
      hasToken: true,
      detected: true
    });

    // Clean config dir, add .copilot directory only (no-secret fallback)
    fs.rmSync(path.join(emptyHome, '.config'), { recursive: true, force: true });
    fs.mkdirSync(path.join(emptyHome, '.copilot'), { recursive: true });
    assert.deepEqual(resolveCopilotAutomaticCredential({}, { homeDir: emptyHome, platform: 'linux' }), {
      source: 'copilot-auto',
      user: '',
      hasToken: false,
      detected: true
    });
  } finally {
    fs.rmSync(emptyHome, { recursive: true, force: true });
  }
});

test('fetchCopilotLimits surfaces local status when auto-detected without token', async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-copilot-test-'));
  try {
    const copilotDir = path.join(tmpHome, '.copilot');
    fs.mkdirSync(copilotDir, { recursive: true });

    const provider = await fetchCopilotLimits(
      { homeDir: tmpHome, platform: 'linux' },
      { env: {}, now: () => Date.parse('2026-06-25T00:00:00.000Z') }
    );
    assert.equal(provider.provider, 'copilot');
    assert.equal(provider.source, 'local');
    assert.equal(provider.status, 'ok');
    assert.equal(provider.accountLabel, 'GitHub Copilot');
    assert.deepEqual(provider.windows, []);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});
