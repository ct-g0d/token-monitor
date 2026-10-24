'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { localDayKey } = require('../history');
const { normalizeClientName } = require('../usage');
const { calculateTurnCost } = require('../pricing/formula');
const { PricingEngine } = require('../pricing/engine');

const defaultPricingEngine = new PricingEngine();

const PREFIX_BYTES = 4096;
const DAY_MS = 24 * 60 * 60 * 1000;

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeSourceId(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'default';
  if (/^wsl:/i.test(raw)) {
    const parts = raw.split(':');
    return `wsl:${parts[1]?.trim().toLowerCase() || 'default'}:${parts.slice(2).join(':').replace(/\\/g, '/').toLowerCase()}`;
  }
  if (/^custom:/i.test(raw)) return `custom:${path.resolve(raw.slice(7)).replace(/\\/g, '/').toLowerCase()}`;
  return raw.replace(/\\/g, '/');
}

function sourceIdForRoot(root, kind = 'custom') {
  if (root && typeof root === 'object') {
    const dir = root.path || root.dir || root.root;
    if (root.distro) return normalizeSourceId(`wsl:${root.distro}:${dir || ''}`);
    if (root.custom) return normalizeSourceId(`custom:${dir || ''}`);
    return normalizeSourceId(root.sourceId || dir || 'default');
  }
  return normalizeSourceId(`${kind}:${root || 'default'}`);
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function first(value, keys, fallback = 0) {
  if (!value || typeof value !== 'object') return fallback;
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== '') return value[key];
  }
  return fallback;
}

function eventFromValue(value, defaults = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const client = normalizeClientName(String(first(raw, ['clientId', 'client_id', 'client', 'provider'], defaults.clientId || '')).trim());
  if (!client || client === 'synthetic') return null;
  const occurredAtMs = Number(first(raw, ['occurredAtMs', 'occurred_at_ms', 'timestampMs', 'timestamp_ms', 'timestamp', 'updatedAt'], defaults.occurredAtMs || Date.now()));
  const inputTokens = number(first(raw, ['inputTokens', 'input_tokens', 'input', 'uncachedInput'], 0));
  const cachedInputTokens = number(first(raw, ['cachedInputTokens', 'cached_input_tokens', 'cacheReadTokens', 'cacheRead', 'cachedInput'], 0));
  const cacheWriteTokens = number(first(raw, ['cacheWriteTokens', 'cache_write_tokens', 'cacheCreationInputTokens', 'cacheWrite'], 0));
  const reasoningTokens = number(first(raw, ['reasoningTokens', 'reasoning_tokens', 'reasoning'], 0));
  const outputTokens = number(first(raw, ['outputTokens', 'output_tokens', 'output', 'completionTokens'], 0));
  const totalTokens = number(first(raw, ['totalTokens', 'total_tokens', 'processedTokens', 'processed_tokens'], inputTokens + cachedInputTokens + cacheWriteTokens + outputTokens));
  const date = String(first(raw, ['dateBucket', 'date_bucket', 'date'], '') || (Number.isFinite(occurredAtMs) ? localDayKey(new Date(occurredAtMs)) : '1970-01-01')).slice(0, 10);
  const sourceKind = String(defaults.sourceKind || raw.sourceKind || raw.source_kind || 'local').trim();
  const sourceId = normalizeSourceId(defaults.sourceId || raw.sourceId || raw.source_id || 'default');
  const identity = first(raw, ['naturalKey', 'natural_key', 'eventId', 'event_id', 'id', 'requestId', 'request_id', 'sessionId', 'session_id'], '');
  const naturalKey = String(identity || `${sourceKind}:${sourceId}:${date}:${hash(JSON.stringify(raw))}`).trim();
  return {
    naturalKey,
    clientId: client,
    sourceKind,
    sourceId,
    sessionId: first(raw, ['sessionId', 'session_id', 'session', 'conversationId'], defaults.sessionId || null),
    requestId: first(raw, ['requestId', 'request_id'], defaults.requestId || null),
    occurredAtMs: Number.isFinite(occurredAtMs) ? occurredAtMs : Date.now(),
    dateBucket: date,
    modelId: String(first(raw, ['modelId', 'model_id', 'model', 'modelCodename', 'model_codename'], defaults.modelId || 'unknown')),
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    costUsd: (() => {
      const rawCost = first(raw, ['costUsd', 'cost_usd', 'cost'], defaults.costUsd ?? null);
      if (rawCost != null && Number.isFinite(Number(rawCost)) && Number(rawCost) > 0) return Number(rawCost);
      const model = String(first(raw, ['modelId', 'model_id', 'model', 'modelCodename', 'model_codename'], defaults.modelId || 'unknown'));
      const pe = defaults.pricingEngine || defaultPricingEngine;
      const rates = pe ? pe.resolveRates(model) : null;
      if (rates) {
        return calculateTurnCost({
          uncached_input: inputTokens,
          cached_input: cachedInputTokens,
          cache_write: cacheWriteTokens,
          output_tokens: outputTokens
        }, rates);
      }
      return null;
    })(),
    payloadHash: hash(JSON.stringify(raw))
  };
}

function readPrefix(filePath, length = PREFIX_BYTES) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buf, 0, length, 0);
    return buf.subarray(0, bytesRead);
  } catch (_) {
    return Buffer.alloc(0);
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
  }
}

function statFingerprint(filePath, includeSidecars = false) {
  const stat = fs.statSync(filePath);
  const prefix = readPrefix(filePath);
  const sidecars = includeSidecars ? ['-wal', '-shm'].map((suffix) => {
    try { const s = fs.statSync(`${filePath}${suffix}`); return `${suffix}:${s.size}:${s.mtimeMs}`; } catch (_) { return `${suffix}:-`; }
  }).join('|') : '';
  return {
    device: stat.dev,
    inode: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    prefixHash: hash(prefix),
    value: hash(`${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${hash(prefix)}:${sidecars}`)
  };
}

function makeAdapterResult(events, nextCursor, sourceFingerprint, coverage = {}) {
  const rewrite = Boolean(coverage?.rewrite);
  return { events: events.filter(Boolean), cursor: nextCursor || {}, nextCursor: nextCursor || {}, sourceFingerprint, rewrite, coverage: { complete: true, ...coverage } };
}

function partitionEventKey(event, sourceKind, sourceId) {
  const prefix = `${sourceKind}:${sourceId}:`;
  if (event && event.naturalKey && !String(event.naturalKey).startsWith(prefix)) {
    event.naturalKey = `${prefix}${event.naturalKey}`;
  }
  return event;
}

