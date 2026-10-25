'use strict';

(function exposeMockData(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TokenMonitorBridgeMockData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function clone(obj) {
    if (obj === undefined) return undefined;
    return JSON.parse(JSON.stringify(obj));
  }

  function generateDailyHistory(days = 30) {
    const daily = [];
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const factor = isWeekend ? 0.35 : 1.0;
      const jitter = 0.8 + ((i * 17 + 5) % 40) / 100;

      const codexTokens = Math.round(55000 * factor * jitter);
      const claudeTokens = Math.round(32000 * factor * jitter);
      const opencodeTokens = Math.round(12000 * factor * jitter);
      const totalTokens = codexTokens + claudeTokens + opencodeTokens;

      const codexCost = Number((codexTokens * 0.000013).toFixed(4));
      const claudeCost = Number((claudeTokens * 0.000015).toFixed(4));
      const opencodeCost = Number((opencodeTokens * 0.000012).toFixed(4));
      const totalCost = Number((codexCost + claudeCost + opencodeCost).toFixed(4));

      daily.push({
        date: dateStr,
        tokens: totalTokens,
        cost: totalCost,
        perClient: {
          codex: { tokens: codexTokens, cost: codexCost },
          claude: { tokens: claudeTokens, cost: claudeCost },
          opencode: { tokens: opencodeTokens, cost: opencodeCost }
        },
        perModel: {
          'gpt-4o': { tokens: Math.round(codexTokens * 0.75), cost: Number((codexCost * 0.75).toFixed(4)) },
          'o1-mini': { tokens: Math.round(codexTokens * 0.25), cost: Number((codexCost * 0.25).toFixed(4)) },
          'claude-3-5-sonnet': { tokens: claudeTokens, cost: claudeCost },
          'deepseek-coder': { tokens: opencodeTokens, cost: opencodeCost }
        }
      });
    }
    return daily;
  }

  const DEFAULT_MOCK_DATA = Object.freeze({
    stats: {
      snapshot: 'snap-mock-current',
      periods: {
        today: {
          totalTokens: 142500,
          costUsd: 1.85,
          clients: { codex: 82000, claude: 45000, opencode: 15500 },
          clientCosts: { codex: 1.07, claude: 0.58, opencode: 0.20 },
          models: {
            'gpt-4o': 62000,
            'claude-3-5-sonnet': 45000,
            'o1-mini': 20000,
            'deepseek-coder': 15500
          },
          modelCosts: {
            'gpt-4o': 0.88,
            'claude-3-5-sonnet': 0.58,
            'o1-mini': 0.19,
            'deepseek-coder': 0.20
          },
          sessions: {
            'sess-001': { tokens: 52000, cost: 0.72 },
            'sess-002': { tokens: 30000, cost: 0.35 },
            'sess-003': { tokens: 45000, cost: 0.58 },
            'sess-004': { tokens: 15500, cost: 0.20 }
          }
        },
        month: {
          totalTokens: 3840000,
          costUsd: 52.40,
          clients: { codex: 2200000, claude: 1200000, opencode: 440000 },
          clientCosts: { codex: 31.20, claude: 15.60, opencode: 5.60 },
          models: {
            'gpt-4o': 1900000,
            'claude-3-5-sonnet': 1200000,
            'o1-mini': 300000,
            'deepseek-coder': 440000
          },
          modelCosts: {
            'gpt-4o': 27.50,
            'claude-3-5-sonnet': 15.60,
            'o1-mini': 3.70,
            'deepseek-coder': 5.60
          }
        },
        allTime: {
          totalTokens: 16800000,
          costUsd: 234.50,
          clients: { codex: 10200000, claude: 4800000, opencode: 1800000 },
          clientCosts: { codex: 142.30, claude: 68.20, opencode: 24.00 }
        }
      },
      limits: {
        codex: {
          provider: 'codex',
          quota: { used: 82000, limit: 200000, percent: 41 },
          burnRate: 18.5,
          resetAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
          status: 'healthy'
        },
        claude: {
          provider: 'claude',
          quota: { used: 45000, limit: 100000, percent: 45 },
          burnRate: 12.0,
          resetAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
          status: 'healthy'
        },
        cursor: {
          provider: 'cursor',
          quota: { used: 125, limit: 500, percent: 25 },
          burnRate: 0,
          resetAt: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
          status: 'healthy'
        }
      },
      live: {
        velocityTokensPerSec: 32.4,
        activeStreams: 1
      }
    },
    history: {
      daily: generateDailyHistory(30),
      monthly: [
        { month: '2026-08', tokens: 4100000, cost: 56.20 },
        { month: '2026-09', tokens: 4600000, cost: 63.80 },
        { month: '2026-10', tokens: 3840000, cost: 52.40 }
      ],
      summary: { totalTokens: 16800000, totalCostUsd: 234.50 }
    },
    sessions: [
      {
        id: 'sess-001',
        client: 'codex',
        title: 'Auth Refactor & Session Management',
        tokens: 52000,
        cost: 0.72,
        turnsCount: 6,
        timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString()
      },
      {
        id: 'sess-001-child-1',
        parentId: 'sess-001',
        client: 'codex',
        title: 'JWT Expiration Unit Tests',
        tokens: 14500,
        cost: 0.19,
        turnsCount: 3,
        timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString()
      },
      {
        id: 'sess-002',
        client: 'codex',
        title: 'Database Migration: User Preferences',
        tokens: 30000,
        cost: 0.35,
        turnsCount: 4,
        timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString()
      },
      {
        id: 'sess-003',
        client: 'claude',
        title: 'Design System Glass Components',
        tokens: 45000,
        cost: 0.58,
        turnsCount: 5,
        timestamp: new Date(Date.now() - 140 * 60 * 1000).toISOString()
      },
      {
        id: 'sess-004',
        client: 'opencode',
        title: 'Shell Script for Tokscale Verification',
        tokens: 15500,
        cost: 0.20,
        turnsCount: 2,
        timestamp: new Date(Date.now() - 210 * 60 * 1000).toISOString()
      }
    ],
    sessionDetails: {
      'sess-001': {
        id: 'sess-001',
        client: 'codex',
        title: 'Auth Refactor & Session Management',
        sessionCost: 0.72,
        timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
        turns: [
          {
            type: 'turn',
            tokens: { total: 6800, prompt: 5400, completion: 1400 },
            costEstimate: 0.09,
            tools: ['readFile', 'searchCode'],
            timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString()
          },
          {
            type: 'turn',
            tokens: { total: 11200, prompt: 8600, completion: 2600 },
            costEstimate: 0.15,
            tools: ['replaceFileContent'],
            timestamp: new Date(Date.now() - 31 * 60 * 1000).toISOString()
          },
          {
            type: 'assistant-attempt',
            tokens: { total: 14500, prompt: 10800, completion: 3700 },
            costEstimate: 0.21,
            tools: ['runCommand'],
            timestamp: new Date(Date.now() - 26 * 60 * 1000).toISOString()
          },
          {
            type: 'turn',
            tokens: { total: 19500, prompt: 14200, completion: 5300 },
            costEstimate: 0.27,
            tools: ['runCommand', 'replaceFileContent'],
            timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString()
          }
        ]
      }
    },
    serviceStatus: [
      {
        id: 'codex',
        label: 'Codex',
        status: 'operational',
        indicator: 'none',
        description: 'All Systems Operational',
        checkedAt: new Date().toISOString()
      },
      {
        id: 'claude',
        label: 'Claude',
        status: 'operational',
        indicator: 'none',
        description: 'All Systems Operational',
        checkedAt: new Date().toISOString()
      },
      {
        id: 'openai',
        label: 'OpenAI',
        status: 'operational',
        indicator: 'none',
        description: 'All Systems Operational',
        checkedAt: new Date().toISOString()
      },
      {
        id: 'openrouter',
        label: 'OpenRouter',
        status: 'operational',
        indicator: 'none',
        description: 'All Systems Operational',
        checkedAt: new Date().toISOString()
      }
    ],
    codexResetForecast: {
      providerId: 'codex',
      nextResetTime: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      forecastDailyAllowance: 200000,
      predictedUsageTokens: 110000
    },
    settings: {
      currency: 'USD',
      currencyRates: { CNY: 7.24, EUR: 0.92, GBP: 0.79, JPY: 154.5, KRW: 1380.0, HKD: 7.82 },
      currencyRatesEffective: { CNY: 7.24, EUR: 0.92, GBP: 0.79, JPY: 154.5, KRW: 1380.0, HKD: 7.82 },
      theme: 'system',
      language: 'en',
      modelAliases: { 'anthropic/claude-opus-5': 'claude-opus-5' },
      modelAliasGrouping: 'off',
      glassOpacity: 68,
      dashboardFlat: false,
      codexResetForecastEnabled: true,
      compactTokenUnits: 'western',
      reduceMotion: 'system'
    },
    appInfo: {
      name: 'TokeX',
      version: '0.69.0',
      electronVersion: '32.1.0',
      platform: typeof process !== 'undefined' ? process.platform : 'win32'
    },
    tokscaleStatus: {
      installed: true,
      path: '/usr/local/bin/tokscale',
      version: '0.12.0',
      running: true
    },
    accounts: {
      codex: [
        { id: 'acc-codex-1', email: 'developer@example.com', name: 'Primary Dev', isSystem: true, enabled: true }
      ],
      antigravity: [
        { id: 'acc-agy-1', email: 'team@company.internal', name: 'Work Project', enabled: true }
      ],
      mimo: [
        { id: 'acc-mimo-1', name: 'MiMo Cloud', enabled: true }
      ],
      cursor: {
        loggedIn: true,
        user: { email: 'cursor-dev@example.com', name: 'Cursor User' }
      },
      opencode: [
        { name: 'default', apiKey: 'opencode-secret-mock-key', enabled: true }
      ],
      openrouter: [
        { name: 'default', apiKey: 'sk-or-mock-key-12345', enabled: true }
      ],
      thirdparty: [
        { name: 'Custom DeepSeek', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-ds-mock-key', enabled: true }
      ],
      copilot: {
        signedIn: true,
        user: 'octocat'
      }
    }
  });

  function createMockBackend(customData = {}) {
    const state = {
      stats: clone(customData.stats || DEFAULT_MOCK_DATA.stats),
      history: clone(customData.history || DEFAULT_MOCK_DATA.history),
      sessions: clone(customData.sessions || DEFAULT_MOCK_DATA.sessions),
      sessionDetails: clone(customData.sessionDetails || DEFAULT_MOCK_DATA.sessionDetails),
      serviceStatus: clone(customData.serviceStatus || DEFAULT_MOCK_DATA.serviceStatus),
      codexResetForecast: clone(customData.codexResetForecast || DEFAULT_MOCK_DATA.codexResetForecast),
      settings: clone(customData.settings || DEFAULT_MOCK_DATA.settings),
      appInfo: clone(customData.appInfo || DEFAULT_MOCK_DATA.appInfo),
      tokscaleStatus: clone(customData.tokscaleStatus || DEFAULT_MOCK_DATA.tokscaleStatus),
      accounts: clone(customData.accounts || DEFAULT_MOCK_DATA.accounts),
      subscriptions: clone(customData.subscriptions || []),
      nativeMaterial: { type: 'transparent', reducedTransparency: false, highContrast: false },
      backgroundImage: null,
      dashboardOpen: false,
      windowVisible: true,
      floatingBubbleState: { collapsed: false, size: { width: 340, height: 48 } },
      viewState: { period: 'today', breakdown: 'client' }
    };

    const listeners = new Map();

    function on(channel, handler) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(handler);
      return () => off(channel, handler);
    }

    function off(channel, handler) {
      const set = listeners.get(channel);
      if (set) {
        set.delete(handler);
        if (set.size === 0) listeners.delete(channel);
      }
    }

    function emit(channel, payload) {
      const set = listeners.get(channel);
      if (set) {
        for (const handler of Array.from(set)) {
          try { handler(payload); } catch (_) {}
        }
      }
    }

    return {
      _mockState: state,
      _emitter: { on, off, emit },

      // Telemetry
      getStats: async (_options = {}) => clone(state.stats),
      getDashboardHistory: async (_options = {}) => clone(state.history),
      lookupModelPricing: async (modelId) => {
        const prompt = modelId.includes('gpt-4') ? 0.000005 : 0.0000015;
        const completion = modelId.includes('gpt-4') ? 0.000015 : 0.000006;
        return { cost: { prompt, completion } };
      },
      getStreamStatus: async () => ({
        active: state.stats.live.activeStreams > 0,
        velocity: state.stats.live.velocityTokensPerSec,
        tokensPerSec: state.stats.live.velocityTokensPerSec
      }),
      onStatsPush: (cb) => on('stats:push', cb),
      onDashboardHistoryChanged: (cb) => on('dashboard:historyChanged', cb),

      // Limits
      getServiceStatus: async (_options = {}) => clone(state.serviceStatus),
      getCodexResetForecast: async (_options = {}) => clone(state.codexResetForecast),
      limits: {
        saveCredential: async (_providerId, _values) => ({ ok: true }),
        listOrganizationChoices: async (_providerId) => [{ id: 'org-1', name: 'Engineering Org' }],
        clearCredential: async (_providerId) => ({ ok: true })
      },
      codex: {
        accounts: async () => clone(state.accounts.codex),
        addAccount: async (_options = {}) => {
          const acc = { id: `acc-codex-${Date.now()}`, email: 'new@example.com', name: 'Added Codex', enabled: true };
          state.accounts.codex.push(acc);
          emit('codex:activeAccount', acc);
          return { ok: true, account: acc };
        },
        selectWorkspace: async (_options = {}) => ({ ok: true }),
        cancelLogin: async (_options = {}) => ({ ok: true }),
        removeAccount: async (id) => {
          state.accounts.codex = state.accounts.codex.filter((a) => a.id !== id);
          return { ok: true };
        },
        setAccountEnabled: async (id, enabled) => {
          const found = state.accounts.codex.find((a) => a.id === id);
          if (found) found.enabled = Boolean(enabled);
          return { ok: true };
        },
        switchSystemAccount: async (id) => {
          for (const a of state.accounts.codex) a.isSystem = (a.id === id);
          return { ok: true };
        },
        refreshAccountLimits: async (_id) => ({ ok: true }),
        onActiveAccount: (cb) => on('codex:activeAccount', cb),
        onLoginStatus: (cb) => on('codex:loginStatus', cb)
      },
      cursor: {
        loginManual: async (_token) => {
          state.accounts.cursor.loggedIn = true;
          return { ok: true };
        },
        setAccountEnabled: async (_id, _enabled) => ({ ok: true }),
        logout: async (_id) => {
          state.accounts.cursor.loggedIn = false;
          return { ok: true };
        },
        status: async (_options = {}) => clone(state.accounts.cursor)
      },
      opencode: {
        saveCookie: async (_cookie) => ({ ok: true }),
        logout: async () => ({ ok: true }),
        status: async () => ({ ok: true }),
        getProfiles: async () => clone(state.accounts.opencode),
        saveProfile: async (name, apiKey, _kind, _options) => {
          const existing = state.accounts.opencode.find((p) => p.name === name);
          if (existing) {
            existing.apiKey = apiKey;
          } else {
            state.accounts.opencode.push({ name, apiKey, enabled: true });
          }
          return { ok: true };
        },
        deleteProfile: async (name) => {
          state.accounts.opencode = state.accounts.opencode.filter((p) => p.name !== name);
          return { ok: true };
        },
        renameProfile: async (oldName, newName) => {
          const found = state.accounts.opencode.find((p) => p.name === oldName);
          if (found) found.name = newName;
          return { ok: true };
        },
        removeCredential: async (_name, _kind) => ({ ok: true }),
        moveCredential: async (_name, _kind, _target, _opts) => ({ ok: true }),
        setProfileEnabled: async (name, enabled) => {
          const found = state.accounts.opencode.find((p) => p.name === name);
          if (found) found.enabled = Boolean(enabled);
          return { ok: true };
        },
        setAmbientEnabled: async (_enabled) => ({ ok: true })
      },
      openrouter: {
        getProfiles: async () => clone(state.accounts.openrouter),
        saveProfile: async (name, apiKey) => {
          const existing = state.accounts.openrouter.find((p) => p.name === name);
          if (existing) {
            existing.apiKey = apiKey;
          } else {
            state.accounts.openrouter.push({ name, apiKey, enabled: true });
          }
          return { ok: true };
        },
        deleteProfile: async (name) => {
          state.accounts.openrouter = state.accounts.openrouter.filter((p) => p.name !== name);
          return { ok: true };
        },
        renameProfile: async (oldName, newName) => {
          const found = state.accounts.openrouter.find((p) => p.name === oldName);
          if (found) found.name = newName;
          return { ok: true };
        },
        setProfileEnabled: async (name, enabled) => {
          const found = state.accounts.openrouter.find((p) => p.name === name);
          if (found) found.enabled = Boolean(enabled);
          return { ok: true };
        }
      },
      thirdparty: {
        getProfiles: async () => clone(state.accounts.thirdparty),
        saveProfile: async (profile) => {
          const existing = state.accounts.thirdparty.find((p) => p.name === profile.name);
          if (existing) {
            Object.assign(existing, profile);
          } else {
            state.accounts.thirdparty.push({ ...profile, enabled: true });
          }
          return { ok: true };
        },
        deleteProfile: async (name) => {
          state.accounts.thirdparty = state.accounts.thirdparty.filter((p) => p.name !== name);
          return { ok: true };
        },
        renameProfile: async (oldName, newName) => {
          const found = state.accounts.thirdparty.find((p) => p.name === oldName);
          if (found) found.name = newName;
          return { ok: true };
        },
        setProfileEnabled: async (name, enabled) => {
          const found = state.accounts.thirdparty.find((p) => p.name === name);
          if (found) found.enabled = Boolean(enabled);
          return { ok: true };
        }
      },
      antigravity: {
        accounts: async () => clone(state.accounts.antigravity),
        addAccount: async () => {
          const acc = { id: `acc-agy-${Date.now()}`, email: 'new@antigravity.internal', enabled: true };
          state.accounts.antigravity.push(acc);
          emit('antigravity:accounts', clone(state.accounts.antigravity));
          return { ok: true, account: acc };
        },
        cancelLogin: async () => ({ ok: true }),
        removeAccount: async (id) => {
          state.accounts.antigravity = state.accounts.antigravity.filter((a) => a.id !== id);
          emit('antigravity:accounts', clone(state.accounts.antigravity));
          return { ok: true };
        },
        setAccountEnabled: async (id, enabled) => {
          const found = state.accounts.antigravity.find((a) => a.id === id);
          if (found) found.enabled = Boolean(enabled);
          emit('antigravity:accounts', clone(state.accounts.antigravity));
          return { ok: true };
        },
        onAccounts: (cb) => on('antigravity:accounts', cb)
      },
      mimo: {
        accounts: async () => clone(state.accounts.mimo),
        addAccount: async (_cookieHeader) => {
          const acc = { id: `acc-mimo-${Date.now()}`, name: 'New MiMo Account', enabled: true };
          state.accounts.mimo.push(acc);
          emit('mimo:accounts', clone(state.accounts.mimo));
          return { ok: true, account: acc };
        },
        openConsole: async () => ({ ok: true }),
        removeAccount: async (id) => {
          state.accounts.mimo = state.accounts.mimo.filter((a) => a.id !== id);
          emit('mimo:accounts', clone(state.accounts.mimo));
          return { ok: true };
        },
        setAccountEnabled: async (id, enabled) => {
          const found = state.accounts.mimo.find((a) => a.id === id);
          if (found) found.enabled = Boolean(enabled);
          emit('mimo:accounts', clone(state.accounts.mimo));
          return { ok: true };
        },
        onAccounts: (cb) => on('mimo:accounts', cb)
      },
      copilot: {
        signIn: async (_options = {}) => {
          state.accounts.copilot.signedIn = true;
          emit('copilot:loginStatus', { signedIn: true });
          return { ok: true };
        },
        cancelSignIn: async (_options = {}) => ({ ok: true }),
        onLoginStatus: (cb) => on('copilot:loginStatus', cb)
      },

      // Sessions
      getAllTimeSessions: async (_snapshotId) => clone(state.sessions),
      getSessionDetail: async (args) => {
        const id = args?.sessionId;
        if (state.sessionDetails[id]) return clone(state.sessionDetails[id]);
        return {
          id: id || 'sess-unknown',
          client: args?.client || 'codex',
          title: `Session ${id || 'Detail'}`,
          sessionCost: args?.sessionCost || 0.10,
          timestamp: new Date().toISOString(),
          turns: [
            {
              type: 'turn',
              tokens: { total: 4200, prompt: 3500, completion: 700 },
              costEstimate: 0.05,
              tools: ['readFile'],
              timestamp: new Date().toISOString()
            }
          ]
        };
      },
      clearSessionUsageArchive: async () => {
        state.sessions = [];
        state.sessionDetails = {};
        return { ok: true };
      },

      // Settings & Appearance
      getSettings: async () => clone(state.settings),
      refreshCurrencyRates: async () => {
        const rates = {
          CNY: 7.24,
          EUR: 0.92,
          GBP: 0.79,
          JPY: 154.5,
          KRW: 1380.0,
          HKD: 7.82,
          TWD: 32.5,
          CAD: 1.38,
          AUD: 1.52,
          SGD: 1.35,
          CHF: 0.89
        };
        state.settings.currencyRates = rates;
        state.settings.currencyRatesEffective = rates;
        state.settings.currencyRateInfo = {
          source: 'Exchange Rates API',
          date: new Date().toISOString().slice(0, 10),
          fetchedAt: new Date().toISOString()
        };
        emit('settings:push', clone(state.settings));
        return clone(state.settings);
      },
      updateSettings: async (patch) => {
        Object.assign(state.settings, patch);
        emit('settings:push', clone(state.settings));
        return clone(state.settings);
      },
      saveSubscriptions: async (subscriptions, _base) => {
        state.subscriptions = clone(subscriptions);
        return clone(state.settings);
      },
      adoptOrphanedSubscriptions: async () => ({ ok: true }),
      discardOrphanedSubscriptions: async () => ({ ok: true }),
      previewAppearance: async (_patch) => ({ ok: true }),
      getBackgroundImage: async () => state.backgroundImage,
      chooseBackgroundImage: async () => {
        state.backgroundImage = 'mock-bg-data-url';
        return { ok: true, path: '/mock/path/image.png' };
      },
      clearBackgroundImage: async () => {
        state.backgroundImage = null;
        return { ok: true };
      },
      getNativeMaterialState: async () => clone(state.nativeMaterial),
      onNativeMaterialState: (cb) => on('appearance:nativeMaterial', cb),
      onSettingsPush: (cb) => on('settings:push', cb),
      onSystemUiThemePush: (cb) => on('theme:systemUi', cb),

      // Window & Navigation
      minimize: () => {
        state.windowVisible = false;
        emit('window:visibility', false);
      },
      close: () => {
        state.windowVisible = false;
        emit('window:visibility', false);
      },
      openDashboard: async () => {
        state.dashboardOpen = true;
        return { ok: true };
      },
      dashboard: {
        ready: () => {},
        minimize: () => {},
        close: () => { state.dashboardOpen = false; }
      },
      expandFloatingBubble: async () => {
        state.floatingBubbleState.collapsed = false;
        emit('floatingBubble:state', clone(state.floatingBubbleState));
        return { ok: true };
      },
      moveFloatingBubble: async (_delta) => ({ ok: true }),
      signalContentReady: () => {},
      setViewState: (patch) => { Object.assign(state.viewState, patch); },
      peekFloatingBubble: async () => ({ ok: true }),
      collapseFloatingBubbleIfIdle: async () => {
        state.floatingBubbleState.collapsed = true;
        emit('floatingBubble:state', clone(state.floatingBubbleState));
        return { ok: true };
      },
      setFloatingBubbleCollapsedSize: async (size) => {
        state.floatingBubbleState.size = clone(size);
        return { ok: true };
      },
      onFloatingBubbleState: (cb) => on('floatingBubble:state', cb),
      onWindowVisibilityPush: (cb) => on('window:visibility', cb),
      onOpenSettings: (cb) => on('settings:open', cb),
      onOpenView: (cb) => on('view:open', cb),

      // Hub & Misc
      getHubInfo: async () => ({ configured: false, hubUrl: null }),
      getHubBuildStatus: async () => ({ ok: true, build: 'mock-hub-build' }),
      regenerateHubSecret: async () => ({ ok: true, secret: 'mock-secret' }),
      onHubPush: (cb) => on('hub:push', cb),
      getAppInfo: async () => clone(state.appInfo),
      generateDiagnosticReport: async () => ({ report: 'Mock diagnostic report' }),
      copyText: async (_text) => ({ ok: true }),
      clientSources: async (_clientId) => ({ sources: [] }),
      pickCustomScanPath: async (_clientId) => ({ path: '/mock/path' }),
      revealClientSource: async (_clientId) => ({ ok: true }),
      revealClientSyncLock: async (_clientId) => ({ ok: true }),
      rescanClient: async (_clientId) => ({ ok: true }),
      repairClientSyncLock: async (_clientId) => ({ ok: true }),
      openExternal: async (_url) => ({ ok: true }),
      openUserData: async () => ({ ok: true }),
      exportNow: async () => ({ ok: true, exportedAt: new Date().toISOString() }),
      pickExportDir: async () => ({ path: '/mock/export' }),
      getTokscaleStatus: async () => clone(state.tokscaleStatus),
      getAppUpdateState: async () => ({ available: false, version: state.appInfo.version }),
      checkAppUpdateNow: async () => ({ available: false }),
      downloadAppUpdate: async () => ({ ok: true }),
      installAppUpdate: async () => ({ ok: true }),
      dismissAppUpdate: async (_version) => ({ ok: true }),
      onAppUpdatePush: (cb) => on('appUpdate:push', cb),
      setTrayIcons: async (_icons) => ({ ok: true }),
      deleteDevice: async (_deviceId) => ({ ok: true }),
      getSyncContentStatus: async (_refresh = true) => ({ enabled: false }),
      previewSyncContent: async (_kind) => ({ preview: null }),
      configureSyncContent: async (_options) => ({ ok: true }),
      retrySyncContentCleanup: async () => ({ ok: true }),
      onSyncContentPush: (cb) => on('syncContent:push', cb)
    };
  }

  return {
    DEFAULT_MOCK_DATA,
    createMockBackend
  };
});
