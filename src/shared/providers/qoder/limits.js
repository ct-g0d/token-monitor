'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeLimitProvider } = require('../../limits/core');
const {
  cleanSecret,
  numberOrNull,
  toIso
} = require('../../limits/providerHelpers');
const { hashKey } = require('../../hashKey');
const { runWithProbeDeadline } = require('../../probeDeadline');
const { BROWSER_USER_AGENT } = require('../../browserUserAgent');

const QODER_FETCH_TIMEOUT_MS = 12_000;

function qoderCookie(env = process.env, options = {}) {
  const explicit = cleanSecret(options.qoderCookie);
  if (explicit) return explicit;
  for (const name of ['QODER_COOKIE', 'TOKEN_MONITOR_QODER_COOKIE']) {
    const raw = cleanSecret(env[name]);
    if (raw) return raw;
  }
  return '';
}

function qoderSite(options = {}, env = process.env) {
  const value = String(options.qoderSite || env.QODER_SITE || env.TOKEN_MONITOR_QODER_SITE || '').trim().toLowerCase();
  if (value === 'cn' || value === 'china' || value.includes('qoder.com.cn')) return 'cn';
  return 'global';
}

function qoderOrigin(site) {
  return site === 'cn' ? 'https://qoder.com.cn' : 'https://qoder.com';
}

function qoderUsageUrl(site = 'global') {
  return `${qoderOrigin(site)}/api/v2/me/usages/big_model_credits`;
}

function qoderUserPlanUrl(site = 'global') {
  return `${qoderOrigin(site)}/api/v1/me/userplan`;
}

function read(obj, camel, snake) {
  return obj?.[camel] ?? obj?.[snake];
}

function planText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw
    .replace(/^ORGANIZATION_PLAN_TIER_/i, 'PLAN_TIER_')
    .replace(/^PLAN_TIER_/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const known = {
    free: 'Community Edition',
    community: 'Community Edition',
    communityedition: 'Community Edition',
    'community edition': 'Community Edition',
    protrial: 'Pro Trial',
    'pro trial': 'Pro Trial',
    pro: 'Pro',
    proplus: 'Pro+',
    'pro plus': 'Pro+',
    'pro+': 'Pro+',
    ultra: 'Ultra',
    team: 'Teams',
    teams: 'Teams',
    enterprise: 'Enterprise'
  };
  if (known[normalized]) return known[normalized];
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\bpro\s+plus\b/i, 'Pro+')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function firstPlanLabel(source) {
  if (!source || typeof source !== 'object') return '';
  for (const field of [
    'plan_tier',
    'planTier',
    'plan',
    'tier',
    'name',
    'product_name',
    'productName',
    'subscription_type',
    'subscriptionType'
  ]) {
    const label = planText(source[field]);
    if (label) return label;
  }
  return '';
}

function parseQoderPlanLabel(body) {
  const direct = firstPlanLabel(body);
  if (direct) return direct;
  const data = body?.data;
  const dataLabel = firstPlanLabel(data);
  if (dataLabel) return dataLabel;
  const subscription = data?.subscription || body?.subscription || null;
  const subscriptionLabel = firstPlanLabel(subscription);
  if (subscriptionLabel) return subscriptionLabel;
  const current = data?.current || data?.currentPlan || data?.current_plan || body?.current || body?.currentPlan || body?.current_plan || null;
  return firstPlanLabel(current);
}

function quotaSummary(container) {
  return read(container, 'quotaSummary', 'quota_summary') || null;
}

function parseSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const used = numberOrNull(read(summary, 'usedValue', 'used_value'));
  const total = numberOrNull(read(summary, 'limitValue', 'limit_value'));
  const explicitRemaining = numberOrNull(read(summary, 'remainingValue', 'remaining_value'));
  if (used === null || total === null || used < 0 || total < 0) return null;
  const remaining = explicitRemaining === null ? Math.max(0, total - used) : Math.max(0, explicitRemaining);
  const explicitPercentage = numberOrNull(read(summary, 'usagePercentage', 'usage_percentage'));
  const usagePercentage = explicitPercentage === null && total > 0 ? (used / total) * 100 : explicitPercentage;
  return {
    used,
    total,
    remaining,
    usagePercentage: Math.max(0, Math.min(100, usagePercentage ?? (total === 0 ? 100 : 0))),
    unit: String(summary.unit || '').trim()
  };
}