function createAppendFileAdapter(options = {}) {
  const filePath = path.resolve(options.filePath || options.path);
  const sourceKind = options.sourceKind || 'append-file';
  const sourceId = normalizeSourceId(options.sourceId || filePath);
  const parseLine = options.parseLine || options.parse || options.parser || ((line) => JSON.parse(line));
  const mapLine = options.mapLine || options.map || options.toEvent || ((value) => eventFromValue(value, { sourceKind, sourceId, clientId: options.clientId }));
  function read({ watermark = null, now = Date.now() } = {}) {
    if (!fs.existsSync(filePath)) return makeAdapterResult([], { offset: 0, byteOffset: 0, tail: '' }, null, { complete: true, missing: true });
    try {
      if (fs.statSync(filePath).isDirectory()) {
        return makeAdapterResult([], { offset: 0, byteOffset: 0, tail: '' }, null, { complete: true });
      }
    } catch (_) {}
    const fp = statFingerprint(filePath);
    const old = watermark?.cursor || watermark || {};
    const oldSize = Number(watermark?.source_size ?? old.size ?? old.sourceSize ?? 0);
    const oldMtime = Number(watermark?.source_mtime_ms ?? old.mtimeMs ?? old.sourceMtimeMs ?? 0);
    const oldPrefix = watermark?.prefix_hash || old.prefixHash || '';
    const oldDevice = old.device ?? watermark?.device;
    const oldInode = old.inode ?? watermark?.inode;
    const truncated = oldSize > fp.size || Number(old.offset ?? old.byteOffset ?? 0) > fp.size;
    const replaced = Boolean(oldPrefix && oldPrefix !== fp.prefixHash
      && oldSize >= PREFIX_BYTES && fp.size >= PREFIX_BYTES
      && Number(old.offset ?? old.byteOffset ?? 0) > 0);
    const sameSizeMtime = oldSize === fp.size && oldMtime > 0 && fp.mtimeMs !== oldMtime;
    const changedDevice = oldDevice != null && String(oldDevice) !== String(fp.device) || oldInode != null && String(oldInode) !== String(fp.inode);
    const olderMtime = oldMtime > 0 && fp.mtimeMs < oldMtime;
    const rewrite = Boolean(truncated || replaced || changedDevice || olderMtime || sameSizeMtime);
    const generation = Math.max(1, Number(watermark?.generation || old.generation || 1) + (rewrite ? 1 : 0));
    const offset = rewrite ? 0 : Math.max(0, Number(old.offset ?? old.byteOffset ?? 0));
    const previousTail = rewrite ? '' : String(old.tail || '');

    if (!rewrite && (watermark?.lastSuccessRunId || watermark?.last_success_run_id) && oldSize === fp.size && oldMtime === fp.mtimeMs && offset === fp.size && !previousTail) {
      const nextCursor = { offset, byteOffset: offset, tail: '', generation, device: fp.device, inode: fp.inode, size: fp.size, mtimeMs: fp.mtimeMs, prefixHash: fp.prefixHash };
      return makeAdapterResult([], nextCursor, fp.value, { rewrite: false, complete: true, unchanged: true });
    }

    let chunk;
    if (offset === 0) {
      const bytes = fs.readFileSync(filePath);
      chunk = Buffer.concat([Buffer.from(previousTail), bytes]);
    } else {
      const bytesToRead = Math.max(0, fp.size - offset);
      const buf = Buffer.alloc(bytesToRead);
      let fd;
      try {
        fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buf, 0, bytesToRead, offset);
      } finally {
        if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {}
      }
      chunk = Buffer.concat([Buffer.from(previousTail), buf]);
    }
    const text = chunk.toString('utf8');
    const lines = text.split(/\r?\n/);
    const incompleteTail = text.endsWith('\n') || text.endsWith('\r') ? '' : (lines.pop() || '');
    const events = [];
    let index = 0;
    for (const line of lines) {
      if (!line.trim()) { index += Buffer.byteLength(line) + 1; continue; }
      try {
        const value = parseLine(line);
        const mapped = mapLine(value, { line, lineNumber: index, generation, now });
        for (const event of Array.isArray(mapped) ? mapped : [mapped]) {
          const normalized = eventFromValue(event, { sourceKind, sourceId, clientId: options.clientId, occurredAtMs: now });
          if (normalized) events.push(partitionEventKey(normalized, sourceKind, sourceId));
        }
      } catch (_) {
        // A malformed complete line is retained as a gap; the cursor still advances.
      }
      index += Buffer.byteLength(line) + 1;
    }
    const nextOffset = rewrite ? fp.size : offset + (chunk.length - Buffer.from(previousTail).length);
    const nextCursor = { offset: nextOffset, byteOffset: nextOffset, tail: incompleteTail, generation, device: fp.device, inode: fp.inode, size: fp.size, mtimeMs: fp.mtimeMs, prefixHash: fp.prefixHash };
    return makeAdapterResult(events, nextCursor, fp.value, { rewrite, truncated, incompleteTail: Boolean(incompleteTail), fromOffset: offset, toOffset: nextOffset, complete: !incompleteTail });
  }
  return { sourceKind, sourceId, path: filePath, read };
}

const createNdjsonAdapter = createAppendFileAdapter;
const createAppendOnlyAdapter = createAppendFileAdapter;

function mergeArchiveDays(raw) {
  if (!raw || typeof raw !== 'object' || (!raw.days && !raw.liveDays)) return raw;
  const days = { ...(raw.days || {}) };
  const liveDays = { ...(raw.liveDays || {}) };
  const mergedLive = {};
  for (const [date, liveDay] of Object.entries(liveDays)) {
    const finalizedDay = days[date];
    if (!finalizedDay) {
      mergedLive[date] = liveDay;
      continue;
    }
    const targetObs = { ...(finalizedDay.observations || {}) };
    for (const [key, liveObs] of Object.entries(liveDay?.observations || {})) {
      const existing = targetObs[key];
      if (!existing || Number(liveObs?.tokens || 0) > Number(existing?.tokens || 0)) {
        targetObs[key] = liveObs;
      }
    }
    mergedLive[date] = {
      ...finalizedDay,
      ...liveDay,
      observations: targetObs
    };
  }
  return {
    ...raw,
    liveDays: mergedLive
  };
}

