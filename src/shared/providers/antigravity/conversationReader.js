'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

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

function fields(bytes) {
  let offset = 0;
  const result = new Map();
  const varint = () => {
    let value = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      const byte = bytes[offset++];
      if (byte === undefined || (shift === 63n && byte > 1)) {
        throw new Error('Invalid Antigravity protobuf varint');
      }
      value |= BigInt(byte & 127) << shift;
      if (byte < 128) {
        return value > BigInt(Number.MAX_SAFE_INTEGER) ? value : Number(value);
      }
    }
    throw new Error('Invalid Antigravity protobuf varint');
  };
  while (offset < bytes.length) {
    const tag = varint();
    if (typeof tag !== 'number') throw new Error('Invalid protobuf field');
    const number = Math.floor(tag / 8);
    const wire = tag % 8;
    if (number === 0) throw new Error('Invalid protobuf field');
    let value;
    if (wire === 0) {
      value = varint();
    } else if (wire === 1 || wire === 5 || wire === 2) {
      const length = wire === 2 ? varint() : wire === 1 ? 8 : 4;
      if (typeof length !== 'number') throw new Error('Invalid protobuf field length');
      if (length > bytes.length - offset) throw new Error('Truncated protobuf field');
      value = bytes.subarray(offset, offset + length);
      offset += length;
      if (wire !== 2) continue;
    } else {
      throw new Error('Unsupported protobuf wire type');
    }
    const entries = result.get(number) ?? [];
    entries.push(value);
    result.set(number, entries);
  }
  return result;
}

const numberAt = (value, key) => {
  const entry = value.get(key)?.[0];
  return typeof entry === 'number' ? entry : 0;
};

const bytesAt = (value, key) => {
  const entry = value.get(key)?.[0];
  return entry instanceof Uint8Array ? entry : undefined;
};

const nested = (value, key) => {
  const bytes = bytesAt(value, key);
  return bytes === undefined ? new Map() : fields(bytes);
};

const textAt = (value, key) => {
  const bytes = bytesAt(value, key);
  return bytes === undefined ? '' : new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
};

const timestamp = (value) => {
  const seconds = numberAt(value, 1);
  return seconds > 0 ? seconds * 1000 + Math.floor(numberAt(value, 2) / 1_000_000) : null;
};

const MODEL_IDS = {
  246: 'gemini-2.5-pro',
  312: 'gemini-2.5-flash',
  313: 'gemini-2.5-flash-thinking',
  329: 'gemini-2.5-flash-thinking',
  330: 'gemini-2.5-flash-lite',
  281: 'claude-sonnet-4',
  282: 'claude-sonnet-4',
  290: 'claude-opus-4',
  291: 'claude-opus-4',
  333: 'claude-sonnet-4-5',
  334: 'claude-sonnet-4-5',
  340: 'claude-haiku-4-5',
  341: 'claude-haiku-4-5',
  1026: 'claude-opus-4-6',
  1035: 'claude-sonnet-4-6',
  1016: 'gemini-3.1-pro',
  1036: 'gemini-3.1-pro',
  1037: 'gemini-3.1-pro',
  1018: 'gemini-3-flash-preview',
  1084: 'gemini-3-flash-preview',
  1047: 'gemini-3-flash-preview',
};

function modelName(name, id) {
  if (name) {
    const normalized = name
      .toLowerCase()
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replaceAll(' ', '-');
    if (normalized.startsWith('claude-')) {
      return normalized
        .replace(/^claude-(4(?:\.\d+)?)-(sonnet|opus|haiku)/, 'claude-$2-$1')
        .replaceAll('.', '-');
    }
    return normalized;
  }
  return MODEL_IDS[id] ?? (id > 0 ? `antigravity-model-${id}` : '');
}

