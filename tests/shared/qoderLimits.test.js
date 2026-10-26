'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  qoderCookie,
  qoderSite,
  qoderUsageUrl,
  qoderUserPlanUrl,
  parseQoderPlanLabel,
  parseQoderUsage,
  readQoderAppStatus,
  resolveQoderAutomaticCredential,
  fetchQoderLimits
} = require('../../src/shared/providers/qoder/limits');

test('qoderCookie reads settings before env and trims quoted cookies', () => {
  assert.equal(qoderCookie({ QODER_COOKIE: 'env-cookie' }, { qoderCookie: '  "settings-cookie"  ' }), 'settings-cookie');
  assert.equal(qoderCookie({ QODER_COOKIE: '  "env-cookie"  ' }), 'env-cookie');
  assert.equal(qoderCookie({ TOKEN_MONITOR_QODER_COOKIE: 'tm-cookie' }), 'tm-cookie');
  assert.equal(qoderCookie({}), '');
});

test('qoderSite maps global and China dashboard hosts', () => {
  assert.equal(qoderSite({ qoderSite: 'cn' }), 'cn');
  assert.equal(qoderSite({ qoderSite: 'china' }), 'cn');
  assert.equal(qoderSite({ qoderSite: 'https://qoder.com.cn/account/usage' }), 'cn');
  assert.equal(qoderSite({ qoderSite: 'global' }), 'global');
  assert.equal(qoderUsageUrl('cn'), 'https://qoder.com.cn/api/v2/me/usages/big_model_credits');
  assert.equal(qoderUserPlanUrl('cn'), 'https://qoder.com.cn/api/v1/me/userplan');
});

test('parseQoderPlanLabel maps official plan tiers to display labels', () => {
  assert.equal(parseQoderPlanLabel({ data: { plan_tier: 'PLAN_TIER_PRO_PLUS' } }), 'Pro+');
  assert.equal(parseQoderPlanLabel({ data: { subscription: { planTier: 'PLAN_TIER_ULTRA' } } }), 'Ultra');
  assert.equal(parseQoderPlanLabel({ plan_tier: 'PLAN_TIER_FREE' }), 'Community Edition');
  assert.equal(parseQoderPlanLabel({ data: { current_plan: { plan_tier: 'ORGANIZATION_PLAN_TIER_ENTERPRISE' } } }), 'Enterprise');
});

test('parseQoderUsage merges personal and shared big-model credit quotas', () => {
  const usage = parseQoderUsage({
    totalQuota: {
      quotaSummary: {
        usedValue: 25,
        limitValue: 100,
        remainingValue: 75,
        unit: 'credits'
      }
    },
    sharedQuota: {
      quotaSummary: {
        usedValue: 10,
        limitValue: 50,
        remainingValue: 40,
        unit: 'credits'
      }
    },
    nextResetAt: '2026-08-01T00:00:00Z'
  });

  assert.equal(usage.usedCredits, 35);
  assert.equal(usage.totalCredits, 150);
  assert.equal(usage.remainingCredits, 115);
  assert.equal(usage.usagePercentage, 35 / 150 * 100);
  assert.equal(usage.resetsAt, '2026-08-01T00:00:00.000Z');
  assert.equal(usage.window.kind, 'billing');
  assert.equal(usage.window.label, 'Credits');
});

test('parseQoderUsage accepts data-wrapped usage payloads', () => {
  const usage = parseQoderUsage({
    data: {
      total_quota: {
        quota_summary: {
          used_value: 42,
          limit_value: 100,
          remaining_value: 58,
          unit: 'credits'
        }
      },
      next_reset_at: 1780272000
    }
  });

  assert.equal(usage.usedCredits, 42);
  assert.equal(usage.totalCredits, 100);
  assert.equal(usage.remainingCredits, 58);
  assert.equal(usage.resetsAt, '2026-06-01T00:00:00.000Z');
});

