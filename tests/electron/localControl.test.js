'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createRpcDispatcher,
  startLocalControlServer,
  MAX_BODY_BYTES,
  constantTimeCompare,
  sanitizeResponse,
  redactHomePath
} = require('../../src/electron/localControl');

function requestRpc({ port, token, host, origin, method = 'POST', path: reqPath = '/rpc', body }) {
  return new Promise((resolve, reject) => {
    const serialized = body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const headers = {};
    if (host !== undefined) headers.host = host;
    else headers.host = `127.0.0.1:${port}`;
    if (origin !== undefined) headers.origin = origin;
    if (token !== undefined) headers.authorization = `Bearer ${token}`;
    headers.connection = 'close';
    if (serialized) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(serialized);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers,
      agent: false
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          text,
          json
        });
      });
    });

    req.on('error', reject);
    if (serialized) req.write(serialized);
    req.end();
  });
}

test('constantTimeCompare securely compares strings and handles mismatches', () => {
  assert.equal(constantTimeCompare('secret-token-123', 'secret-token-123'), true);
  assert.equal(constantTimeCompare('secret-token-123', 'secret-token-456'), false);
  assert.equal(constantTimeCompare('short', 'longer-token'), false);
  assert.equal(constantTimeCompare('', 'token'), false);
  assert.equal(constantTimeCompare(null, 'token'), false);
});

test('sanitizeResponse redacts home dir paths and sensitive credentials', () => {
  const fakeHome = process.platform === 'win32' ? 'C:\\\\Users\\\\testuser' : '/home/testuser';
  assert.equal(redactHomePath(`${fakeHome}/.config/app`, fakeHome), '~/.config/app');

  const rawData = {
    accountKey: 'acc-123',
    titleKey: 'settings.title',
    userCode: 'ABCD-EFGH',
    verificationUrl: 'https://github.com/login/device',
    apiKey: 'sk-secret-key-999',
    accessToken: 'gho_oauth_token_xyz',
    cookie: 'session=12345',
    copilotApiToken: 'token_abc',
    configPath: `${fakeHome}/projects/app/config.json`,
    nested: {
      clientSecret: 'secret_val',
      status: 'ok',
      home: fakeHome
    },
    list: [
      { id: '1', secret: 'hide-me' },
      { authHeader: 'Bearer my-bearer-token' }
    ]
  };

  const sanitized = sanitizeResponse(rawData, fakeHome);

  // Metadata keys must NOT be redacted
  assert.equal(sanitized.accountKey, 'acc-123');
  assert.equal(sanitized.titleKey, 'settings.title');
  assert.equal(sanitized.userCode, 'ABCD-EFGH');
  assert.equal(sanitized.verificationUrl, 'https://github.com/login/device');
  assert.equal(sanitized.nested.status, 'ok');
  assert.equal(sanitized.list[0].id, '1');

  // Secrets must be redacted
  assert.equal(sanitized.apiKey, '[REDACTED]');
  assert.equal(sanitized.accessToken, '[REDACTED]');
  assert.equal(sanitized.cookie, '[REDACTED]');
  assert.equal(sanitized.copilotApiToken, '[REDACTED]');
  assert.equal(sanitized.nested.clientSecret, '[REDACTED]');
  assert.equal(sanitized.list[0].secret, '[REDACTED]');

  // Home paths must be replaced with ~
  assert.equal(sanitized.configPath, '~/projects/app/config.json');
  assert.equal(sanitized.nested.home, '~');

  // Bearer in strings must be masked
  assert.equal(sanitized.list[1].authHeader, 'Bearer [REDACTED]');
});