function metadata(bytes, step) {
  const root = fields(bytes);
  if (!step && bytesAt(root, 1) === undefined) {
    throw new Error('Missing Antigravity generation metadata');
  }
  const data = step ? root : nested(root, 1);
  const model = step ? nested(data, 24) : data;
  const usage = bytesAt(data, step ? 9 : 4);
  const usages = usage === undefined ? [] : [fields(usage.slice())];
  for (const retry of data.get(step ? 28 : 17) ?? []) {
    if (!(retry instanceof Uint8Array)) throw new Error('Invalid retry metadata');
    const retryUsage = bytesAt(fields(retry), 2);
    if (retryUsage !== undefined) usages.push(fields(retryUsage.slice()));
  }
  return {
    model: modelName(
      textAt(model, step ? 12 : 19) || textAt(model, step ? 8 : 21),
      numberAt(model, step ? 1 : 3),
    ),
    timestampMs: step
      ? (timestamp(nested(data, 8)) ?? timestamp(nested(data, 1)))
      : timestamp(nested(nested(data, 9), 4)),
    usages,
  };
}

function usageCandidates(sessionId, generations, steps, trajectoryTimestamp, fallbackTimestamp) {
  const records = [];
  const generationModels = new Map(generations.map(({ idx, entry }) => [idx, entry.model]));
  for (const [source, entries] of [
    ['step', steps],
    ['generation', generations],
  ]) {
    for (const [index, { idx, entry }] of entries.entries()) {
      for (const [usageIndex, usage] of entry.usages.entries()) {
        const outputTokens = Math.max(numberAt(usage, 3), numberAt(usage, 9) + numberAt(usage, 10));
        const totals = {
          uncachedInputTokens: numberAt(usage, 2),
          cachedInputTokens: numberAt(usage, 5),
          cacheCreationTokens: numberAt(usage, 4),
          outputTokens,
          reasoningTokens: Math.min(outputTokens, numberAt(usage, 9)),
        };
        if (
          totals.uncachedInputTokens +
            totals.cachedInputTokens +
            totals.cacheCreationTokens +
            outputTokens ===
          0
        ) {
          continue;
        }
        const keys = [11, 12, 7].flatMap((key) => {
          const id = textAt(usage, key);
          return id ? [`antigravity:${key}:${id}`] : [];
        });
        const record = {
          provider: 'antigravity',
          sessionId,
          timestampMs: entry.timestampMs ?? trajectoryTimestamp ?? fallbackTimestamp,
          model:
            MODEL_IDS[numberAt(usage, 1)] ||
            entry.model ||
            (source === 'step' ? generationModels.get(idx) : '') ||
            modelName('', numberAt(usage, 1)) ||
            'antigravity-unknown',
          totals,
          reportedCostUsd: null,
          speed: 'standard',
          dedupeKey: keys[0] ?? `antigravity:${sessionId}:${source}:${index}:${usageIndex}`,
        };
        records.push({
          record,
          keys,
          timestampQuality: entry.timestampMs !== null ? 2 : trajectoryTimestamp !== null ? 1 : 0,
        });
      }
    }
  }
  return records;
}

function readDatabase(dbPath, sessionId, fallbackTimestamp) {
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 250');
    db.exec('PRAGMA query_only = ON');
  } catch (_) {
    return [];
  }
  try {
    const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const tables = new Set(tableRows.map((r) => r.name));
    if (!tables.has('gen_metadata') && !tables.has('steps')) {
      return [];
    }
    function readMetadata(query, step) {
      const entries = [];
      let after = -Infinity;
      const stmt = db.prepare(query);
      const pageRows = step ? 64 : 1;
      while (true) {
        const rows = stmt.all(after, pageRows);
        for (const row of rows) {
          if (step && row.data === null) continue;
          if (typeof row.idx !== 'number') continue;
          try {
            const entry = metadata(row.data, step);
            entries.push({ idx: row.idx, entry });
          } catch (_) {}
        }
        if (rows.length < pageRows) break;
        after = rows[rows.length - 1].row_id;
      }
      return entries.sort((a, b) => a.idx - b.idx);
    }
    const generations = tables.has('gen_metadata')
      ? readMetadata('SELECT rowid AS row_id, idx, data FROM gen_metadata WHERE rowid > ? ORDER BY rowid LIMIT ?', false)
      : [];
    let trajectoryTimestamp = null;
    if (tables.has('trajectory_metadata_blob')) {
      const rows = db.prepare('SELECT data FROM trajectory_metadata_blob').all();
      for (const row of rows) {
        if (row.data) {
          try {
            trajectoryTimestamp ??= timestamp(nested(fields(row.data), 2));
          } catch (_) {}
        }
      }
    }
    const steps = tables.has('steps')
      ? readMetadata('SELECT rowid AS row_id, idx, metadata AS data FROM steps WHERE rowid > ? ORDER BY rowid LIMIT ?', true)
      : [];
    return usageCandidates(sessionId, generations, steps, trajectoryTimestamp, fallbackTimestamp);
  } catch (_) {
    return [];
  } finally {
    try { db.close(); } catch (_) {}
  }
}

