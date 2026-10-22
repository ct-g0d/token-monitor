'use strict';

const { extractUsageFromTokscale } = require('../../usage');
const { localDayKey, normalizeTokscaleClientName, sumTokens } = require('../../history');
const { discoverAntigravityRoots, makeAntigravityUsageCache, readAntigravityUsage } = require('./conversationReader');

function isAntigravityClient(row) {
  return normalizeTokscaleClientName(row?.client) === 'antigravity';
}

function antigravityTokens(clients) {
  return clients.filter(isAntigravityClient).reduce((total, row) => total + sumTokens(row.tokens, row.client), 0);
}

// Tokscale's retained days and this reader describe overlapping conversations,
// so adding them counts the same tokens twice. Each day keeps the larger of the
// two antigravity readings, the same per-client, per-day rule the ledger overlay uses.
function mergeAntigravityGraph(graph, readerGraph) {
  const readerDays = new Map((readerGraph?.contributions || []).map((row) => [row.date, row]));
  if (readerDays.size === 0) return graph;
  const retainedDays = new Map((graph?.contributions || []).map((row) => [row.date, row]));
  const contributions = [...new Set([...retainedDays.keys(), ...readerDays.keys()])].sort().map((date) => {
    const base = retainedDays.get(date) || { date, activeTimeMs: 0, clients: [] };
    const baseClients = base.clients || [];
    const readerClients = (readerDays.get(date)?.clients || []).filter(isAntigravityClient);
    if (antigravityTokens(readerClients) <= antigravityTokens(baseClients)) return base;
    return { ...base, clients: [...baseClients.filter((row) => !isAntigravityClient(row)), ...readerClients] };
  });
  return { ...graph, contributions };
}

function buildAntigravityUsageView(records, options = {}) {
  const now = new Date(options.now || Date.now());
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const since = Date.parse(options.allTimeSince || '') || 0;

  const reportedSessionIds = new Set();
  if (Array.isArray(options.reportedSessionIds)) {
    for (const id of options.reportedSessionIds) {
      if (id) reportedSessionIds.add(String(id).toLowerCase());
    }
  }
  const nativeSessions = options.nativeSessions || options.nativePeriod?.sessions || {};
  for (const session of Object.values(nativeSessions)) {
    const client = session.client;
    if (client === 'antigravity' || client === 'antigravity-cli' || client === 'antigravity-extension') {
      if (session.sessionId) reportedSessionIds.add(String(session.sessionId).toLowerCase());
    }
  }

  const readerSessionIds = new Set();
  for (const record of records) {
    if (record.sessionId) readerSessionIds.add(String(record.sessionId).toLowerCase());
  }

  const entries = [];
  const days = new Map();
  const sessionKeys = new Set();

  function addClientTokensToDay(date, modelId, tokens, cost = 0, messages = 1) {
    if (!days.has(date)) days.set(date, { date, clients: [] });
    const day = days.get(date);
    let model = day.clients.find((item) => item.modelId === modelId);
    if (!model) {
      model = {
        client: 'antigravity',
        modelId,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
        cost: 0,
        messages: 0
      };
      day.clients.push(model);
    }
    model.tokens.input += (tokens.input || 0);
    model.tokens.output += (tokens.output || 0);
    model.tokens.cacheRead += (tokens.cacheRead || 0);
    model.tokens.cacheWrite += (tokens.cacheWrite || 0);
    model.tokens.reasoning += (tokens.reasoning || 0);
    model.cost += cost;
    model.messages += messages;
  }

  for (const record of records) {
    const at = record.timestampMs;
    if (!Number.isFinite(at) || at > now.getTime()) continue;

    const uncachedIn = record.totals?.uncachedInputTokens || 0;
    const cachedIn = record.totals?.cachedInputTokens || 0;
    const cacheWrite = record.totals?.cacheCreationTokens || 0;
    const totalOut = record.totals?.outputTokens || 0;
    const reasoning = record.totals?.reasoningTokens || 0;
    const disjointOut = Math.max(0, totalOut - reasoning);

    const date = localDayKey(new Date(at));
    addClientTokensToDay(date, record.model || 'antigravity-unknown', {
      input: uncachedIn,
      output: disjointOut,
      cacheRead: cachedIn,
      cacheWrite,
      reasoning
    });

    const sessionId = String(record.sessionId || '').toLowerCase();
    if (sessionId && reportedSessionIds.has(sessionId)) {
      continue;
    }

    const iso = new Date(at).toISOString();
    const entry = {
      client: 'antigravity',
      provider: 'google',
      sessionId: record.sessionId,
      model: record.model || 'antigravity-unknown',
      input: uncachedIn,
      output: disjointOut,
      cacheRead: cachedIn,
      cacheWrite,
      reasoning,
      cost: 0,
      messageCount: 1,
      startedAt: iso,
      lastUsedAt: iso
    };
    entries.push(entry);
    sessionKeys.add(`antigravity:${record.sessionId}`);
  }

  // Include native tokscale sessions that are NOT on disk so disjoint live sessions are counted
  for (const session of Object.values(nativeSessions)) {
    const client = session.client;
    if (client !== 'antigravity' && client !== 'antigravity-cli' && client !== 'antigravity-extension') continue;
    const sid = String(session.sessionId || '').toLowerCase();
    if (sid && readerSessionIds.has(sid)) continue;

    const dateStr = session.lastUsedAt || session.startedAt;
    const at = Date.parse(dateStr || '');
    if (!Number.isFinite(at) || at > now.getTime()) continue;

    const date = localDayKey(new Date(at));
    const model = session.model || Object.keys(session.models || {})[0] || 'antigravity-unknown';
    const totalOut = session.outputTokens || 0;
    const reasoning = session.reasoningTokens || 0;
    const disjointOut = Math.max(0, totalOut - reasoning);

    addClientTokensToDay(date, model, {
      input: session.inputTokens || 0,
      output: disjointOut,
      cacheRead: session.cacheReadTokens || 0,
      cacheWrite: session.cacheWriteTokens || 0,
      reasoning
    }, session.costUsd || 0, session.messageCount || 1);
  }

  function periodForWindow(start) {
    const windowEntries = entries.filter((e) => Date.parse(e.lastUsedAt) >= start);
    const result = extractUsageFromTokscale({ entries: windowEntries });
    for (const session of Object.values(result.sessions)) {
      session.usageSource = 'antigravity-conversation-reader';
    }
    return result;
  }

  return {
    today: periodForWindow(todayStart),
    month: periodForWindow(monthStart),
    allTime: periodForWindow(since),
    graph: { contributions: [...days.values()] },
    sessionKeys: [...sessionKeys]
  };
}

async function readAntigravityUsageView(options = {}) {
  const roots = options.roots || discoverAntigravityRoots(options);
  const sinceMs = Date.parse(options.allTimeSince || '') || 0;
  const { files, errors, records } = readAntigravityUsage(roots, sinceMs, options.cache);
  const view = buildAntigravityUsageView(records, options);
  return {
    ...view,
    files,
    errors
  };
}

module.exports = {
  buildAntigravityUsageView,
  makeAntigravityUsageCache,
  mergeAntigravityGraph,
  readAntigravityUsageView
};