test('local control server authentication and security guards', async () => {
  const token = 'test-token-0123456789abcdef0123456789abcdef';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-lc-test-'));

  const dispatcher = createRpcDispatcher({
    getSessionDetail: async ({ sessionId }) => ({ id: sessionId, detail: 'fake-detail' }),
    getCurrency: async () => ({ currency: 'USD' })
  });

  const control = await startLocalControlServer({
    dispatcher,
    token,
    userDataPath: tmpDir,
    appVersion: '1.2.3'
  });

  try {
    const { port, stateFilePath } = control;

    // 1. Verify state file written
    assert.ok(fs.existsSync(stateFilePath));
    const stateContent = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    assert.equal(stateContent.port, port);
    assert.equal(stateContent.token, token);
    assert.equal(stateContent.pid, process.pid);
    assert.equal(stateContent.version, '1.2.3');

    // 2. Missing authorization header -> 401
    const resNoAuth = await requestRpc({
      port,
      body: { method: 'currency.get' }
    });
    assert.equal(resNoAuth.statusCode, 401);
    assert.equal(resNoAuth.json?.ok, false);
    assert.equal(resNoAuth.json?.error?.code, 'UNAUTHORIZED');

    // 3. Wrong authorization token -> 401
    const resWrongToken = await requestRpc({
      port,
      token: 'wrong-token',
      body: { method: 'currency.get' }
    });
    assert.equal(resWrongToken.statusCode, 401);
    assert.equal(resWrongToken.json?.ok, false);
    assert.equal(resWrongToken.json?.error?.code, 'UNAUTHORIZED');

    // 4. Origin header present (browser CSRF attempt) -> 403
    const resOrigin = await requestRpc({
      port,
      token,
      origin: 'http://malicious.example.com',
      body: { method: 'currency.get' }
    });
    assert.equal(resOrigin.statusCode, 403);
    assert.equal(resOrigin.json?.ok, false);
    assert.equal(resOrigin.json?.error?.code, 'FORBIDDEN_ORIGIN');

    // 5. Invalid Host header (DNS rebinding attempt) -> 400
    const resBadHost = await requestRpc({
      port,
      token,
      host: 'attacker.com',
      body: { method: 'currency.get' }
    });
    assert.equal(resBadHost.statusCode, 400);
    assert.equal(resBadHost.json?.ok, false);
    assert.equal(resBadHost.json?.error?.code, 'INVALID_HOST');

    // 6. Invalid HTTP method (GET instead of POST) -> 405
    const resGet = await requestRpc({
      port,
      token,
      method: 'GET'
    });
    assert.equal(resGet.statusCode, 405);
    assert.equal(resGet.json?.ok, false);
    assert.equal(resGet.json?.error?.code, 'METHOD_NOT_ALLOWED');

    // 7. Invalid endpoint path -> 404
    const resBadPath = await requestRpc({
      port,
      token,
      path: '/not-rpc',
      body: { method: 'currency.get' }
    });
    assert.equal(resBadPath.statusCode, 404);
    assert.equal(resBadPath.json?.ok, false);
    assert.equal(resBadPath.json?.error?.code, 'NOT_FOUND');

    // 8. Malformed JSON payload -> 400
    const resBadJson = await requestRpc({
      port,
      token,
      body: '{ not valid json'
    });
    assert.equal(resBadJson.statusCode, 400);
    assert.equal(resBadJson.json?.ok, false);
    assert.equal(resBadJson.json?.error?.code, 'INVALID_JSON');

    // 9. Unknown/unallowlisted method -> 404
    const resUnknownMethod = await requestRpc({
      port,
      token,
      body: { method: 'dangerous.eval', params: {} }
    });
    assert.equal(resUnknownMethod.statusCode, 404);
    assert.equal(resUnknownMethod.json?.ok, false);
    assert.equal(resUnknownMethod.json?.error?.code, 'METHOD_NOT_FOUND');

    // 10. Valid call -> 200 OK
    const resOk = await requestRpc({
      port,
      token,
      body: { method: 'currency.get' }
    });
    assert.equal(resOk.statusCode, 200);
    assert.equal(resOk.json?.ok, true);
    assert.deepEqual(resOk.json?.result, { currency: 'USD' });

    // 11. Valid call with params and session.getDetail
    const resSession = await requestRpc({
      port,
      token,
      body: { method: 'session.getDetail', params: { sessionId: 'sess-1' } }
    });
    assert.equal(resSession.statusCode, 200);
    assert.equal(resSession.json?.ok, true);
    assert.deepEqual(resSession.json?.result, { id: 'sess-1', detail: 'fake-detail' });
  } finally {
    await control.close();
    // Verify state file is cleaned up after close
    assert.equal(fs.existsSync(control.stateFilePath), false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('local control server rejects payloads exceeding 1 MiB', async () => {
  const token = 'test-token-payload-limit-test-123456';
  const dispatcher = createRpcDispatcher({
    testEcho: async (params) => params
  });

  const control = await startLocalControlServer({
    dispatcher,
    token
  });

  try {
    const { port } = control;
    const oversizedBody = JSON.stringify({
      method: 'testEcho',
      params: { big: 'x'.repeat(MAX_BODY_BYTES + 1024) }
    });

    const res = await requestRpc({
      port,
      token,
      body: oversizedBody
    });

    assert.equal(res.statusCode, 413);
    assert.equal(res.json?.ok, false);
    assert.equal(res.json?.error?.code, 'PAYLOAD_TOO_LARGE');
  } finally {
    await control.close();
  }
});

test('local control server dispatches all allowlisted RPC methods and redacts secrets in responses', async () => {
  const token = 'test-token-dispatch-methods-coverage-0123';
  const calls = [];

  const dispatcher = createRpcDispatcher({
    getSessionDetail: (p) => { calls.push(['getSessionDetail', p]); return { sessionId: p?.sessionId, home: os.homedir(), apiKey: 'secret' }; },
    getClientSources: (p) => { calls.push(['getClientSources', p]); return { sources: ['src1'] }; },
    setTrackedClients: (p) => { calls.push(['setTrackedClients', p]); return { ok: true }; },
    setClientDisplayOrder: (p) => { calls.push(['setClientDisplayOrder', p]); return { ok: true }; },
    setCustomScanPath: (p) => { calls.push(['setCustomScanPath', p]); return { ok: true }; },
    setWslScanning: (p) => { calls.push(['setWslScanning', p]); return { ok: true }; },
    rescanClients: (p) => { calls.push(['rescanClients', p]); return { ok: true }; },
    repairClientSyncLock: (p) => { calls.push(['repairClientSyncLock', p]); return { ok: true }; },
    getCollectionCadence: () => { calls.push(['getCollectionCadence']); return { collectionMode: 'smart' }; },
    setCollectionCadence: (p) => { calls.push(['setCollectionCadence', p]); return { ok: true }; },
    getSessionArchiveRetain: () => { calls.push(['getSessionArchiveRetain']); return { retain: true }; },
    setSessionArchiveRetain: (p) => { calls.push(['setSessionArchiveRetain', p]); return { ok: true }; },
    clearSessionArchive: () => { calls.push(['clearSessionArchive']); return { ok: true }; },
    generateDiagnosticsReport: () => { calls.push(['generateDiagnosticsReport']); return { text: 'report' }; },
    getTokscaleStatus: () => { calls.push(['getTokscaleStatus']); return { binary: 'ok' }; },
    listAccountForms: () => { calls.push(['listAccountForms']); return [{ provider: 'claude', accountKey: 'acc-1', apiKey: 'secret-key' }]; },
    saveLimitCredential: (p) => { calls.push(['saveLimitCredential', p]); return { ok: true }; },
    clearLimitCredential: (p) => { calls.push(['clearLimitCredential', p]); return { ok: true }; },
    refreshLimits: (p) => { calls.push(['refreshLimits', p]); return { ok: true }; },
    startAntigravitySignIn: () => { calls.push(['startAntigravitySignIn']); return { ok: true }; },
    cancelAntigravitySignIn: () => { calls.push(['cancelAntigravitySignIn']); return { ok: true }; },
    startCopilotSignIn: (p) => { calls.push(['startCopilotSignIn', p]); return { ok: true, flowId: p?.flowId || 'copilot-1' }; },
    cancelCopilotSignIn: (p) => { calls.push(['cancelCopilotSignIn', p]); return { ok: true }; },
    startCodexSignIn: (p) => { calls.push(['startCodexSignIn', p]); return { ok: true, flowId: p?.flowId || 'codex-1' }; },
    cancelCodexSignIn: (p) => { calls.push(['cancelCodexSignIn', p]); return { ok: true }; },
    getSignInStatus: (p) => { calls.push(['getSignInStatus', p]); return { ok: true, flowId: p?.flowId, phase: 'authorize', userCode: 'CODE-123', verificationUrl: 'https://github.com/login/device' }; },
    selectCodexWorkspace: (p) => { calls.push(['selectCodexWorkspace', p]); return { ok: true }; },
    listCodexAccounts: () => { calls.push(['listCodexAccounts']); return [{ id: 'codex-1' }]; },
    switchCodexAccount: (p) => { calls.push(['switchCodexAccount', p]); return { ok: true }; },
    getCurrency: () => { calls.push(['getCurrency']); return { currency: 'EUR' }; },
    setCurrency: (p) => { calls.push(['setCurrency', p]); return { ok: true }; },
    getLimitsDisplay: () => {
      calls.push(['getLimitsDisplay']);
      return {
        providerOrder: ['claude', 'codex'],
        hiddenProviders: ['kimi'],
        refreshMode: 'adaptive',
        refreshIntervalMs: 60000,
        maskAccountEmails: true
      };
    },
    setLimitsDisplay: (p) => { calls.push(['setLimitsDisplay', p]); return { ok: true, ...p }; },
    getExportSettings: () => {
      calls.push(['getExportSettings']);
      return {
        enabled: true,
        directory: path.join(os.homedir(), 'exports'),
        cadence: 120000
      };
    },
    setExportSettings: (p) => { calls.push(['setExportSettings', p]); return { ok: true, ...p }; },
    getModelAliasGrouping: () => { calls.push(['getModelAliasGrouping']); return { grouping: 'prefix' }; },
    setModelAliasGrouping: (p) => { calls.push(['setModelAliasGrouping', p]); return { ok: true, grouping: p?.grouping || 'off' }; }
  });

  const control = await startLocalControlServer({ dispatcher, token });
  try {
    const { port } = control;

    // 1. Session detail with sanitization verification
    const r1 = await requestRpc({ port, token, body: { method: 'session.getDetail', params: { sessionId: 's-123' } } });
    assert.equal(r1.statusCode, 200);
    assert.equal(r1.json.result.sessionId, 's-123');
    assert.equal(r1.json.result.home, '~');
    assert.equal(r1.json.result.apiKey, '[REDACTED]');

    // Colon alias session:getDetail
    const r1Alias = await requestRpc({ port, token, body: { method: 'session:getDetail', params: { sessionId: 's-123' } } });
    assert.equal(r1Alias.statusCode, 200);

    // 2. Client sources
    const r2 = await requestRpc({ port, token, body: { method: 'clientSources.list', params: { clientId: 'claude' } } });
    assert.equal(r2.statusCode, 200);
    assert.deepEqual(r2.json.result, { sources: ['src1'] });

    const r2Tracked = await requestRpc({ port, token, body: { method: 'clientSources.setTracked', params: { clients: 'claude,codex' } } });
    assert.equal(r2Tracked.statusCode, 200);

    const r2Order = await requestRpc({ port, token, body: { method: 'clientSources.setOrder', params: { order: 'codex,claude' } } });
    assert.equal(r2Order.statusCode, 200);

    const r2ScanPath = await requestRpc({ port, token, body: { method: 'clientSources.setCustomScanPath', params: { clientId: 'claude', dir: '/test' } } });
    assert.equal(r2ScanPath.statusCode, 200);

    const r2Wsl = await requestRpc({ port, token, body: { method: 'clientSources.setWslScanning', params: { enabled: true } } });
    assert.equal(r2Wsl.statusCode, 200);

    const r2Rescan = await requestRpc({ port, token, body: { method: 'clientSources.rescan', params: { clientId: 'claude' } } });
    assert.equal(r2Rescan.statusCode, 200);

    const r2Lock = await requestRpc({ port, token, body: { method: 'clientSources.repairSyncLock', params: { clientId: 'claude' } } });
    assert.equal(r2Lock.statusCode, 200);

    // 3. Cadence
    const r3Get = await requestRpc({ port, token, body: { method: 'collectionCadence.get' } });
    assert.equal(r3Get.statusCode, 200);
    assert.equal(r3Get.json.result.collectionMode, 'smart');

    const r3Set = await requestRpc({ port, token, body: { method: 'collectionCadence.set', params: { collectionMode: 'interval', collectionIntervalMs: 5000 } } });
    assert.equal(r3Set.statusCode, 200);

    // 4. Session Archive
    const r4Retain = await requestRpc({ port, token, body: { method: 'sessionArchive.getRetain' } });
    assert.equal(r4Retain.statusCode, 200);
    assert.equal(r4Retain.json.result.retain, true);

    const r4SetRetain = await requestRpc({ port, token, body: { method: 'sessionArchive.setRetain', params: { retain: false } } });
    assert.equal(r4SetRetain.statusCode, 200);

    const r4Clear = await requestRpc({ port, token, body: { method: 'sessionArchive.clear' } });
    assert.equal(r4Clear.statusCode, 200);

    // 5. Diagnostics
    const r5 = await requestRpc({ port, token, body: { method: 'diagnostics.generate' } });
    assert.equal(r5.statusCode, 200);
    assert.equal(r5.json.result.text, 'report');

    // 6. Tokscale status probe (probes only, never downloads binary)
    const r6 = await requestRpc({ port, token, body: { method: 'tokscale.getStatus' } });
    assert.equal(r6.statusCode, 200);
    assert.equal(r6.json.result.binary, 'ok');

    // 7. Limits accounts (metadata preserved, secret keys redacted)
    const r7 = await requestRpc({ port, token, body: { method: 'limits.listAccountForms' } });
    assert.equal(r7.statusCode, 200);
    assert.equal(r7.json.result[0].provider, 'claude');
    assert.equal(r7.json.result[0].accountKey, 'acc-1');
    assert.equal(r7.json.result[0].apiKey, '[REDACTED]');

    const r7Save = await requestRpc({ port, token, body: { method: 'limits.saveCredential', params: { providerId: 'claude', values: {} } } });
    assert.equal(r7Save.statusCode, 200);

    const r7Clear = await requestRpc({ port, token, body: { method: 'limits.clearCredential', params: { providerId: 'claude' } } });
    assert.equal(r7Clear.statusCode, 200);

    const r7Refresh = await requestRpc({ port, token, body: { method: 'limits.refresh', params: { providerId: 'claude' } } });
    assert.equal(r7Refresh.statusCode, 200);

    // 8. Sign-ins and status
    const r8AntigravityStart = await requestRpc({ port, token, body: { method: 'limits.antigravitySignInStart' } });
    assert.equal(r8AntigravityStart.statusCode, 200);

    const r8AntigravityCancel = await requestRpc({ port, token, body: { method: 'limits.antigravityCancelSignIn' } });
    assert.equal(r8AntigravityCancel.statusCode, 200);

    const r8CopilotStart = await requestRpc({ port, token, body: { method: 'copilot.signInStart', params: { flowId: 'flow-copilot-1' } } });
    assert.equal(r8CopilotStart.statusCode, 200);
    assert.equal(r8CopilotStart.json.result.ok, true);
    assert.equal(r8CopilotStart.json.result.flowId, 'flow-copilot-1');

    const r8Status = await requestRpc({ port, token, body: { method: 'signIn.status', params: { flowId: 'flow-copilot-1' } } });
    assert.equal(r8Status.statusCode, 200);
    assert.equal(r8Status.json.result.phase, 'authorize');
    assert.equal(r8Status.json.result.userCode, 'CODE-123');
    assert.equal(r8Status.json.result.verificationUrl, 'https://github.com/login/device');

    const r8CopilotCancel = await requestRpc({ port, token, body: { method: 'copilot.cancelSignIn', params: { flowId: 'flow-copilot-1' } } });
    assert.equal(r8CopilotCancel.statusCode, 200);

    const r8CodexStart = await requestRpc({ port, token, body: { method: 'codex.signInStart', params: { flowId: 'flow-codex-1' } } });
    assert.equal(r8CodexStart.statusCode, 200);

    const r8SelectWorkspace = await requestRpc({ port, token, body: { method: 'codex.selectWorkspace', params: { flowId: 'flow-codex-1', workspaceId: 'ws-team' } } });
    assert.equal(r8SelectWorkspace.statusCode, 200);

    const r8CodexCancel = await requestRpc({ port, token, body: { method: 'codex.cancelSignIn', params: { flowId: 'flow-codex-1' } } });
    assert.equal(r8CodexCancel.statusCode, 200);

    // 9. Codex accounts & switching
    const r9Accounts = await requestRpc({ port, token, body: { method: 'codex.listAccounts' } });
    assert.equal(r9Accounts.statusCode, 200);

    const r9Switch = await requestRpc({ port, token, body: { method: 'codex.switchAccount', params: { accountId: 'acc-1' } } });
    assert.equal(r9Switch.statusCode, 200);

    // 10. Currency
    const r10Get = await requestRpc({ port, token, body: { method: 'currency.get' } });
    assert.equal(r10Get.statusCode, 200);
    assert.equal(r10Get.json.result.currency, 'EUR');

    const r10Set = await requestRpc({ port, token, body: { method: 'currency.set', params: { currency: 'GBP' } } });
    assert.equal(r10Set.statusCode, 200);

    // 11. Limits Display
    const r11Get = await requestRpc({ port, token, body: { method: 'limits.getDisplay' } });
    assert.equal(r11Get.statusCode, 200);
    assert.deepEqual(r11Get.json.result.providerOrder, ['claude', 'codex']);
    assert.deepEqual(r11Get.json.result.hiddenProviders, ['kimi']);
    assert.equal(r11Get.json.result.refreshMode, 'adaptive');
    assert.equal(r11Get.json.result.refreshIntervalMs, 60000);
    assert.equal(r11Get.json.result.maskAccountEmails, true);

    const r11Set = await requestRpc({
      port,
      token,
      body: {
        method: 'limits.setDisplay',
        params: {
          providerOrder: ['codex', 'claude'],
          hiddenProviders: [],
          refreshMode: 'fixed',
          refreshIntervalMs: 300000,
          maskAccountEmails: false
        }
      }
    });
    assert.equal(r11Set.statusCode, 200);
    assert.equal(r11Set.json.result.ok, true);

    const r11GetColon = await requestRpc({ port, token, body: { method: 'limits:getDisplay' } });
    assert.equal(r11GetColon.statusCode, 200);

    // 12. Automated Data Export Settings
    const r12Get = await requestRpc({ port, token, body: { method: 'export.get' } });
    assert.equal(r12Get.statusCode, 200);
    assert.equal(r12Get.json.result.enabled, true);
    assert.equal(r12Get.json.result.directory.replace(/\\/g, '/'), '~/exports');
    assert.equal(r12Get.json.result.cadence, 120000);

    const r12Set = await requestRpc({
      port,
      token,
      body: {
        method: 'export.set',
        params: {
          enabled: false,
          directory: '~/new-exports',
          cadence: 60000
        }
      }
    });
    assert.equal(r12Set.statusCode, 200);
    assert.equal(r12Set.json.result.ok, true);

    const r12GetColon = await requestRpc({ port, token, body: { method: 'export:get' } });
    assert.equal(r12GetColon.statusCode, 200);

    // 13. Model Alias Grouping
    const r13Get = await requestRpc({ port, token, body: { method: 'modelAliases.getGrouping' } });
    assert.equal(r13Get.statusCode, 200);
    assert.equal(r13Get.json.result.grouping, 'prefix');

    const r13Set = await requestRpc({
      port,
      token,
      body: {
        method: 'modelAliases.setGrouping',
        params: { grouping: 'duplicates' }
      }
    });
    assert.equal(r13Set.statusCode, 200);
    assert.equal(r13Set.json.result.grouping, 'duplicates');

    const r13GetColon = await requestRpc({ port, token, body: { method: 'modelAliases:getGrouping' } });
    assert.equal(r13GetColon.statusCode, 200);

    assert.ok(calls.length >= 35);
  } finally {
    await control.close();
  }
});

test('local control server limits, export, and modelAliases round-trip with fake settings store', async () => {
  const token = 'test-token-new-settings-methods-1234';
  const fakeSettings = {
    limitProviderOrder: 'claude,codex',
    limitProviders: 'claude,codex',
    limitsRefreshMode: 'fixed',
    limitsRefreshMs: 300000,
    maskLimitAccountEmails: false,
    limitsEnabled: true,
    exportAutoEnabled: false,
    exportDir: path.join(os.homedir(), 'token-monitor-exports'),
    exportIntervalMs: 60000,
    modelAliasGrouping: 'off'
  };

  const allKnown = ['claude', 'codex', 'kimi'];

  const dispatcher = createRpcDispatcher({
    getLimitsDisplay: () => {
      const enabled = new Set(fakeSettings.limitsEnabled === false ? [] : fakeSettings.limitProviders.split(',').filter(Boolean));
      const hidden = allKnown.filter((p) => !enabled.has(p));
      return {
        providerOrder: fakeSettings.limitProviderOrder.split(',').filter(Boolean),
        hiddenProviders: hidden,
        refreshMode: fakeSettings.limitsRefreshMode,
        refreshIntervalMs: fakeSettings.limitsRefreshMs,
        maskAccountEmails: Boolean(fakeSettings.maskLimitAccountEmails)
      };
    },
    setLimitsDisplay: async (params = {}) => {
      if (params.providerOrder !== undefined) {
        fakeSettings.limitProviderOrder = Array.isArray(params.providerOrder) ? params.providerOrder.join(',') : String(params.providerOrder);
      }
      if (params.hiddenProviders !== undefined) {
        const hiddenSet = new Set((Array.isArray(params.hiddenProviders) ? params.hiddenProviders : String(params.hiddenProviders).split(',')).map((p) => p.trim().toLowerCase()));
        const enabled = allKnown.filter((p) => !hiddenSet.has(p));
        fakeSettings.limitProviders = enabled.join(',');
        fakeSettings.limitsEnabled = enabled.length > 0;
      }
      if (params.refreshMode !== undefined) fakeSettings.limitsRefreshMode = params.refreshMode;
      if (params.refreshIntervalMs !== undefined) fakeSettings.limitsRefreshMs = params.refreshIntervalMs;
      if (params.maskAccountEmails !== undefined) fakeSettings.maskLimitAccountEmails = params.maskAccountEmails;

      const enabled = new Set(fakeSettings.limitsEnabled === false ? [] : fakeSettings.limitProviders.split(',').filter(Boolean));
      const hidden = allKnown.filter((p) => !enabled.has(p));
      return {
        ok: true,
        providerOrder: fakeSettings.limitProviderOrder.split(',').filter(Boolean),
        hiddenProviders: hidden,
        refreshMode: fakeSettings.limitsRefreshMode,
        refreshIntervalMs: fakeSettings.limitsRefreshMs,
        maskAccountEmails: Boolean(fakeSettings.maskLimitAccountEmails)
      };
    },
    getExportSettings: () => ({
      enabled: Boolean(fakeSettings.exportAutoEnabled),
      directory: fakeSettings.exportDir,
      cadence: fakeSettings.exportIntervalMs
    }),
    setExportSettings: async (params = {}) => {
      if (params.enabled !== undefined) fakeSettings.exportAutoEnabled = Boolean(params.enabled);
      if (params.directory !== undefined) {
        let expanded = String(params.directory).trim();
        if (expanded === '~') expanded = os.homedir();
        else if (expanded.startsWith('~/') || expanded.startsWith('~\\')) {
          expanded = path.join(os.homedir(), expanded.slice(2));
        }
        fakeSettings.exportDir = expanded;
      }
      if (params.cadence !== undefined) fakeSettings.exportIntervalMs = Number(params.cadence);
      return {
        ok: true,
        enabled: Boolean(fakeSettings.exportAutoEnabled),
        directory: fakeSettings.exportDir,
        cadence: fakeSettings.exportIntervalMs
      };
    },
    getModelAliasGrouping: () => ({
      grouping: fakeSettings.modelAliasGrouping
    }),
    setModelAliasGrouping: async (params = {}) => {
      if (params.grouping !== undefined) fakeSettings.modelAliasGrouping = params.grouping;
      return {
        ok: true,
        grouping: fakeSettings.modelAliasGrouping
      };
    }
  });

  const control = await startLocalControlServer({ dispatcher, token });
  try {
    const { port } = control;

    // limits.getDisplay initial
    const limitsGet = await requestRpc({ port, token, body: { method: 'limits.getDisplay' } });
    assert.equal(limitsGet.statusCode, 200);
    assert.deepEqual(limitsGet.json.result.providerOrder, ['claude', 'codex']);
    assert.deepEqual(limitsGet.json.result.hiddenProviders, ['kimi']);
    assert.equal(limitsGet.json.result.refreshMode, 'fixed');
    assert.equal(limitsGet.json.result.refreshIntervalMs, 300000);
    assert.equal(limitsGet.json.result.maskAccountEmails, false);

    // limits.setDisplay partial updates
    const limitsSet = await requestRpc({
      port,
      token,
      body: {
        method: 'limits.setDisplay',
        params: {
          hiddenProviders: ['claude'],
          refreshMode: 'adaptive',
          maskAccountEmails: true
        }
      }
    });
    assert.equal(limitsSet.statusCode, 200);
    assert.equal(limitsSet.json.result.ok, true);
    assert.deepEqual(limitsSet.json.result.hiddenProviders, ['claude']);
    assert.equal(limitsSet.json.result.refreshMode, 'adaptive');
    assert.equal(limitsSet.json.result.maskAccountEmails, true);

    // export.get initial (home directory path must be redacted with ~)
    const exportGet = await requestRpc({ port, token, body: { method: 'export.get' } });
    assert.equal(exportGet.statusCode, 200);
    assert.equal(exportGet.json.result.enabled, false);
    assert.equal(exportGet.json.result.directory.replace(/\\/g, '/'), '~/token-monitor-exports');
    assert.equal(exportGet.json.result.cadence, 60000);

    // export.set with ~ path expansion and subset update
    const exportSet = await requestRpc({
      port,
      token,
      body: {
        method: 'export.set',
        params: {
          enabled: true,
          directory: '~/custom-export-folder',
          cadence: 180000
        }
      }
    });
    assert.equal(exportSet.statusCode, 200);
    assert.equal(exportSet.json.result.ok, true);
    assert.equal(exportSet.json.result.enabled, true);
    assert.equal(exportSet.json.result.directory.replace(/\\/g, '/'), '~/custom-export-folder');
    assert.equal(fakeSettings.exportDir, path.join(os.homedir(), 'custom-export-folder'));
    assert.equal(exportSet.json.result.cadence, 180000);

    // modelAliases.getGrouping initial
    const groupingGet = await requestRpc({ port, token, body: { method: 'modelAliases.getGrouping' } });
    assert.equal(groupingGet.statusCode, 200);
    assert.equal(groupingGet.json.result.grouping, 'off');

    // modelAliases.setGrouping update
    const groupingSet = await requestRpc({
      port,
      token,
      body: {
        method: 'modelAliases.setGrouping',
        params: { grouping: 'prefix' }
      }
    });
    assert.equal(groupingSet.statusCode, 200);
    assert.equal(groupingSet.json.result.ok, true);
    assert.equal(groupingSet.json.result.grouping, 'prefix');
    assert.equal(fakeSettings.modelAliasGrouping, 'prefix');
  } finally {
    await control.close();
  }
});