function discoverAntigravityRoots(options = {}) {
  const platform = options.platform || process.platform;
  const isHost = platform === process.platform;
  const home = options.homeDir || options.home || (isHost ? os.homedir() : '');
  const env = options.env || (isHost ? process.env : {});
  const roots = [];

  // 1. ANTIGRAVITY_DATA_DIR override (comma-separated list)
  const envDataDir = env.ANTIGRAVITY_DATA_DIR;
  if (envDataDir) {
    for (const raw of envDataDir.split(',')) {
      const trimmed = raw.trim();
      if (trimmed) roots.push(path.resolve(expandHomePath(trimmed, home || os.homedir())));
    }
  }

  // 2. Default Gemini roots
  if (home) {
    for (const name of ['antigravity', 'antigravity-cli', 'antigravity-ide', 'antigravity-backup']) {
      roots.push(path.join(home, '.gemini', name));
    }
    roots.push(path.join(home, '.config', 'antigravity'));
  }

  // 3. GEMINI_HOME or GEMINI_CLI_HOME
  const configuredGemini = env.GEMINI_HOME || env.GEMINI_CLI_HOME;
  if (configuredGemini) {
    const base = path.resolve(expandHomePath(configuredGemini, home || os.homedir()));
    const allowed = options.env ? true : (!home || dirContains(home, base));
    if (allowed) {
      roots.push(base);
      for (const sub of ['antigravity-acp', 'antigravity-cli']) {
        roots.push(path.join(base, sub));
      }
    }
  }

  // 4. T3 user data providers directory
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
              roots.push(path.join(t3Providers, entry.name, 'antigravity-acp'));
            }
          }
        }
      } catch (_) {}
    }
  }

  // Map each root to its conversations directory if present
  const conversationDirs = new Set();
  for (const r of roots) {
    try {
      if (!fs.existsSync(r)) continue;
      const conv = path.join(r, 'conversations');
      const target = (fs.existsSync(conv) && fs.statSync(conv).isDirectory()) ? conv : r;
      let canonical;
      try { canonical = fs.realpathSync(target); } catch (_) { canonical = target; }
      conversationDirs.add(canonical);
    } catch (_) {}
  }

  return [...conversationDirs];
}

function makeAntigravityUsageCache() {
  return new Map();
}