function createSnapshotAdapter(options = {}) {
  const filePath = path.resolve(options.filePath || options.path);
  const sourceKind = options.sourceKind || 'snapshot-file';
  const sourceId = normalizeSourceId(options.sourceId || filePath);
  const defaultReadSnapshot = (file) => mergeArchiveDays(JSON.parse(fs.readFileSync(file, 'utf8')));
  const readSnapshot = options.readSnapshot || options.parse || defaultReadSnapshot;
  const mapSnapshot = options.mapSnapshot || options.map || options.toEvents || ((value) => value);
  function read({ watermark = null, now = Date.now() } = {}) {
    if (!fs.existsSync(filePath)) return makeAdapterResult([], { generation: watermark?.generation || 1 }, null, { missing: true });
    const fp = statFingerprint(filePath);
    const old = watermark?.cursor || watermark || {};
    const oldMtime = Number(watermark?.source_mtime_ms ?? old.mtimeMs ?? old.sourceMtimeMs ?? 0);
    const oldSize = Number(watermark?.source_size ?? old.size ?? old.sourceSize ?? 0);
    const oldPrefix = watermark?.prefix_hash || old.prefixHash || '';
    const rewrite = false;
    const generation = Math.max(1, Number(watermark?.generation || old.generation || 1));

    if ((watermark?.lastSuccessRunId || watermark?.last_success_run_id) && oldSize === fp.size && oldMtime === fp.mtimeMs && (!oldPrefix || oldPrefix === fp.prefixHash)) {
      return makeAdapterResult([], { generation, size: fp.size, mtimeMs: fp.mtimeMs, prefixHash: fp.prefixHash }, fp.value, { rewrite: false, complete: true, unchanged: true });
    }

    const value = readSnapshot(filePath);
    const mapped = mapSnapshot(value, { now, generation, sourceId });
    const values = Array.isArray(mapped) ? mapped : (Array.isArray(mapped?.events) ? mapped.events : [mapped]);
    const events = values.map((item) => partitionEventKey(eventFromValue(item, { sourceKind, sourceId, clientId: options.clientId, occurredAtMs: now }), sourceKind, sourceId)).filter(Boolean);
    return makeAdapterResult(events, { generation, size: fp.size, mtimeMs: fp.mtimeMs, prefixHash: fp.prefixHash }, fp.value, { rewrite, complete: true });
  }
  return { sourceKind, sourceId, path: filePath, read };
}