function parseQoderUsage(body) {
  const payload = body?.data && typeof body.data === 'object' ? body.data : body;
  const total = parseSummary(quotaSummary(read(payload, 'totalQuota', 'total_quota')));
  if (!total) throw new Error('missing totalQuota.quotaSummary');
  const shared = parseSummary(quotaSummary(read(payload, 'sharedQuota', 'shared_quota')));
  const usedCredits = total.used + (shared?.used || 0);
  const totalCredits = total.total + (shared?.total || 0);
  const remainingCredits = total.remaining + (shared?.remaining || 0);
  const usagePercentage = totalCredits > 0 ? (usedCredits / totalCredits) * 100 : total.usagePercentage;
  const resetsAt = toIso(read(payload, 'nextResetAt', 'next_reset_at'));
  const window = {
    kind: 'billing',
    label: 'Credits',
    used: usedCredits,
    limit: totalCredits,
    remaining: remainingCredits,
    usedPercent: usagePercentage,
    remainingPercent: Math.max(0, Math.min(100, 100 - usagePercentage)),
    resetsAt,
    showMeter: true
  };
  return {
    usedCredits,
    totalCredits,
    remainingCredits,
    usagePercentage,
    unit: total.unit || shared?.unit || '',
    resetsAt,
    window
  };
}

function readQoderAppStatus(env = process.env, options = {}) {
  const home = options.homeDir || env.HOME || env.USERPROFILE || (env === process.env ? os.homedir() : '');
  const qoderDir = cleanSecret(env.QODER_HOME || env.QODER_DIR) || (home ? path.join(home, '.qoder') : '');
  if (!qoderDir && !home) return { detected: false, loggedIn: false, name: '', email: '', product: '' };

  if (qoderDir) {
    const statusFile = path.join(qoderDir, '.qoder-app-status.json');
    try {
      const raw = fs.readFileSync(statusFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          detected: true,
          loggedIn: parsed.logged_in !== false,
          name: String(parsed.name || '').trim(),
          email: String(parsed.email || '').trim(),
          product: String(parsed.product || 'qoder').trim()
        };
      }
    } catch (_) {}

    // Check auth user file
    try {
      const authFile = path.join(qoderDir, '.auth', 'user');
      if (fs.existsSync(authFile) && fs.statSync(authFile).size > 0) {
        return { detected: true, loggedIn: true, name: '', email: '', product: 'qoder' };
      }
    } catch (_) {}

    // Check .qoder directory presence
    try {
      if (fs.existsSync(qoderDir) && fs.statSync(qoderDir).isDirectory()) {
        return { detected: true, loggedIn: true, name: '', email: '', product: 'qoder' };
      }
    } catch (_) {}
  }

  if (home) {
    // Check .qoder-cli
    try {
      const cliDir = path.join(home, '.qoder-cli');
      if (fs.existsSync(cliDir) && fs.statSync(cliDir).isDirectory()) {
        return { detected: true, loggedIn: true, name: '', email: '', product: 'qoder' };
      }
    } catch (_) {}

    // Check .qoder-cn
    try {
      const cnDir = path.join(home, '.qoder-cn');
      if (fs.existsSync(cnDir) && fs.statSync(cnDir).isDirectory()) {
        return { detected: true, loggedIn: true, name: '', email: '', product: 'qoder' };
      }
    } catch (_) {}
  }

  return { detected: false, loggedIn: false, name: '', email: '', product: '' };
}