test('fetchQoderLimits returns notConfigured without a cookie', async () => {
  const provider = await fetchQoderLimits({}, { env: {}, now: () => Date.parse('2026-07-06T00:00:00Z') });
  assert.equal(provider.provider, 'qoder');
  assert.equal(provider.source, 'web');
  assert.equal(provider.status, 'notConfigured');
});

test('fetchQoderLimits requests the selected site with the dashboard cookie', async () => {
  const requests = [];
  const provider = await fetchQoderLimits(
    { qoderCookie: 'session=abc', qoderSite: 'cn' },
    {
      env: {},
      now: () => Date.parse('2026-07-06T00:00:00Z'),
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        if (String(url).endsWith('/api/v1/me/userplan')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: { plan_tier: 'PLAN_TIER_PRO_PLUS' }
            })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            total_quota: {
              quota_summary: {
                used_value: 20,
                limit_value: 100,
                remaining_value: 80,
                usage_percentage: 20,
                unit: 'credits'
              }
            }
          })
        };
      }
    }
  );

  assert.equal(provider.status, 'ok');
  assert.equal(provider.region, 'cn');
  assert.equal(provider.accountLabel, 'Pro+');
  assert.equal(provider.windows.length, 1);
  assert.equal(requests[0].url, 'https://qoder.com.cn/api/v2/me/usages/big_model_credits');
  assert.equal(requests[1].url, 'https://qoder.com.cn/api/v1/me/userplan');
  assert.equal(requests[0].init.headers.Cookie, 'session=abc');
  assert.equal(requests[0].init.headers.Origin, 'https://qoder.com.cn');
});

test('fetchQoderLimits physically aborts a hung request within its configured bound', async () => {
  let signal;
  const provider = await fetchQoderLimits(
    { qoderCookie: 'session=hung' },
    {
      env: {},
      qoderFetchTimeoutMs: 5,
      fetch: async (_url, init) => {
        signal = init.signal;
        return new Promise(() => {});
      }
    }
  );

  assert.equal(provider.status, 'unavailable');
  assert.equal(signal.aborted, true);
});

test('fetchQoderLimits keeps the response body read inside the deadline', async () => {
  let signal;
  const provider = await fetchQoderLimits(
    { qoderCookie: 'session=hung-body' },
    {
      env: {},
      qoderFetchTimeoutMs: 5,
      fetch: async (_url, init) => {
        signal = init.signal;
        return {
          ok: true,
          status: 200,
          json: () => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          })
        };
      }
    }
  );

  assert.equal(provider.status, 'unavailable');
  assert.equal(signal.aborted, true);
});

