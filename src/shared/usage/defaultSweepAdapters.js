'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveTokenLedgerPath
} = require('./tokenLedger');
const {
  adaptersForRoots
} = require('./tokenLedgerSweep');
const {
  createSqliteAdapter,
  createSnapshotAdapter,
  createAntigravityAdapter,
  createClaudeAdapter,
  createOpenCodeAdapter,
  createCodexAdapter,
  createWorkBuddyAdapter,
  createZCodeAdapter
} = require('./sourceAdapters');
const {
  discoverAntigravityRoots,
  readAntigravityUsage,
  makeAntigravityUsageCache
} = require('../providers/antigravity/conversationReader');

const defaultSharedAntigravityCache = makeAntigravityUsageCache();
const { sharedDataDir } = require('../config');
const { localDayKey } = require('../history');

function buildDefaultSweepAdapters(options = {}) {
  const env = options.env || process.env;
  const homeDir = options.home || options.homeDir || env.USERPROFILE || env.HOME || os.homedir();
  const liveLedgerPath = path.resolve(
    options.liveLedger || options.liveLedgerPath || resolveTokenLedgerPath({ env, homeDir, ...options }
  ));
  const archivePath = path.resolve(
    options.archive || options.archivePath || path.join(sharedDataDir({ env, homeDir, ...options }), 'daily-history-archive.json')
  );
  const now = options.now || Date.now();
  const endDay = options.end || options.endDay || (options.now ? localDayKey(new Date(options.now)) : undefined);

  const adapters = [];

  // 1. Live ledger adapter (daily_usage SQLite table)
  if (fs.existsSync(liveLedgerPath)) {
    adapters.push(createSqliteAdapter({
      path: liveLedgerPath,
      sourceKind: 'token-ledger',
      sourceId: 'live-ledger',
      table: 'daily_usage',
      keyColumns: ['date_bucket', 'provider', 'model_codename'],
      readRows: (conn, { watermark } = {}) => {
        if (watermark && (watermark.lastSuccessRunId || watermark.last_success_run_id)) {
          return [];
        }
        const hasDaily = Boolean(conn.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'daily_usage'").get());
        if (!hasDaily) return [];
        return conn.prepare(`
          SELECT date_bucket, provider, model_codename,
            total_uncached_in, total_cached_in, total_cache_write,
            total_output, total_reasoning, total_processed, total_known_cost_usd
          FROM daily_usage
        `).all();
      },
      mapRow: (row) => ({
        clientId: row.provider,
        dateBucket: row.date_bucket,
        modelId: row.model_codename,
        inputTokens: row.total_uncached_in,
        cachedInputTokens: row.total_cached_in,
        cacheWriteTokens: row.total_cache_write,
        outputTokens: row.total_output,
        reasoningTokens: row.total_reasoning,
        totalTokens: row.total_processed,
        costUsd: row.total_known_cost_usd,
        occurredAtMs: Date.parse(`${row.date_bucket}T00:00:00Z`) || now,
        naturalKey: `token-ledger:${row.date_bucket}:${row.provider}:${row.model_codename}`
      })
    }));
  }

  // 2. Daily history archive snapshot adapter
  const effectiveArchivePath = fs.existsSync(archivePath)
    ? archivePath
    : (liveLedgerPath && fs.existsSync(path.join(path.dirname(liveLedgerPath), 'daily-history-archive.json'))
        ? path.join(path.dirname(liveLedgerPath), 'daily-history-archive.json')
        : null);

  if (effectiveArchivePath && fs.existsSync(effectiveArchivePath)) {
    adapters.push(createSnapshotAdapter({
      path: effectiveArchivePath,
      sourceKind: 'daily-history-archive',
      sourceId: 'daily-history-archive.json',
      mapSnapshot: (archive) => {
        const events = [];
        for (const [date, day] of Object.entries({ ...(archive.days || {}), ...(archive.liveDays || {}) })) {
          for (const [key, obs] of Object.entries(day?.observations || {})) {
            const client = obs?.client || (() => {
              try { return JSON.parse(key)[0]; } catch (_) { return ''; }
            })();
            const model = obs?.modelId || (() => {
              try { return JSON.parse(key)[1]; } catch (_) { return 'unknown'; }
            })();
            const cr = obs?.cacheReadTokens || 0;
            const cw = obs?.cacheWriteTokens || 0;
            const out = obs?.outputTokens || 0;
            const reas = obs?.reasoningTokens || 0;
            const tot = obs?.tokens || 0;
            const unc = Math.max(0, tot - (cr + cw + out));
            events.push({
              naturalKey: `daily-history-archive:${date}:${key}`,
              clientId: client,
              modelId: model,
              occurredAtMs: Date.parse(`${date}T00:00:00Z`) || now,
              dateBucket: date,
              inputTokens: unc,
              cachedInputTokens: cr,
              cacheWriteTokens: cw,
              outputTokens: out,
              reasoningTokens: reas,
              totalTokens: tot,
              costUsd: obs?.cost ?? null
            });
          }
        }
        return events;
      }
    }));
  }

  // 3. Antigravity disk conversation reader adapter
  const antigravityCache = options.antigravityUsageCache || defaultSharedAntigravityCache;
  adapters.push(createAntigravityAdapter({
    sourceKind: 'antigravity-disk',
    sourceId: 'antigravity-disk',
    readRecords: () => {
      const roots = discoverAntigravityRoots({ homeDir, env });
      const { records } = readAntigravityUsage(roots, 0, antigravityCache);
      const groups = new Map();
      for (const r of records || []) {
        if (r.provider !== 'antigravity') continue;
        const date = localDayKey(new Date(r.timestampMs || now));
        if (endDay && date > endDay) continue;
        const sid = String(r.sessionId || '').trim() || 'unknown';
        const model = r.model || 'gemini-3.8-flash';
        const key = `${date}::${sid}::${model}`;
        let g = groups.get(key);
        if (!g) {
          g = {
            date,
            sessionId: sid,
            model,
            timestampMs: r.timestampMs || now,
            uncached: 0,
            cached: 0,
            creation: 0,
            output: 0,
            reasoning: 0,
            total: 0
          };
          groups.set(key, g);
        }
        g.timestampMs = Math.max(g.timestampMs, r.timestampMs || 0);
        const t = r.totals || {};
        g.uncached += Number(t.uncachedInputTokens || 0);
        g.cached += Number(t.cachedInputTokens || 0);
        g.creation += Number(t.cacheCreationTokens || 0);
        g.output += Number(t.outputTokens || 0);
        g.reasoning += Number(t.reasoningTokens || 0);
        g.total += Number(t.uncachedInputTokens || 0) + Number(t.cachedInputTokens || 0) + Number(t.cacheCreationTokens || 0) + Number(t.outputTokens || 0);
      }
      const agRecords = [];
      for (const g of groups.values()) {
        agRecords.push({
          sessionId: g.sessionId,
          timestampMs: g.timestampMs,
          dateBucket: g.date,
          model: g.model,
          totalTokens: g.total,
          totals: {
            uncachedInputTokens: g.uncached,
            cachedInputTokens: g.cached,
            cacheCreationTokens: g.creation,
            outputTokens: g.output,
            reasoningTokens: g.reasoning
          }
        });
      }
      return agRecords;
    }
  }));

  // 4. Native OpenCode adapter
  const opencodeDb = options.opencodeDb || path.join(homeDir, '.local', 'share', 'opencode', 'opencode.db');
  if (fs.existsSync(opencodeDb)) {
    adapters.push(createOpenCodeAdapter({ filePath: opencodeDb }));
  }

  // 5. Native Claude projects adapter
  const claudeDir = options.claudeDir || path.join(homeDir, '.claude', 'projects');
  if (fs.existsSync(claudeDir)) {
    adapters.push(createClaudeAdapter({ dirPath: claudeDir }));
  }

  // 6. Native Codex adapter
  const codexSessionsDir = options.codexSessionsDir || path.join(homeDir, '.codex', 'sessions');
  const codexArchivedDir = options.codexArchivedDir || path.join(homeDir, '.codex', 'archived_sessions');
  const codexCachePath = options.codexCachePath || path.join(homeDir, '.t3', 'userdata', 'usage-scan-cache-v5.json');
  if (fs.existsSync(codexSessionsDir) || fs.existsSync(codexArchivedDir)) {
    adapters.push(createCodexAdapter({
      homeDir,
      sessionsDir: codexSessionsDir,
      archivedDir: codexArchivedDir,
      cachePath: codexCachePath
    }));
  }

  // 7. Native WorkBuddy adapter
  const workbuddyDir = options.workbuddyDir || path.join(homeDir, '.workbuddy-ai', 'projects');
  const workbuddyAltDir = options.workbuddyAltDir || path.join(homeDir, '.workbuddy', 'projects');
  if (fs.existsSync(workbuddyDir) || fs.existsSync(workbuddyAltDir)) {
    adapters.push(createWorkBuddyAdapter({
      homeDir,
      dirPaths: [workbuddyDir, workbuddyAltDir]
    }));
  }

  // 8. Native ZCode adapter
  const zcodeDb = options.zcodeDb || path.join(homeDir, '.zcode', 'cli', 'db', 'db.sqlite');
  if (fs.existsSync(zcodeDb)) {
    adapters.push(createZCodeAdapter({
      homeDir,
      filePath: zcodeDb
    }));
  }

  // 9. Custom scan path roots
  const roots = options.roots || options.customScanPaths;
  if (roots) {
    adapters.push(...adaptersForRoots(roots));
  }

  return adapters;
}

module.exports = {
  buildDefaultSweepAdapters
};