function resolveQoderAutomaticCredential(env = process.env, options = {}) {
  for (const name of ['QODER_COOKIE', 'TOKEN_MONITOR_QODER_COOKIE']) {
    if (cleanSecret(env[name])) return { source: 'env' };
  }
  const status = readQoderAppStatus(env, options);
  if (status.detected) {
    return {
      source: 'qoder-auto',
      accountLabel: status.name || status.email || 'Qoder User',
      email: status.email || '',
      loggedIn: status.loggedIn !== false,
      detected: true
    };
  }
  return { source: '' };
}

function fetchJsonWithDeadline(url, init, deps = {}) {
  const deadlineMs = Number(deps.qoderFetchTimeoutMs || deps.fetchTimeoutMs || QODER_FETCH_TIMEOUT_MS);
  return runWithProbeDeadline(
    async ({ signal }) => {
      const response = await (deps.fetch || fetch)(url, { ...init, signal });
      const body = response.ok ? await response.json() : null;
      return { response, body };
    },
    { signal: deps.signal, deadlineMs }
  );
}

async function fetchQoderLimits(options = {}, deps = {}) {
  const env = deps.env || process.env;
  const now = (deps.now || Date.now)();
  const updatedAt = new Date(now).toISOString();
  const cookie = qoderCookie(env, options);
  const site = qoderSite(options, env);
  if (!cookie) {
    const autoCred = resolveQoderAutomaticCredential(env, options);
    if (autoCred?.source === 'qoder-auto') {
      return normalizeLimitProvider({
        provider: 'qoder',
        accountKey: hashKey('qoder', autoCred.email || autoCred.accountLabel || 'auto'),
        accountLabel: autoCred.accountLabel || 'Qoder',
        accountEmail: autoCred.email || '',
        source: 'local',
        status: autoCred.loggedIn ? 'ok' : 'unauthorized',
        updatedAt,
        windows: [],
        region: site === 'cn' ? 'cn' : 'global'
      });
    }
    return normalizeLimitProvider({
      provider: 'qoder',
      source: 'web',
      status: 'notConfigured',
      updatedAt,
      windows: [],
      region: site === 'cn' ? 'cn' : 'global'
    });
  }
  const origin = qoderOrigin(site);
  const headers = {
    Cookie: cookie,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': BROWSER_USER_AGENT,
    Origin: origin,
    Referer: `${origin}/account/usage`,
    'X-Requested-With': 'XMLHttpRequest',
    'Bx-V': '2.5.35'
  };
  try {
    const { response, body } = await fetchJsonWithDeadline(qoderUsageUrl(site), {
      headers
    }, deps);
    if (!response.ok) {
      const error = new Error(`Qoder usage returned ${response.status}`);
      error.status = response.status === 401 || response.status === 403
        ? 'unauthorized'
        : response.status === 429 ? 'sourceRateLimited' : 'unavailable';
      throw error;
    }
    const usage = parseQoderUsage(body);
    let accountLabel = '';
    try {
      const { response: planResponse, body: planBody } = await fetchJsonWithDeadline(
        qoderUserPlanUrl(site),
        { headers },
        deps
      );
      if (planResponse.ok) accountLabel = parseQoderPlanLabel(planBody);
    } catch (_) {}
    return normalizeLimitProvider({
      provider: 'qoder',
      accountKey: hashKey('qoder', cookie),
      accountLabel,
      source: 'web',
      status: 'ok',
      updatedAt,
      windows: [usage.window],
      region: site === 'cn' ? 'cn' : 'global'
    });
  } catch (error) {
    return normalizeLimitProvider({
      provider: 'qoder',
      source: 'web',
      status: error?.status === 'timeout' ? 'unavailable' : error?.status || 'unavailable',
      updatedAt,
      windows: [],
      region: site === 'cn' ? 'cn' : 'global'
    });
  }
}

module.exports = {
  QODER_FETCH_TIMEOUT_MS,
  qoderCookie,
  qoderSite,
  qoderOrigin,
  qoderUsageUrl,
  qoderUserPlanUrl,
  parseQoderPlanLabel,
  parseQoderUsage,
  readQoderAppStatus,
  resolveQoderAutomaticCredential,
  fetchQoderLimits
};