test('readQoderAppStatus reads valid status file from .qoder directory', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-qoder-test-'));
  try {
    const qoderDir = path.join(tmpHome, '.qoder');
    fs.mkdirSync(qoderDir, { recursive: true });
    fs.writeFileSync(path.join(qoderDir, '.qoder-app-status.json'), JSON.stringify({
      logged_in: true,
      name: 'Alice Developer',
      email: 'alice@example.com',
      product: 'qoder-ide'
    }));

    const status = readQoderAppStatus({}, { homeDir: tmpHome });
    assert.equal(status.detected, true);
    assert.equal(status.loggedIn, true);
    assert.equal(status.name, 'Alice Developer');
    assert.equal(status.email, 'alice@example.com');
    assert.equal(status.product, 'qoder-ide');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('readQoderAppStatus handles invalid or corrupt json gracefully with fallback', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-qoder-test-'));
  try {
    const qoderDir = path.join(tmpHome, '.qoder');
    fs.mkdirSync(qoderDir, { recursive: true });
    fs.writeFileSync(path.join(qoderDir, '.qoder-app-status.json'), 'CORRUPTED JSON {{{{');

    // Since .qoder directory exists, it falls back to directory detection
    const status = readQoderAppStatus({}, { homeDir: tmpHome });
    assert.equal(status.detected, true);
    assert.equal(status.loggedIn, true);
    assert.equal(status.product, 'qoder');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('readQoderAppStatus returns not detected when files and directories are missing', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-qoder-test-'));
  try {
    const status = readQoderAppStatus({}, { homeDir: tmpHome });
    assert.equal(status.detected, false);
    assert.equal(status.loggedIn, false);
    assert.equal(status.name, '');
    assert.equal(status.email, '');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('readQoderAppStatus falls back to .auth/user, .qoder-cli, and .qoder-cn', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-qoder-test-'));
  try {
    // 1. .auth/user
    const authDir = path.join(tmpHome, '.qoder', '.auth');
    fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'user'), 'user-token-content');
    const authStatus = readQoderAppStatus({}, { homeDir: tmpHome });
    assert.equal(authStatus.detected, true);
    assert.equal(authStatus.loggedIn, true);

    fs.rmSync(path.join(tmpHome, '.qoder'), { recursive: true, force: true });

    // 2. .qoder-cli
    fs.mkdirSync(path.join(tmpHome, '.qoder-cli'), { recursive: true });
    const cliStatus = readQoderAppStatus({}, { homeDir: tmpHome });
    assert.equal(cliStatus.detected, true);

    fs.rmSync(path.join(tmpHome, '.qoder-cli'), { recursive: true, force: true });

    // 3. .qoder-cn
    fs.mkdirSync(path.join(tmpHome, '.qoder-cn'), { recursive: true });
    const cnStatus = readQoderAppStatus({}, { homeDir: tmpHome });
    assert.equal(cnStatus.detected, true);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('resolveQoderAutomaticCredential prioritizes env and detects local files with no-secret fallback', () => {
  // Env priority
  assert.deepEqual(resolveQoderAutomaticCredential({ QODER_COOKIE: 'cookie-val' }), { source: 'env' });
  assert.deepEqual(resolveQoderAutomaticCredential({ TOKEN_MONITOR_QODER_COOKIE: 'cookie-val' }), { source: 'env' });

  // No secret, missing files fallback
  const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-qoder-test-'));
  try {
    assert.deepEqual(resolveQoderAutomaticCredential({}, { homeDir: emptyHome }), { source: '' });

    // Local file detected with credentials
    const qoderDir = path.join(emptyHome, '.qoder');
    fs.mkdirSync(qoderDir, { recursive: true });
    fs.writeFileSync(path.join(qoderDir, '.qoder-app-status.json'), JSON.stringify({
      name: 'Bob',
      email: 'bob@example.com',
      logged_in: true
    }));

    const cred = resolveQoderAutomaticCredential({}, { homeDir: emptyHome });
    assert.equal(cred.source, 'qoder-auto');
    assert.equal(cred.accountLabel, 'Bob');
    assert.equal(cred.email, 'bob@example.com');
    assert.equal(cred.loggedIn, true);
    assert.equal(cred.detected, true);
  } finally {
    fs.rmSync(emptyHome, { recursive: true, force: true });
  }
});

test('fetchQoderLimits surfaces local status when auto-detected without cookie', async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-qoder-test-'));
  try {
    const qoderDir = path.join(tmpHome, '.qoder');
    fs.mkdirSync(qoderDir, { recursive: true });
    fs.writeFileSync(path.join(qoderDir, '.qoder-app-status.json'), JSON.stringify({
      name: 'Carol',
      email: 'carol@example.com',
      logged_in: true
    }));

    const provider = await fetchQoderLimits(
      { homeDir: tmpHome },
      { env: {}, now: () => Date.parse('2026-07-06T00:00:00Z') }
    );
    assert.equal(provider.provider, 'qoder');
    assert.equal(provider.source, 'local');
    assert.equal(provider.status, 'ok');
    assert.equal(provider.accountLabel, 'Carol');
    assert.equal(provider.accountEmail, 'carol@example.com');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});