function createSqliteAdapter(options = {}) {
  const filePath = options.filePath || options.path;
  const sourceKind = options.sourceKind || 'sqlite';
  const sourceId = normalizeSourceId(options.sourceId || filePath || 'memory');
  const keyColumns = options.keyColumns || [options.keyColumn || 'id'];
  const updatedAtColumn = options.updatedAtColumn || options.updatedAt || null;
  const overlapMs = Number(options.overlapMs ?? DAY_MS);
  const table = options.table;
  function read({ watermark = null, now = Date.now() } = {}) {
    const before = filePath && fs.existsSync(filePath) ? statFingerprint(filePath, true) : null;
    let connection;
    let ownsConnection = false;
    try {
      connection = options.database || (filePath ? new DatabaseSync(filePath, { readOnly: true }) : new DatabaseSync(':memory:'));
      ownsConnection = !options.database;
      const old = watermark?.cursor || watermark || {};
      const lastKey = old.lastKey ?? old.last_key ?? null;
      const maxUpdatedAt = Number(old.maxUpdatedAt ?? old.max_updated_at ?? 0);
      let rows;
      if (options.readRows || options.query) rows = (options.readRows || options.query)(connection, { watermark, now });
      else {
        if (!table || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error('sqlite adapter requires a safe table name');
        const where = [];
        const params = [];
        if (keyColumns.length === 1 && lastKey != null) { where.push(`"${keyColumns[0]}" > ?`); params.push(lastKey); }
        if (updatedAtColumn && maxUpdatedAt > 0) { where.push(`"${updatedAtColumn}" >= ?`); params.push(maxUpdatedAt - overlapMs); }
        // Ordering by updatedAtColumn then keyColumns ensures that rows are traversed monotonically
        // by modification time so overlap windows advance cleanly without skipping updated rows with smaller keys.
        const orderBy = updatedAtColumn
          ? `"${updatedAtColumn}" ASC, ${keyColumns.map((key) => `"${key}" ASC`).join(', ')}`
          : keyColumns.map((key) => `"${key}" ASC`).join(', ');
        const sql = `SELECT * FROM "${table}"${where.length ? ` WHERE ${where.join(' OR ')}` : ''} ORDER BY ${orderBy}`;
        rows = connection.prepare(sql).all(...params);
      }
      const mapRow = options.mapRow || options.map || options.rowToEvent || options.toEvent || ((row) => eventFromValue(row, { sourceKind, sourceId, clientId: options.clientId, occurredAtMs: now }));
      const events = [];
      let nextKey = lastKey;
      let nextUpdatedAt = maxUpdatedAt;
      for (const row of rows || []) {
        const mapped = mapRow(row, { sourceKind, sourceId, now });
        for (const event of Array.isArray(mapped) ? mapped : [mapped]) {
          const normalized = eventFromValue(event, { sourceKind, sourceId, clientId: options.clientId, occurredAtMs: now });
          if (normalized) events.push(partitionEventKey(normalized, sourceKind, sourceId));
        }
        const key = keyColumns.length === 1 ? row[keyColumns[0]] : keyColumns.map((column) => row[column]);
        nextKey = key;
        if (updatedAtColumn) nextUpdatedAt = Math.max(nextUpdatedAt, Number(row[updatedAtColumn]) || 0);
      }
      const after = filePath && fs.existsSync(filePath) ? statFingerprint(filePath, true) : null;
      const dirty = Boolean(before && after && before.value !== after.value);
      const fingerprint = after || before || { value: 'memory', size: null, mtimeMs: null, prefixHash: null };
      return makeAdapterResult(events, {
        table, keyColumns, lastKey: nextKey, maxUpdatedAt: nextUpdatedAt, overlapMs,
        sourceSize: fingerprint.size, sourceMtimeMs: fingerprint.mtimeMs, prefixHash: fingerprint.prefixHash
      }, fingerprint.value, { dirty, complete: !dirty });
    } finally {
      if (ownsConnection) try { connection?.close(); } catch (_) {}
    }
  }
  return { sourceKind, sourceId, path: filePath, read };
}

function mergeSessionObservations(observations) {
  const bySession = new Map();
  for (const item of observations || []) {
    const sessionId = String(item.sessionId || item.session_id || item.session || '').trim();
    const key = sessionId || `${item.dateBucket || item.date || ''}:${normalizeClientName(item.clientId || item.client || item.provider)}`;
    const current = bySession.get(key);
    if (!current) { bySession.set(key, item); continue; }
    const total = number(item.totalTokens ?? item.tokens);
    const currentTotal = number(current.totalTokens ?? current.tokens);
    if (total > currentTotal) bySession.set(key, item);
  }
  return [...bySession.values()];
}

function createAntigravityAdapter(options = {}) {
  const sourceKind = options.sourceKind || 'antigravity-disk';
  const sourceId = normalizeSourceId(options.sourceId || options.root || 'antigravity');
  const readRecords = options.readRecords || options.read || (() => options.records || []);
  function read({ watermark = null, now = Date.now() } = {}) {
    let records = typeof readRecords === 'function' ? readRecords({ watermark, now }) : [];
    if (records && !Array.isArray(records) && Array.isArray(records.records)) records = records.records;

    const diskRecords = new Map();
    const otherRecords = new Map();
    for (const item of records || []) {
      const sid = String(item.sessionId || item.session_id || item.session || '').trim();
      const at = Number(item.timestampMs || item.occurredAtMs || now);
      const date = item.dateBucket || item.date || localDayKey(new Date(Number.isFinite(at) ? at : now));
      const model = item.model || item.modelId || 'gemini-3.8-flash';
      const t = item.totals || item.tokens || {};
      const uncached = number(t.uncachedInputTokens ?? t.input ?? t.inputTokens);
      const cached = number(t.cachedInputTokens ?? t.cacheRead ?? t.cacheReadTokens);
      const creation = number(t.cacheCreationTokens ?? t.cacheWrite ?? t.cacheWriteTokens);
      const out = number(t.outputTokens ?? t.output);
      const reasoning = number(t.reasoningTokens ?? t.reasoning);
      const tok = number(item.totalTokens ?? item.tokens ?? (uncached + cached + creation + out));

      if (sid.startsWith('disk-')) {
        const existing = diskRecords.get(sid);
        if (!existing) {
          diskRecords.set(sid, {
            ...item,
            sessionId: sid,
            timestampMs: at,
            dateBucket: date,
            model,
            totalTokens: tok,
            totals: {
              uncachedInputTokens: uncached,
              cachedInputTokens: cached,
              cacheCreationTokens: creation,
              outputTokens: out,
              reasoningTokens: reasoning
            }
          });
        } else {
          existing.totalTokens += tok;
          existing.totals.uncachedInputTokens += uncached;
          existing.totals.cachedInputTokens += cached;
          existing.totals.cacheCreationTokens += creation;
          existing.totals.outputTokens += out;
          existing.totals.reasoningTokens += reasoning;
        }
      } else {
        const key = `${date}::${sid || 'unknown'}::${model}`;
        const existing = otherRecords.get(key);
        if (!existing) {
          otherRecords.set(key, {
            ...item,
            sessionId: sid,
            timestampMs: at,
            dateBucket: date,
            model,
            totalTokens: tok,
            totals: {
              uncachedInputTokens: uncached,
              cachedInputTokens: cached,
              cacheCreationTokens: creation,
              outputTokens: out,
              reasoningTokens: reasoning
            }
          });
        } else {
          existing.timestampMs = Math.max(existing.timestampMs, at);
          existing.totalTokens += tok;
          existing.totals.uncachedInputTokens += uncached;
          existing.totals.cachedInputTokens += cached;
          existing.totals.cacheCreationTokens += creation;
          existing.totals.outputTokens += out;
          existing.totals.reasoningTokens += reasoning;
        }
      }
    }

    records = [...diskRecords.values(), ...otherRecords.values()];
    const events = [];
    for (const record of records) {
      const totals = record.totals || record.tokens || {};
      const at = Number(record.timestampMs || record.occurredAtMs || now);
      const sessionId = String(record.sessionId || record.session_id || '').trim();
      const date = record.dateBucket || record.date || localDayKey(new Date(Number.isFinite(at) ? at : now));
      const model = record.model || record.modelId || 'unknown';
      const keySuffix = sessionId.startsWith('disk-') ? sessionId : `${date}:${sessionId || date}`;
      events.push(eventFromValue({
        naturalKey: `${sourceKind}:${sourceId}:${keySuffix}:${model}`,
        clientId: 'antigravity',
        sourceKind,
        sourceId,
        sessionId: sessionId.startsWith('disk-') ? null : (sessionId || null),
        occurredAtMs: at,
        dateBucket: date,
        modelId: model,
        inputTokens: totals.uncachedInputTokens ?? totals.input ?? totals.inputTokens,
        cachedInputTokens: totals.cachedInputTokens ?? totals.cacheRead ?? totals.cacheReadTokens,
        cacheWriteTokens: totals.cacheCreationTokens ?? totals.cacheWrite ?? totals.cacheWriteTokens,
        outputTokens: totals.outputTokens ?? totals.output,
        reasoningTokens: totals.reasoningTokens ?? totals.reasoning,
        totalTokens: record.totalTokens ?? (number(totals.uncachedInputTokens) + number(totals.cachedInputTokens) + number(totals.cacheCreationTokens) + number(totals.outputTokens))
      }, { sourceKind, sourceId, clientId: 'antigravity', occurredAtMs: at }));
    }
    const hashBuilder = crypto.createHash('sha256');
    for (const ev of events) hashBuilder.update(ev.naturalKey);
    const hash = hashBuilder.digest('hex');
    const oldPrefix = watermark?.prefix_hash || watermark?.prefixHash || '';
    if ((watermark?.lastSuccessRunId || watermark?.last_success_run_id) && oldPrefix === hash) {
      return makeAdapterResult([], { generation: Number(watermark?.generation || 1), count: events.length, prefixHash: hash }, hash, { rewrite: false, complete: true, unchanged: true });
    }
    return makeAdapterResult(events, { generation: Number(watermark?.generation || 1), count: events.length, prefixHash: hash }, hash, { rewrite: false, complete: true });
  }
  return { sourceKind, sourceId, read };
}

function createClaudeAdapter(options = {}) {
  const dirPath = path.resolve(options.dirPath || options.filePath || options.path || path.join(process.env.USERPROFILE || os.homedir(), '.claude', 'projects'));
  const sourceKind = options.sourceKind || 'claude-projects';
  const sourceId = normalizeSourceId(options.sourceId || dirPath);

  function walk(d) {
    let res = [];
    try {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) res.push(...walk(p));
        else if (p.endsWith('.jsonl')) res.push(p);
      }
    } catch (_) {}
    return res;
  }

  function read({ watermark = null, now = Date.now() } = {}) {
    if (!fs.existsSync(dirPath)) return makeAdapterResult([], { generation: watermark?.generation || 1 }, null, { missing: true });
    const files = walk(dirPath);
    const oldCursor = watermark?.cursor || {};
    const oldFiles = oldCursor.files || {};
    const newFilesCursor = { ...oldFiles };
    const seen = new Set();
    const events = [];
    let hasNewData = false;

    for (const file of files) {
      let stat;
      try { stat = fs.statSync(file); } catch (_) { continue; }
      const prev = oldFiles[file];
      if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
        continue;
      }
      hasNewData = true;
      newFilesCursor[file] = { mtimeMs: stat.mtimeMs, size: stat.size };
      let content;
      try { content = fs.readFileSync(file, 'utf8'); } catch (_) { continue; }
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        if (!line.includes('"usage"')) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type !== 'assistant' || !obj.message || !obj.message.usage) continue;
          const msg = obj.message;
          const model = msg.model || '';
          if (!model || model === '<synthetic>') continue;
          const msgId = msg.id || null;
          const reqId = obj.requestId || null;
          const dedupeKey = (msgId !== null || reqId !== null)
            ? `${msgId ?? ''}:${reqId ?? ''}`
            : `${path.basename(file)}:${hash(line)}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const u = msg.usage;
          const inputTokens = number(u.input_tokens);
          const cachedInputTokens = number(u.cache_read_input_tokens);
          const cacheWriteTokens = number(u.cache_creation_input_tokens);
          const outputTokens = number(u.output_tokens);
          const totalTokens = inputTokens + cachedInputTokens + cacheWriteTokens + outputTokens;

          const fileMtimeMs = stat.mtimeMs || 0;
          const occurredAtMs = obj.timestamp ? Date.parse(obj.timestamp) : (fileMtimeMs || now);
          const date = localDayKey(new Date(Number.isFinite(occurredAtMs) ? occurredAtMs : now));

          events.push(partitionEventKey(eventFromValue({
            naturalKey: `${sourceKind}:${sourceId}:${dedupeKey}`,
            clientId: 'claude',
            sourceKind,
            sourceId,
            sessionId: obj.sessionId || path.basename(file, '.jsonl'),
            requestId: reqId || msgId || null,
            occurredAtMs,
            dateBucket: date,
            modelId: model,
            inputTokens,
            cachedInputTokens,
            cacheWriteTokens,
            outputTokens,
            reasoningTokens: 0,
            totalTokens,
            costUsd: null
          }, { sourceKind, sourceId, clientId: 'claude', occurredAtMs }), sourceKind, sourceId));
        } catch (_) {}
      }
    }
    const nextCursor = {
      files: newFilesCursor,
      generation: Number(watermark?.generation || 1),
      fileCount: files.length
    };
    return makeAdapterResult(events, nextCursor, `${sourceKind}:${events.length}`, { complete: true, unchanged: !hasNewData });
  }

  return { sourceKind, sourceId, path: dirPath, read };
}

function createOpenCodeAdapter(options = {}) {
  const filePath = path.resolve(options.filePath || options.path || path.join(process.env.USERPROFILE || os.homedir(), '.local', 'share', 'opencode', 'opencode.db'));
  const sourceKind = options.sourceKind || 'opencode-db';
  const sourceId = normalizeSourceId(options.sourceId || filePath);

  function read({ watermark = null } = {}) {
    if (!fs.existsSync(filePath)) return makeAdapterResult([], { generation: watermark?.generation || 1 }, null, { missing: true });
    const fp = statFingerprint(filePath, true);
    const old = watermark?.cursor || watermark || {};
    const oldMtime = Number(watermark?.source_mtime_ms ?? old.mtimeMs ?? 0);
    const oldSize = Number(watermark?.source_size ?? old.size ?? 0);
    const generation = Math.max(1, Number(watermark?.generation || old.generation || 1));
    const maxTimeCreated = Number(old.maxTimeCreated ?? 0);

    if ((watermark?.lastSuccessRunId || watermark?.last_success_run_id) && oldSize === fp.size && oldMtime === fp.mtimeMs && maxTimeCreated > 0) {
      return makeAdapterResult([], { generation, size: fp.size, mtimeMs: fp.mtimeMs, prefixHash: fp.prefixHash, maxTimeCreated }, fp.value, { rewrite: false, complete: true, unchanged: true });
    }

    let db;
    try {
      db = new DatabaseSync(filePath, { readOnly: true });
      const query = maxTimeCreated > 0
        ? 'SELECT id, session_id, data, time_created FROM message WHERE json_valid(data) AND time_created > ? ORDER BY time_created ASC, id ASC'
        : 'SELECT id, session_id, data, time_created FROM message WHERE json_valid(data) ORDER BY time_created ASC, id ASC';
      const rows = maxTimeCreated > 0
        ? db.prepare(query).all(maxTimeCreated)
        : db.prepare(query).all();
      const events = [];
      const seen = new Set();
      let nextMaxTime = maxTimeCreated;
      for (const row of rows) {
        if (typeof row.time_created === 'number' && row.time_created > nextMaxTime) {
          nextMaxTime = row.time_created;
        }
        let parsed;
        try { parsed = JSON.parse(row.data); } catch (_) { continue; }
        if (parsed.role !== undefined && parsed.role !== 'assistant') continue;
        const usage = parsed.tokens || {};
        const cache = usage.cache || {};
        const modelReference = parsed.model || {};
        const model = modelReference.id || modelReference.modelID || parsed.modelID || '';
        const timestampMs = parsed.time?.created ?? row.time_created;
        if (!model || typeof timestampMs !== 'number') continue;

        const id = row.id || parsed.id;
        const dedupeKey = id ? `opencode:${id}` : null;
        if (dedupeKey && seen.has(dedupeKey)) continue;
        if (dedupeKey) seen.add(dedupeKey);

        const inputTokens = number(usage.input);
        const cachedInputTokens = number(cache.read);
        const cacheWriteTokens = number(cache.write);
        const reasoningTokens = number(usage.reasoning);
        const rawOutput = number(usage.output);
        const explicitTotal = usage.total != null ? number(usage.total) : 0;
        const outputIncludesReasoning = explicitTotal > 0 && explicitTotal === (inputTokens + cachedInputTokens + cacheWriteTokens + rawOutput + reasoningTokens);
        const outputTokens = outputIncludesReasoning ? (rawOutput + reasoningTokens) : rawOutput;
        const totalTokens = explicitTotal > 0 ? explicitTotal : (inputTokens + cachedInputTokens + cacheWriteTokens + outputTokens);
        if (totalTokens === 0) continue;
        const date = localDayKey(new Date(timestampMs));
        const cost = parsed.cost != null ? Number(parsed.cost) : null;

        events.push(partitionEventKey(eventFromValue({
          naturalKey: `${sourceKind}:${sourceId}:${id || `${date}:${timestampMs}`}`,
          clientId: 'opencode',
          sourceKind,
          sourceId,
          sessionId: row.session_id || null,
          requestId: id || null,
          occurredAtMs: timestampMs,
          dateBucket: date,
          modelId: model,
          inputTokens,
          cachedInputTokens,
          cacheWriteTokens,
          outputTokens,
          reasoningTokens,
          totalTokens,
          costUsd: cost
        }, { sourceKind, sourceId, clientId: 'opencode', occurredAtMs: timestampMs }), sourceKind, sourceId));
      }
      return makeAdapterResult(events, { generation, size: fp.size, mtimeMs: fp.mtimeMs, prefixHash: fp.prefixHash, maxTimeCreated: nextMaxTime }, fp.value, { rewrite: false, complete: true });
    } finally {
      if (db) try { db.close(); } catch (_) {}
    }
  }

  return { sourceKind, sourceId, path: filePath, read };
}


function parseCodexTimestampMs(value) {
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseCodexTokenCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function isCodexForkedSessionMeta(payload) {
  if (typeof payload['forked_from_id'] === 'string') return true;
  const source = payload['source'];
  if (typeof source !== 'object' || source === null) return false;
  const subagent = source['subagent'];
  if (typeof subagent !== 'object' || subagent === null) return false;
  const spawn = subagent['thread_spawn'];
  if (typeof spawn !== 'object' || spawn === null) return false;
  return typeof spawn['parent_thread_id'] === 'string';
}

function parseCodexFile(filePath) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch (_) { return []; }
  const lines = content.split(/\r?\n/);
  const state = {
    model: '',
    sessionId: '',
    lastUsageSignature: null,
    sawSessionMeta: false,
    suppressingForkCopies: false,
    forkCopyAnchorMs: 0,
  };
  const records = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed;
    try { parsed = JSON.parse(line); } catch (_) { continue; }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const record = parsed;
    const payload = record['payload'];
    if (typeof payload !== 'object' || payload === null) continue;
    const payloadRecord = payload;
    const payloadType = payloadRecord['type'];

    if (record['type'] === 'session_meta') {
      if (state.sawSessionMeta) continue;
      state.sawSessionMeta = true;
      const id = payloadRecord['id'] ?? payloadRecord['session_id'];
      if (typeof id === 'string') state.sessionId = id;
      const metaTimestampMs = parseCodexTimestampMs(record['timestamp']);
      if (metaTimestampMs !== null && isCodexForkedSessionMeta(payloadRecord)) {
        state.suppressingForkCopies = true;
        state.forkCopyAnchorMs = metaTimestampMs;
      }
      continue;
    }

    if (record['type'] === 'turn_context') {
      if (typeof payloadRecord['model'] === 'string') state.model = payloadRecord['model'];
      continue;
    }

    if (payloadType !== 'token_count') continue;

    const info = payloadRecord['info'];
    if (typeof info !== 'object' || info === null) continue;
    const last = info['last_token_usage'];
    if (typeof last !== 'object' || last === null) continue;
    const lastRecord = last;

    const timestampMs = parseCodexTimestampMs(record['timestamp']);
    if (timestampMs === null) continue;
    if (state.model.length === 0) continue;

    const signature = JSON.stringify(lastRecord);
    if (signature === state.lastUsageSignature) continue;
    state.lastUsageSignature = signature;

    if (state.suppressingForkCopies) {
      if (timestampMs - state.forkCopyAnchorMs < 1000) {
        state.forkCopyAnchorMs = timestampMs;
        continue;
      }
      state.suppressingForkCopies = false;
    }

    const inputTokens = parseCodexTokenCount(lastRecord['input_tokens']);
    const cachedInputTokens = parseCodexTokenCount(lastRecord['cached_input_tokens']);
    const cacheCreationTokens = parseCodexTokenCount(lastRecord['cache_write_input_tokens']);
    const outputTokens = parseCodexTokenCount(lastRecord['output_tokens']);
    const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens - cacheCreationTokens);
    const reasoningTokens = Math.min(outputTokens, parseCodexTokenCount(lastRecord['reasoning_output_tokens']));
    const tot = uncachedInputTokens + cachedInputTokens + cacheCreationTokens + outputTokens;

    if (tot === 0) continue;

    records.push({
      provider: 'codex',
      timestampMs,
      model: state.model,
      sessionId: state.sessionId,
      totals: {
        uncachedInputTokens,
        cachedInputTokens,
        cacheCreationTokens,
        outputTokens,
        reasoningTokens
      }
    });
  }
  return records;
}

function walkAllJsonl(dir) {
  let files = [];
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) files.push(...walkAllJsonl(full));
      else if (f.name.endsWith('.jsonl')) files.push(full);
    }
  } catch (_) {}
  return files;
}

function createCodexAdapter(options = {}) {
  const homeDir = options.homeDir || process.env.USERPROFILE || process.env.HOME || os.homedir();
  const sessionsDir = path.resolve(options.sessionsDir || options.dirPath || path.join(homeDir, '.codex', 'sessions'));
  const archivedDir = path.resolve(options.archivedDir || path.join(homeDir, '.codex', 'archived_sessions'));
  const cachePath = options.cachePath !== undefined ? options.cachePath : path.join(homeDir, '.t3', 'userdata', 'usage-scan-cache-v5.json');
  const sourceKind = options.sourceKind || 'codex-sessions';
  const sourceId = normalizeSourceId(options.sourceId || sessionsDir);

  function read({ watermark = null } = {}) {
    const oldCursor = watermark?.cursor || {};
    const oldFiles = oldCursor.files || {};
    const cacheLoaded = Boolean(oldCursor.cacheLoaded);
    const newFilesCursor = { ...oldFiles };

    const fileList = [];

    // 1. Load from scan cache if present and not yet loaded in cursor
    if (cachePath && fs.existsSync(cachePath) && !cacheLoaded) {
      try {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        const models = cache.models || [];
        const sessions = cache.sessions || [];
        const cacheFiles = cache.files || {};
        for (const [filePath, fileData] of Object.entries(cacheFiles)) {
          if (fileData.p !== 'codex') continue;
          const records = [...(fileData.r || []), ...(fileData.t || [])].map((r) => {
            const [timestampMs, modelIndex, sessionIndex, uncachedInputTokens, cachedInputTokens, cacheCreationTokens, outputTokens, reasoningTokens] = r;
            return {
              provider: 'codex',
              timestampMs,
              model: models[modelIndex] || 'unknown',
              sessionId: sessions[sessionIndex] || '',
              totals: { uncachedInputTokens, cachedInputTokens, cacheCreationTokens, outputTokens, reasoningTokens }
            };
          });
          if (records.length > 0) {
            fileList.push({ path: filePath, records });
          }
        }
      } catch (_) {}
    }

    // 2. Scan active disk directories
    const rootsToScan = [];
    if (fs.existsSync(sessionsDir)) rootsToScan.push(sessionsDir);
    if (fs.existsSync(archivedDir)) rootsToScan.push(archivedDir);

    for (const root of rootsToScan) {
      for (const filePath of walkAllJsonl(root)) {
        let stat;
        try { stat = fs.statSync(filePath); } catch (_) { continue; }
        const prev = oldFiles[filePath];
        if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
          continue; // incremental skip
        }
        newFilesCursor[filePath] = { mtimeMs: stat.mtimeMs, size: stat.size };
        const records = parseCodexFile(filePath);
        if (records.length > 0) {
          fileList.push({ path: filePath, records });
        }
      }
    }

    // 3. Cross-file deduplication for shared sessions
    const firstFile = new Map();
    const shared = new Set();
    for (const [index, file] of fileList.entries()) {
      let previous = '';
      for (const { sessionId } of file.records) {
        if (sessionId === previous || !sessionId) continue;
        previous = sessionId;
        const first = firstFile.get(sessionId);
        if (first === undefined) firstFile.set(sessionId, index);
        else if (first !== index) shared.add(sessionId);
      }
    }

    if (fileList.length === 0) {
      return makeAdapterResult([], {
        files: newFilesCursor,
        cacheLoaded: true,
        generation: Number(watermark?.generation || 1)
      }, `${sourceKind}:0`, { complete: true, rewrite: false, unchanged: true });
    }

    const seenDedupe = new Set();
    const events = [];

    for (const file of fileList) {
      const eventOccurrences = new Map();
      for (const record of file.records) {
        const key = `${record.sessionId || ''}:${record.timestampMs}:${record.model}:${JSON.stringify(record.totals)}`;
        const occurrence = (eventOccurrences.get(key) ?? 0) + 1;
        eventOccurrences.set(key, occurrence);
        const dedupeKey = `${key}:${occurrence}`;

        if (seenDedupe.has(dedupeKey)) continue;
        seenDedupe.add(dedupeKey);

        const date = localDayKey(new Date(record.timestampMs));
        const total = record.totals.uncachedInputTokens +
                      record.totals.cachedInputTokens +
                      record.totals.cacheCreationTokens +
                      record.totals.outputTokens;

        events.push(partitionEventKey(eventFromValue({
          naturalKey: `${sourceKind}:${sourceId}:${dedupeKey}`,
          clientId: 'codex',
          sourceKind,
          sourceId,
          sessionId: record.sessionId || null,
          occurredAtMs: record.timestampMs,
          dateBucket: date,
          modelId: record.model,
          inputTokens: record.totals.uncachedInputTokens,
          cachedInputTokens: record.totals.cachedInputTokens,
          cacheWriteTokens: record.totals.cacheCreationTokens,
          outputTokens: record.totals.outputTokens,
          reasoningTokens: record.totals.reasoningTokens,
          totalTokens: total
        }, { sourceKind, sourceId, clientId: 'codex', occurredAtMs: record.timestampMs }), sourceKind, sourceId));
      }
    }

    const nextCursor = {
      files: newFilesCursor,
      cacheLoaded: true,
      generation: Number(watermark?.generation || 1)
    };

    return makeAdapterResult(events, nextCursor, `${sourceKind}:${events.length}`, { complete: true, rewrite: false });
  }

  return { sourceKind, sourceId, read };
}

function createWorkBuddyAdapter(options = {}) {
  const homeDir = options.homeDir || process.env.USERPROFILE || process.env.HOME || os.homedir();
  const dirPaths = options.dirPaths ? [...options.dirPaths] : [
    path.join(homeDir, '.workbuddy-ai', 'projects'),
    path.join(homeDir, '.workbuddy', 'projects')
  ];
  if (options.dirPath) dirPaths.unshift(options.dirPath);
  const sourceKind = options.sourceKind || 'workbuddy-projects';
  const sourceId = normalizeSourceId(options.sourceId || dirPaths[0] || 'workbuddy');

  function read({ watermark = null, now = Date.now() } = {}) {
    const oldCursor = watermark?.cursor || {};
    const oldFiles = oldCursor.files || {};
    const newFilesCursor = { ...oldFiles };

    const validRoots = dirPaths.filter((d) => fs.existsSync(d));
    if (validRoots.length === 0) {
      return makeAdapterResult([], { generation: Number(watermark?.generation || 1) }, null, { complete: true, missing: true });
    }

    const seen = new Set();
    const events = [];

    for (const root of validRoots) {
      for (const filePath of walkAllJsonl(root)) {
        let stat;
        try { stat = fs.statSync(filePath); } catch (_) { continue; }
        const prev = oldFiles[filePath];
        if (prev && prev.mtimeMs === stat.mtimeMs && prev.size === stat.size) {
          continue; // incremental skip
        }
        newFilesCursor[filePath] = { mtimeMs: stat.mtimeMs, size: stat.size };

        let content;
        try { content = fs.readFileSync(filePath, 'utf8'); } catch (_) { continue; }
        const lines = content.split(/\r?\n/);

        for (const line of lines) {
          if (!line.includes('"usage"')) continue;
          let obj;
          try { obj = JSON.parse(line); } catch (_) { continue; }
          const u = obj.usage || obj.providerData?.usage || obj.providerData?.rawUsage || obj.rawUsage;
          if (!u) continue;

          const msgId = obj.providerData?.messageId || obj.id || null;
          const reqId = obj.providerData?.conversationRequestId || obj.requestId || null;
          const dedupeKey = (msgId !== null || reqId !== null)
            ? `${msgId ?? ''}:${reqId ?? ''}`
            : `${path.basename(filePath)}:${line.length}:${obj.timestamp || 0}`;

          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const model = obj.providerData?.model || obj.providerData?.requestModelId || obj.model || 'unknown';
          const rawPrompt = number(u.inputTokens ?? u.prompt_tokens ?? u.input_tokens);
          const outputTokens = number(u.outputTokens ?? u.completion_tokens ?? u.output_tokens);
          const cachedInputTokens = number(u.inputTokensDetails?.[0]?.cached_tokens ?? u.prompt_cache_hit_tokens ?? u.cached_tokens ?? u.cache_read_input_tokens);
          const cacheWriteTokens = number(u.prompt_cache_write_tokens ?? u.cache_creation_input_tokens);
          const reasoningTokens = number(u.outputTokensDetails?.[0]?.reasoning_tokens ?? u.completion_thinking_tokens ?? u.completion_tokens_details?.reasoning_tokens ?? u.reasoning_tokens);
          const inputTokens = Math.max(0, rawPrompt - cachedInputTokens - cacheWriteTokens);
          const totalTokens = number(u.totalTokens ?? u.total_tokens ?? (rawPrompt + outputTokens));

          const occurredAtMs = obj.timestamp ? (typeof obj.timestamp === 'number' ? obj.timestamp : Date.parse(obj.timestamp)) : (stat.mtimeMs || now);
          const date = localDayKey(new Date(Number.isFinite(occurredAtMs) ? occurredAtMs : now));

          events.push(partitionEventKey(eventFromValue({
            naturalKey: `${sourceKind}:${sourceId}:${dedupeKey}`,
            clientId: 'workbuddy',
            sourceKind,
            sourceId,
            sessionId: obj.sessionId || path.basename(filePath, '.jsonl'),
            requestId: reqId || msgId || null,
            occurredAtMs: Number.isFinite(occurredAtMs) ? occurredAtMs : now,
            dateBucket: date,
            modelId: model,
            inputTokens,
            cachedInputTokens,
            cacheWriteTokens,
            outputTokens,
            reasoningTokens,
            totalTokens
          }, { sourceKind, sourceId, clientId: 'workbuddy', occurredAtMs }), sourceKind, sourceId));
        }
      }
    }

    const nextCursor = {
      files: newFilesCursor,
      generation: Number(watermark?.generation || 1)
    };

    return makeAdapterResult(events, nextCursor, `${sourceKind}:${events.length}`, { complete: true, rewrite: false });
  }

  return { sourceKind, sourceId, read };
}

function createZCodeAdapter(options = {}) {
  const homeDir = options.homeDir || process.env.USERPROFILE || process.env.HOME || os.homedir();
  const filePath = path.resolve(options.filePath || options.path || path.join(homeDir, '.zcode', 'cli', 'db', 'db.sqlite'));
  const sourceKind = options.sourceKind || 'zcode-db';
  const sourceId = normalizeSourceId(options.sourceId || filePath);

  function read({ watermark = null } = {}) {
    if (!fs.existsSync(filePath)) {
      return makeAdapterResult([], { generation: Number(watermark?.generation || 1) }, null, { complete: true, missing: true });
    }
    const oldCursor = watermark?.cursor || {};
    const maxStartedAt = Number(oldCursor.maxStartedAt || 0);

    let db;
    try {
      db = new DatabaseSync(filePath, { readOnly: true });
      const sql = `
        SELECT
          t.session_id,
          t.turn_id,
          t.started_at,
          t.input_tokens,
          t.output_tokens,
          t.reasoning_tokens,
          t.cache_creation_input_tokens,
          t.cache_read_input_tokens,
          t.computed_total_tokens,
          COALESCE(m.model_id, 'glm-5.3') AS model_id
        FROM turn_usage t
        LEFT JOIN (
          SELECT turn_id, model_id FROM model_usage WHERE model_id IS NOT NULL AND model_id <> '' GROUP BY turn_id
        ) m ON t.turn_id = m.turn_id
        WHERE t.computed_total_tokens > 0 AND t.started_at > ?
        ORDER BY t.started_at ASC, t.turn_id ASC
      `;
      const rows = db.prepare(sql).all(maxStartedAt);
      const events = [];
      let newMaxStartedAt = maxStartedAt;

      for (const row of rows) {
        const startedAt = Number(row.started_at) || Date.now();
        newMaxStartedAt = Math.max(newMaxStartedAt, startedAt);
        const date = localDayKey(new Date(startedAt));
        const dedupeKey = row.turn_id || `${row.session_id}:${startedAt}`;
        const inputTokens = Math.max(0, number(row.input_tokens) - number(row.cache_read_input_tokens) - number(row.cache_creation_input_tokens));
        const cachedInputTokens = number(row.cache_read_input_tokens);
        const cacheWriteTokens = number(row.cache_creation_input_tokens);
        const outputTokens = number(row.output_tokens);
        const reasoningTokens = number(row.reasoning_tokens);
        const totalTokens = number(row.computed_total_tokens);

        events.push(partitionEventKey(eventFromValue({
          naturalKey: `${sourceKind}:${sourceId}:${dedupeKey}`,
          clientId: 'zcode',
          sourceKind,
          sourceId,
          sessionId: row.session_id || null,
          requestId: row.turn_id || null,
          occurredAtMs: startedAt,
          dateBucket: date,
          modelId: row.model_id || 'glm-5.3',
          inputTokens,
          cachedInputTokens,
          cacheWriteTokens,
          outputTokens,
          reasoningTokens,
          totalTokens
        }, { sourceKind, sourceId, clientId: 'zcode', occurredAtMs: startedAt }), sourceKind, sourceId));
      }

      const nextCursor = {
        maxStartedAt: newMaxStartedAt,
        generation: Number(watermark?.generation || 1)
      };

      return makeAdapterResult(events, nextCursor, `${sourceKind}:${newMaxStartedAt}`, { complete: true, rewrite: false });
    } finally {
      if (db) try { db.close(); } catch (_) {}
    }
  }

  return { sourceKind, sourceId, read };
}

module.exports = {
  createAdapterResult: makeAdapterResult,
  createAppendFileAdapter,
  createAppendOnlyAdapter,
  createNdjsonAdapter,
  createSnapshotAdapter,
  createSqliteAdapter,
  createAntigravityAdapter,
  createClaudeAdapter,
  createOpenCodeAdapter,
  createCodexAdapter,
  createWorkBuddyAdapter,
  createZCodeAdapter,
  codexAdapter: createCodexAdapter,
  workBuddyAdapter: createWorkBuddyAdapter,
  zcodeAdapter: createZCodeAdapter,
  appendFileAdapter: createAppendFileAdapter,
  sqliteAdapter: createSqliteAdapter,
  snapshotAdapter: createSnapshotAdapter,
  antigravityAdapter: createAntigravityAdapter,
  claudeAdapter: createClaudeAdapter,
  openCodeAdapter: createOpenCodeAdapter,
  eventFromValue,
  mergeSessionObservations,
  normalizeSourceId,
  sourceIdForRoot,
  statFingerprint
};