function readAntigravityUsage(conversationDirectories, sinceMs = 0, cache = undefined) {
  const roots = Array.isArray(conversationDirectories) ? conversationDirectories : [conversationDirectories];
  const files = [];
  const errors = [];
  const identities = new Map();
  const groups = [];

  const find = (index) => {
    let root = index;
    while (groups[root].parent !== root) root = groups[root].parent;
    while (index !== root) {
      const parent = groups[index].parent;
      groups[index].parent = root;
      index = parent;
    }
    return root;
  };

  const merge = (left, right) => {
    let a = find(left);
    let b = find(right);
    if (a === b) return a;
    if (groups[a].size < groups[b].size) {
      const tmp = a; a = b; b = tmp;
    }
    const target = groups[a];
    const source = groups[b];
    const first = target.owner < source.owner ? target : source;
    const bestTime =
      source.timestampQuality > target.timestampQuality ||
      (source.timestampQuality === target.timestampQuality &&
        source.record.timestampMs < target.record.timestampMs)
        ? source
        : target;
    const x = target.record.totals;
    const y = source.record.totals;
    target.record = {
      ...first.record,
      model:
        first.record.model === 'antigravity-unknown'
          ? first === target
            ? source.record.model
            : target.record.model
          : first.record.model,
      timestampMs: bestTime.record.timestampMs,
      totals: {
        uncachedInputTokens: Math.max(x.uncachedInputTokens, y.uncachedInputTokens),
        cachedInputTokens: Math.max(x.cachedInputTokens, y.cachedInputTokens),
        cacheCreationTokens: Math.max(x.cacheCreationTokens, y.cacheCreationTokens),
        outputTokens: Math.max(x.outputTokens, y.outputTokens),
        reasoningTokens: Math.max(x.reasoningTokens, y.reasoningTokens),
      },
    };
    target.timestampQuality = bestTime.timestampQuality;
    target.owner = first.owner;
    target.fileIndex = first.fileIndex;
    target.size += source.size;
    source.parent = a;
    return a;
  };

  const append = (candidate, fileIndex) => {
    const index = groups.length;
    groups.push({ ...candidate, parent: index, size: 1, owner: index, fileIndex });
    for (const key of candidate.keys) {
      const existing = identities.get(key);
      if (existing !== undefined) merge(index, existing);
      identities.set(key, index);
    }
  };

  const visited = new Set();

  function readFile(filePath) {
    let canonical;
    try { canonical = fs.realpathSync(filePath); } catch (_) { canonical = filePath; }
    if (visited.has(canonical)) return null;
    visited.add(canonical);

    function fingerprintOf(file) {
      try {
        const stat = fs.statSync(file);
        return `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      } catch (_) {
        return null;
      }
    }

    const part = fingerprintOf(canonical);
    if (!part) return null;
    const walPart = fingerprintOf(`${canonical}-wal`) || '-';
    const fingerprint = `${part}/${walPart}`;

    const cached = cache?.get(canonical);
    if (cached && cached.fingerprint === fingerprint) {
      return cached.candidates;
    }

    let stat;
    try { stat = fs.statSync(canonical); } catch (_) { return null; }
    const candidates = readDatabase(canonical, path.basename(canonical, '.db'), stat.mtimeMs);
    cache?.set(canonical, { fingerprint, candidates });
    return candidates;
  }

  function walk(directory, root) {
    let names;
    try {
      names = fs.readdirSync(directory);
    } catch (_) {
      errors.push(directory);
      return;
    }
    names.sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const fullPath = path.join(directory, name);
      let stat;
      try {
        stat = fs.lstatSync(fullPath);
      } catch (_) {
        continue;
      }
      if (stat.isSymbolicLink()) {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath, root);
      } else if (stat.isFile() && name.endsWith('.db')) {
        let candidates;
        try {
          candidates = readFile(fullPath);
        } catch (_) {
          errors.push(fullPath);
          continue;
        }
        if (candidates === null) continue;
        const fileIndex = files.length;
        files.push({ root, path: fullPath, records: [] });
        for (const candidate of candidates) {
          append(candidate, fileIndex);
        }
      }
    }
  }

  for (const root of roots) {
    walk(root, root);
  }

  if (cache !== undefined) {
    for (const key of cache.keys()) {
      if (!visited.has(key)) cache.delete(key);
    }
  }

  const allRecords = [];
  for (const [index, group] of groups.entries()) {
    if (group.parent === index && group.record.timestampMs >= sinceMs) {
      files[group.fileIndex]?.records.push(group.record);
      allRecords.push(group.record);
    }
  }

  return { files, errors, records: allRecords };
}

module.exports = {
  discoverAntigravityRoots,
  fields,
  makeAntigravityUsageCache,
  metadata,
  modelName,
  readAntigravityUsage,
  readDatabase,
  usageCandidates,
};
