'use strict';

(function exposeClientBridge(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.TokenMonitorClientBridge = api;
    if (!root.clientBridge) root.clientBridge = api.clientBridge;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, (root) => {
  let mockDataModule = null;
  if (typeof require === 'function') {
    try {
      mockDataModule = require('./mockData');
    } catch (_) {}
  }
  if (!mockDataModule && root && root.TokenMonitorBridgeMockData) {
    mockDataModule = root.TokenMonitorBridgeMockData;
  }

  let i18nModule = null;
  if (typeof require === 'function') {
    try {
      i18nModule = require('../i18n');
    } catch (_) {}
  }
  if (root && !root.TokenMonitorI18n && i18nModule) {
    root.TokenMonitorI18n = i18nModule;
  }

  let fontSettingsModule = null;
  if (typeof require === 'function') {
    try {
      fontSettingsModule = require('../../../shared/fontSettings');
    } catch (_) {}
  }
  if (root && !root.TokenMonitorFontSettings && fontSettingsModule) {
    root.TokenMonitorFontSettings = fontSettingsModule;
  }

  const DEFAULT_MOCK_DATA = mockDataModule?.DEFAULT_MOCK_DATA || {
    stats: {
      snapshot: 'snap-mock-current',
      periods: {
        today: { totalTokens: 100000, costUsd: 1.5, clients: {}, models: {}, sessions: {} },
        month: { totalTokens: 2500000, costUsd: 35.0, clients: {}, models: {} },
        allTime: { totalTokens: 10000000, costUsd: 140.0, clients: {} }
      },
      limits: {},
      live: { velocityTokensPerSec: 15.0, activeStreams: 1 }
    },
    history: { daily: [], monthly: [], summary: {} },
    sessions: [],
    sessionDetails: {},
    serviceStatus: [],
    settings: {
      currency: 'USD',
      currencyRates: { CNY: 7.24, EUR: 0.92, GBP: 0.79, JPY: 154.5, KRW: 1380.0, HKD: 7.82 },
      currencyRatesEffective: { CNY: 7.24, EUR: 0.92, GBP: 0.79, JPY: 154.5, KRW: 1380.0, HKD: 7.82 },
      theme: 'system',
      language: 'en',
      interfaceFontFamily: '',
      displayFontFamily: ''
    },
    appInfo: { name: 'TokeX', version: '0.69.0' }
  };

  const createMockBackend = mockDataModule?.createMockBackend || function fallbackCreateMockBackend() {
    return {
      getStats: async () => JSON.parse(JSON.stringify(DEFAULT_MOCK_DATA.stats)),
      getDashboardHistory: async () => JSON.parse(JSON.stringify(DEFAULT_MOCK_DATA.history)),
      lookupModelPricing: async () => ({ cost: { prompt: 0.000002, completion: 0.000008 } }),
      getStreamStatus: async () => ({ active: true, velocity: 15.0, tokensPerSec: 15.0 }),
      getServiceStatus: async () => JSON.parse(JSON.stringify(DEFAULT_MOCK_DATA.serviceStatus)),
      getCodexResetForecast: async () => ({}),
      getAllTimeSessions: async () => JSON.parse(JSON.stringify(DEFAULT_MOCK_DATA.sessions)),
      getSessionDetail: async () => ({ turns: [] }),
      clearSessionUsageArchive: async () => ({ ok: true }),
      getSettings: async () => JSON.parse(JSON.stringify(DEFAULT_MOCK_DATA.settings)),
      refreshCurrencyRates: async () => {
        const rates = { CNY: 7.24, EUR: 0.92, GBP: 0.79, JPY: 154.5, KRW: 1380.0, HKD: 7.82 };
        DEFAULT_MOCK_DATA.settings.currencyRates = rates;
        DEFAULT_MOCK_DATA.settings.currencyRatesEffective = rates;
        return JSON.parse(JSON.stringify(DEFAULT_MOCK_DATA.settings));
      },
      updateSettings: async (patch) => ({ ...DEFAULT_MOCK_DATA.settings, ...patch }),
      saveSubscriptions: async () => ({}),
      adoptOrphanedSubscriptions: async () => ({ ok: true }),
      discardOrphanedSubscriptions: async () => ({ ok: true }),
      previewAppearance: async () => ({ ok: true }),
      getBackgroundImage: async () => null,
      chooseBackgroundImage: async () => ({ ok: true }),
      clearBackgroundImage: async () => ({ ok: true }),
      getNativeMaterialState: async () => ({ type: 'transparent' }),
      openDashboard: async () => ({ ok: true }),
      minimize: () => {},
      close: () => {},
      dashboard: { ready: () => {}, minimize: () => {}, close: () => {} },
      expandFloatingBubble: async () => ({ ok: true }),
      moveFloatingBubble: async () => ({ ok: true }),
      signalContentReady: () => {},
      setViewState: () => {},
      peekFloatingBubble: async () => ({ ok: true }),
      collapseFloatingBubbleIfIdle: async () => ({ ok: true }),
      setFloatingBubbleCollapsedSize: async () => ({ ok: true }),
      onStatsPush: () => () => {},
      onDashboardHistoryChanged: () => () => {},
      onSettingsPush: () => () => {},
      onSystemUiThemePush: () => () => {},
      onNativeMaterialState: () => () => {},
      onWindowVisibilityPush: () => () => {},
      onFloatingBubbleState: () => () => {},
      onOpenSettings: () => () => {},
      onOpenView: () => () => {}
    };
  };

  /**
   * TelemetryService
   * Handles tokens, periods (today/month/allTime), history, costs, models, providers, live velocity.
   */
  class TelemetryService {
    constructor({ backend, subscribe, emit, isMock = false }) {
      this._backend = backend;
      this._subscribe = subscribe;
      this._emit = emit;
      this._isMock = isMock;
    }

    async getStats(options = {}) {
      return this._backend.getStats(options);
    }

    async getPeriodStats(period = 'today', optionsOrStats) {
      let stats;
      if (optionsOrStats && typeof optionsOrStats === 'object' && optionsOrStats.periods) {
        stats = optionsOrStats;
      } else {
        stats = await this.getStats(optionsOrStats);
      }
      return stats?.periods?.[period] || {
        totalTokens: 0,
        costUsd: 0,
        models: {},
        modelCosts: {},
        clients: {},
        clientCosts: {},
        sessions: {}
      };
    }

    async getTokens(period = 'today', optionsOrStats) {
      const periodStats = await this.getPeriodStats(period, optionsOrStats);
      return periodStats.totalTokens || 0;
    }

    async getCosts(period = 'today', optionsOrStats) {
      const periodStats = await this.getPeriodStats(period, optionsOrStats);
      return {
        costUsd: periodStats.costUsd || 0,
        clientCosts: periodStats.clientCosts || {},
        modelCosts: periodStats.modelCosts || {}
      };
    }

    async getModels(period = 'today', optionsOrStats) {
      const periodStats = await this.getPeriodStats(period, optionsOrStats);
      return {
        tokens: periodStats.models || {},
        costs: periodStats.modelCosts || {}
      };
    }

    async getProviders(period = 'today', optionsOrStats) {
      const periodStats = await this.getPeriodStats(period, optionsOrStats);
      return {
        tokens: periodStats.clients || {},
        costs: periodStats.clientCosts || {}
      };
    }

    async getHistory(options = {}) {
      return this._backend.getDashboardHistory(options);
    }

    async lookupModelPricing(modelId) {
      return this._backend.lookupModelPricing(modelId);
    }

    async getStreamStatus() {
      return this._backend.getStreamStatus();
    }

    getLiveVelocity(stats) {
      if (stats?.live?.velocityTokensPerSec != null) {
        return Number(stats.live.velocityTokensPerSec);
      }
      return 0;
    }

    onStats(callback) {
      return this._subscribe('stats', callback);
    }

    onHistoryChanged(callback) {
      return this._subscribe('historyChanged', callback);
    }

    subscribe(event, callback) {
      return this._subscribe(event, callback);
    }
  }

  /**
   * LimitsService
   * Handles rate limits, quotas, resets, burn rates, provider health.
   */
  class LimitsService {
    constructor({ backend, subscribe, emit, isMock = false }) {
      this._backend = backend;
      this._subscribe = subscribe;
      this._emit = emit;
      this._isMock = isMock;

      this.codex = {
        accounts: () => this._backend.codex?.accounts(),
        addAccount: (opts) => this._backend.codex?.addAccount(opts),
        cancelLogin: (opts) => this._backend.codex?.cancelLogin(opts),
        selectWorkspace: (opts) => this._backend.codex?.selectWorkspace(opts),
        removeAccount: (id) => this._backend.codex?.removeAccount(id),
        setAccountEnabled: (id, enabled) => this._backend.codex?.setAccountEnabled(id, enabled),
        switchSystemAccount: (id) => this._backend.codex?.switchSystemAccount(id),
        refreshAccountLimits: (id) => this._backend.codex?.refreshAccountLimits(id),
        onActiveAccount: (cb) => this._subscribe('codex:activeAccount', cb),
        onLoginStatus: (cb) => this._subscribe('codex:loginStatus', cb)
      };

      this.cursor = {
        loginManual: (token) => this._backend.cursor?.loginManual(token),
        setAccountEnabled: (id, enabled) => this._backend.cursor?.setAccountEnabled(id, enabled),
        logout: (id) => this._backend.cursor?.logout(id),
        status: (opts) => this._backend.cursor?.status(opts)
      };

      this.opencode = {
        saveCookie: (cookie) => this._backend.opencode?.saveCookie(cookie),
        logout: () => this._backend.opencode?.logout(),
        status: () => this._backend.opencode?.status(),
        getProfiles: () => this._backend.opencode?.getProfiles(),
        saveProfile: (name, credential, kind, opts) => this._backend.opencode?.saveProfile(name, credential, kind, opts),
        deleteProfile: (name) => this._backend.opencode?.deleteProfile(name),
        renameProfile: (oldName, newName, opts) => this._backend.opencode?.renameProfile(oldName, newName, opts),
        removeCredential: (name, kind) => this._backend.opencode?.removeCredential(name, kind),
        moveCredential: (name, kind, target, opts) => this._backend.opencode?.moveCredential(name, kind, target, opts),
        setProfileEnabled: (name, enabled) => this._backend.opencode?.setProfileEnabled(name, enabled),
        setAmbientEnabled: (enabled) => this._backend.opencode?.setAmbientEnabled(enabled)
      };

      this.openrouter = {
        getProfiles: () => this._backend.openrouter?.getProfiles(),
        saveProfile: (name, apiKey) => this._backend.openrouter?.saveProfile(name, apiKey),
        deleteProfile: (name) => this._backend.openrouter?.deleteProfile(name),
        renameProfile: (oldName, newName) => this._backend.openrouter?.renameProfile(oldName, newName),
        setProfileEnabled: (name, enabled) => this._backend.openrouter?.setProfileEnabled(name, enabled)
      };

      this.thirdparty = {
        getProfiles: () => this._backend.thirdparty?.getProfiles(),
        saveProfile: (profile) => this._backend.thirdparty?.saveProfile(profile),
        deleteProfile: (name) => this._backend.thirdparty?.deleteProfile(name),
        renameProfile: (oldName, newName) => this._backend.thirdparty?.renameProfile(oldName, newName),
        setProfileEnabled: (name, enabled) => this._backend.thirdparty?.setProfileEnabled(name, enabled)
      };

      this.antigravity = {
        accounts: () => this._backend.antigravity?.accounts(),
        addAccount: () => this._backend.antigravity?.addAccount(),
        cancelLogin: () => this._backend.antigravity?.cancelLogin(),
        removeAccount: (id) => this._backend.antigravity?.removeAccount(id),
        setAccountEnabled: (id, enabled) => this._backend.antigravity?.setAccountEnabled(id, enabled),
        onAccounts: (cb) => this._subscribe('antigravity:accounts', cb)
      };

      this.mimo = {
        accounts: () => this._backend.mimo?.accounts(),
        addAccount: (cookieHeader) => this._backend.mimo?.addAccount(cookieHeader),
        openConsole: () => this._backend.mimo?.openConsole(),
        removeAccount: (id) => this._backend.mimo?.removeAccount(id),
        setAccountEnabled: (id, enabled) => this._backend.mimo?.setAccountEnabled(id, enabled),
        onAccounts: (cb) => this._subscribe('mimo:accounts', cb)
      };

      this.copilot = {
        signIn: (opts) => this._backend.copilot?.signIn(opts),
        cancelSignIn: (opts) => this._backend.copilot?.cancelSignIn(opts),
        onLoginStatus: (cb) => this._subscribe('copilot:loginStatus', cb)
      };
    }

    async getServiceStatus(options = {}) {
      return this._backend.getServiceStatus(options);
    }

    async getCodexResetForecast(options = {}) {
      return this._backend.getCodexResetForecast(options);
    }

    async saveCredential(providerId, values) {
      return this._backend.limits?.saveCredential(providerId, values);
    }

    async clearCredential(providerId) {
      return this._backend.limits?.clearCredential(providerId);
    }

    async listOrganizationChoices(providerId) {
      return this._backend.limits?.listOrganizationChoices(providerId);
    }

    async getLimits(optionsOrStats) {
      let stats;
      if (optionsOrStats && typeof optionsOrStats === 'object' && optionsOrStats.limits) {
        stats = optionsOrStats;
      } else {
        stats = await this._backend.getStats(optionsOrStats);
      }
      return stats?.limits || {};
    }

    getProviderQuota(providerId, statsOrLimits) {
      const limits = statsOrLimits?.limits || statsOrLimits || {};
      return limits[providerId] || null;
    }

    onServiceStatus(callback) {
      return this._subscribe('serviceStatus', callback);
    }

    subscribe(event, callback) {
      return this._subscribe(event, callback);
    }
  }

  /**
   * SessionService
   * Handles session list, parent-child groups, turns, drill-down details.
   */
  class SessionService {
    constructor({ backend, subscribe, emit, isMock = false }) {
      this._backend = backend;
      this._subscribe = subscribe;
      this._emit = emit;
      this._isMock = isMock;
    }

    async getSessions(snapshotId) {
      return this._backend.getAllTimeSessions(snapshotId);
    }

    async getSessionDetail(args) {
      return this._backend.getSessionDetail(args);
    }

    async clearArchive() {
      return this._backend.clearSessionUsageArchive();
    }

    groupSessionsByParent(sessions = []) {
      const roots = [];
      const lookup = new Map();

      for (const session of sessions) {
        lookup.set(session.id, { ...session, children: [] });
      }

      for (const session of lookup.values()) {
        if (session.parentId && lookup.has(session.parentId)) {
          lookup.get(session.parentId).children.push(session);
        } else {
          roots.push(session);
        }
      }
      return roots;
    }

    filterSessions(sessions = [], options = {}) {
      const { client, query, minTokens, minCost, startDate, endDate } = options;
      const lowerQuery = query ? query.toLowerCase() : null;
      const startMs = startDate ? new Date(startDate).getTime() : null;
      const endMs = endDate ? new Date(endDate).getTime() : null;

      return sessions.filter((s) => {
        if (client && s.client !== client) return false;
        if (minTokens != null && (s.tokens || 0) < minTokens) return false;
        if (minCost != null && (s.cost || 0) < minCost) return false;
        if (lowerQuery) {
          const titleMatch = s.title && s.title.toLowerCase().includes(lowerQuery);
          const idMatch = s.id && s.id.toLowerCase().includes(lowerQuery);
          if (!titleMatch && !idMatch) return false;
        }
        if (startMs || endMs) {
          const time = s.timestamp ? new Date(s.timestamp).getTime() : 0;
          if (startMs && time < startMs) return false;
          if (endMs && time > endMs) return false;
        }
        return true;
      });
    }

    extractTurns(detail) {
      return (detail?.turns || []).map((turn, index) => ({
        index,
        type: turn.type || 'turn',
        tokens: turn.tokens || {},
        totalTokens: turn.tokens?.total || 0,
        costEstimate: turn.costEstimate || 0,
        unpricedTokens: turn.unpricedTokens || 0,
        tools: Array.from(new Set(turn.tools || [])),
        timestamp: turn.timestamp || null
      }));
    }

    subscribe(event, callback) {
      return this._subscribe(event, callback);
    }
  }

  /**
   * SettingsService
   * Handles preferences, theme, currency, aliases, credentials.
   */
  class SettingsService {
    constructor({ backend, subscribe, emit, isMock = false }) {
      this._backend = backend;
      this._subscribe = subscribe;
      this._emit = emit;
      this._isMock = isMock;
    }

    async getSettings() {
      return this._backend.getSettings();
    }

    async refreshCurrencyRates() {
      return this._backend.refreshCurrencyRates?.() || this._backend.getSettings();
    }

    async updateSettings(patch) {
      return this._backend.updateSettings(patch);
    }

    async saveSubscriptions(subscriptions, base) {
      return this._backend.saveSubscriptions(subscriptions, base);
    }

    async adoptOrphanedSubscriptions() {
      return this._backend.adoptOrphanedSubscriptions();
    }

    async discardOrphanedSubscriptions() {
      return this._backend.discardOrphanedSubscriptions();
    }

    async previewAppearance(patch) {
      return this._backend.previewAppearance(patch);
    }

    async getBackgroundImage() {
      return this._backend.getBackgroundImage();
    }

    async chooseBackgroundImage() {
      return this._backend.chooseBackgroundImage();
    }

    async clearBackgroundImage() {
      return this._backend.clearBackgroundImage();
    }

    async getNativeMaterialState() {
      return this._backend.getNativeMaterialState();
    }

    onSettings(callback) {
      return this._subscribe('settings', callback);
    }

    onTheme(callback) {
      return this._subscribe('theme', callback);
    }

    onNativeMaterial(callback) {
      return this._subscribe('nativeMaterial', callback);
    }

    subscribe(event, callback) {
      return this._subscribe(event, callback);
    }
  }

  /**
   * WindowService
   * Handles minimize, close, dock, bubble, resize.
   */
  class WindowService {
    constructor({ backend, subscribe, emit, isMock = false }) {
      this._backend = backend;
      this._subscribe = subscribe;
      this._emit = emit;
      this._isMock = isMock;

      this.dashboard = {
        ready: () => this._backend.dashboard?.ready(),
        minimize: () => this._backend.dashboard?.minimize(),
        close: () => this._backend.dashboard?.close()
      };
    }

    minimize() {
      return this._backend.minimize();
    }

    close() {
      return this._backend.close();
    }

    async openDashboard() {
      return this._backend.openDashboard();
    }

    async expandBubble() {
      return this._backend.expandFloatingBubble();
    }

    async moveBubble(delta) {
      return this._backend.moveFloatingBubble(delta);
    }

    async peekBubble() {
      return this._backend.peekFloatingBubble();
    }

    async collapseBubbleIfIdle() {
      return this._backend.collapseFloatingBubbleIfIdle();
    }

    async setBubbleCollapsedSize(size) {
      return this._backend.setFloatingBubbleCollapsedSize(size);
    }

    signalContentReady() {
      return this._backend.signalContentReady();
    }

    setViewState(patch) {
      return this._backend.setViewState(patch);
    }

    onVisibility(callback) {
      return this._subscribe('visibility', callback);
    }

    onFloatingBubbleState(callback) {
      return this._subscribe('bubbleState', callback);
    }

    onOpenSettings(callback) {
      return this._subscribe('openSettings', callback);
    }

    onOpenView(callback) {
      return this._subscribe('openView', callback);
    }

    subscribe(event, callback) {
      return this._subscribe(event, callback);
    }
  }

  /**
   * ClientBridge
   * Orchestrates services, event bus, and Electron/Mock bridging.
   */
  class ClientBridge {
    constructor(options = {}) {
      const isExplicitMock = options.mock === true;
      let backend = options.backend;

      if (!backend) {
        if (typeof window !== 'undefined' && window.tokenMonitor) {
          backend = window.tokenMonitor;
        } else {
          backend = (options.mockBackend || createMockBackend(options.mockData));
          this._isMock = true;
        }
      }

      if (isExplicitMock && !this._isMock) {
        backend = createMockBackend(options.mockData);
        this._isMock = true;
      }

      this._backend = backend;
      this._isMock = Boolean(this._isMock || options.mock || backend._mockState);
      this._listeners = new Map();

      const boundSubscribe = this.subscribe.bind(this);
      const boundEmit = this.emit.bind(this);

      this.telemetry = new TelemetryService({ backend, subscribe: boundSubscribe, emit: boundEmit, isMock: this._isMock });
      this.limits = new LimitsService({ backend, subscribe: boundSubscribe, emit: boundEmit, isMock: this._isMock });
      this.sessions = new SessionService({ backend, subscribe: boundSubscribe, emit: boundEmit, isMock: this._isMock });
      this.settings = new SettingsService({ backend, subscribe: boundSubscribe, emit: boundEmit, isMock: this._isMock });
      this.window = new WindowService({ backend, subscribe: boundSubscribe, emit: boundEmit, isMock: this._isMock });

      // Extended subsystems
      this.hub = {
        getInfo: () => this._backend.getHubInfo?.(),
        getBuildStatus: () => this._backend.getHubBuildStatus?.(),
        regenerateSecret: () => this._backend.regenerateHubSecret?.(),
        onHub: (cb) => this.subscribe('hub', cb)
      };

      this.app = {
        getInfo: () => this._backend.getAppInfo?.(),
        generateDiagnosticReport: () => this._backend.generateDiagnosticReport?.(),
        copyText: (text) => this._backend.copyText?.(text),
        clientSources: (clientId) => this._backend.clientSources?.(clientId),
        pickCustomScanPath: (clientId) => this._backend.pickCustomScanPath?.(clientId),
        revealClientSource: (clientId) => this._backend.revealClientSource?.(clientId),
        revealClientSyncLock: (clientId) => this._backend.revealClientSyncLock?.(clientId),
        rescanClient: (clientId) => this._backend.rescanClient?.(clientId),
        repairClientSyncLock: (clientId) => this._backend.repairClientSyncLock?.(clientId),
        openExternal: (url) => this._backend.openExternal?.(url),
        openUserData: () => this._backend.openUserData?.(),
        exportNow: () => this._backend.exportNow?.(),
        pickExportDir: () => this._backend.pickExportDir?.(),
        getTokscaleStatus: () => this._backend.getTokscaleStatus?.(),
        getAppUpdateState: () => this._backend.getAppUpdateState?.(),
        checkAppUpdateNow: () => this._backend.checkAppUpdateNow?.(),
        downloadAppUpdate: () => this._backend.downloadAppUpdate?.(),
        installAppUpdate: () => this._backend.installAppUpdate?.(),
        dismissAppUpdate: (version) => this._backend.dismissAppUpdate?.(version),
        setTrayIcons: (icons) => this._backend.setTrayIcons?.(icons),
        deleteDevice: (deviceId) => this._backend.deleteDevice?.(deviceId),
        onAppUpdate: (cb) => this.subscribe('appUpdate', cb)
      };

      this.syncContent = {
        getStatus: (refresh) => this._backend.getSyncContentStatus?.(refresh),
        preview: (kind) => this._backend.previewSyncContent?.(kind),
        configure: (opts) => this._backend.configureSyncContent?.(opts),
        retryCleanup: () => this._backend.retrySyncContentCleanup?.(),
        onSync: (cb) => this.subscribe('syncContent', cb)
      };

      if (this._isMock) {
        this._setupMockControls();
      }
    }

    get isMock() {
      return this._isMock;
    }

    get isStandalone() {
      return this._isMock;
    }

    get rawBackend() {
      return this._backend;
    }

    _setupMockControls() {
      const self = this;
      let timer = null;
      this.mock = {
        get data() {
          return self._backend?._mockState;
        },
        reset: (customData) => {
          const fresh = createMockBackend(customData);
          self._backend._mockState = fresh._mockState;
        },
        emit: (event, payload) => {
          this.emit(event, payload);
        },
        simulateTraffic: ({ intervalMs = 2000, tokensDelta = 120 } = {}) => {
          if (timer) clearInterval(timer);
          timer = setInterval(() => {
            const stats = this._backend._mockState?.stats;
            if (stats?.periods?.today) {
              stats.periods.today.totalTokens += tokensDelta;
              stats.periods.today.costUsd = Number((stats.periods.today.costUsd + tokensDelta * 0.000015).toFixed(4));
              if (stats.live) {
                stats.live.velocityTokensPerSec = Number((tokensDelta / (intervalMs / 1000)).toFixed(1));
              }
            }
            this.emit('stats', JSON.parse(JSON.stringify(stats)));
          }, intervalMs);
        },
        stopTraffic: () => {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      };
    }

    subscribe(event, callback) {
      if (typeof callback !== 'function') {
        return () => {};
      }

      if (!this._listeners.has(event)) {
        this._listeners.set(event, new Set());
      }
      this._listeners.get(event).add(callback);

      let backendUnbind = null;

      // Connect push channels if the backend provides them
      if (this._backend) {
        switch (event) {
          case 'stats':
            if (typeof this._backend.onStatsPush === 'function') {
              backendUnbind = this._backend.onStatsPush(callback);
            }
            break;
          case 'historyChanged':
            if (typeof this._backend.onDashboardHistoryChanged === 'function') {
              backendUnbind = this._backend.onDashboardHistoryChanged(callback);
            }
            break;
          case 'settings':
            if (typeof this._backend.onSettingsPush === 'function') {
              backendUnbind = this._backend.onSettingsPush(callback);
            }
            break;
          case 'theme':
            if (typeof this._backend.onSystemUiThemePush === 'function') {
              backendUnbind = this._backend.onSystemUiThemePush(callback);
            }
            break;
          case 'nativeMaterial':
            if (typeof this._backend.onNativeMaterialState === 'function') {
              backendUnbind = this._backend.onNativeMaterialState(callback);
            }
            break;
          case 'visibility':
            if (typeof this._backend.onWindowVisibilityPush === 'function') {
              backendUnbind = this._backend.onWindowVisibilityPush(callback);
            }
            break;
          case 'bubbleState':
            if (typeof this._backend.onFloatingBubbleState === 'function') {
              backendUnbind = this._backend.onFloatingBubbleState(callback);
            }
            break;
          case 'openSettings':
            if (typeof this._backend.onOpenSettings === 'function') {
              backendUnbind = this._backend.onOpenSettings(callback);
            }
            break;
          case 'openView':
            if (typeof this._backend.onOpenView === 'function') {
              backendUnbind = this._backend.onOpenView(callback);
            }
            break;
          case 'hub':
            if (typeof this._backend.onHubPush === 'function') {
              backendUnbind = this._backend.onHubPush(callback);
            }
            break;
          case 'syncContent':
            if (typeof this._backend.onSyncContentPush === 'function') {
              backendUnbind = this._backend.onSyncContentPush(callback);
            }
            break;
          case 'appUpdate':
            if (typeof this._backend.onAppUpdatePush === 'function') {
              backendUnbind = this._backend.onAppUpdatePush(callback);
            }
            break;
          case 'codex:activeAccount':
            if (typeof this._backend.codex?.onActiveAccount === 'function') {
              backendUnbind = this._backend.codex.onActiveAccount(callback);
            }
            break;
          case 'codex:loginStatus':
            if (typeof this._backend.codex?.onLoginStatus === 'function') {
              backendUnbind = this._backend.codex.onLoginStatus(callback);
            }
            break;
          case 'copilot:loginStatus':
            if (typeof this._backend.copilot?.onLoginStatus === 'function') {
              backendUnbind = this._backend.copilot.onLoginStatus(callback);
            }
            break;
          case 'antigravity:accounts':
            if (typeof this._backend.antigravity?.onAccounts === 'function') {
              backendUnbind = this._backend.antigravity.onAccounts(callback);
            }
            break;
          case 'mimo:accounts':
            if (typeof this._backend.mimo?.onAccounts === 'function') {
              backendUnbind = this._backend.mimo.onAccounts(callback);
            }
            break;
          default:
            break;
        }
      }

      return () => {
        const set = this._listeners.get(event);
        if (set) {
          set.delete(callback);
          if (set.size === 0) this._listeners.delete(event);
        }
        if (typeof backendUnbind === 'function') {
          try { backendUnbind(); } catch (_) {}
        }
      };
    }

    emit(event, payload) {
      const set = this._listeners.get(event);
      if (set) {
        for (const listener of Array.from(set)) {
          try { listener(payload); } catch (_) {}
        }
      }
    }

    /**
     * Creates a backwards-compatible facade matching the exact window.tokenMonitor shape.
     */
    createTokenMonitorCompat() {
      const self = this;
      return {
        getSettings: () => self.settings.getSettings(),
        refreshCurrencyRates: () => self.settings.refreshCurrencyRates(),
        updateSettings: (patch) => self.settings.updateSettings(patch),
        saveSubscriptions: (subs, base) => self.settings.saveSubscriptions(subs, base),
        adoptOrphanedSubscriptions: () => self.settings.adoptOrphanedSubscriptions(),
        discardOrphanedSubscriptions: () => self.settings.discardOrphanedSubscriptions(),
        clearSessionUsageArchive: () => self.sessions.clearArchive(),
        lookupModelPricing: (modelId) => self.telemetry.lookupModelPricing(modelId),
        previewAppearance: (patch) => self.settings.previewAppearance(patch),
        getBackgroundImage: () => self.settings.getBackgroundImage(),
        chooseBackgroundImage: () => self.settings.chooseBackgroundImage(),
        clearBackgroundImage: () => self.settings.clearBackgroundImage(),
        getNativeMaterialState: () => self.settings.getNativeMaterialState(),
        onNativeMaterialState: (cb) => self.settings.onNativeMaterial(cb),
        getStats: (options) => self.telemetry.getStats(options),
        deleteDevice: (deviceId) => self.app.deleteDevice(deviceId),
        getAllTimeSessions: (snapshotId) => self.sessions.getSessions(snapshotId),
        getSessionDetail: (args) => self.sessions.getSessionDetail(args),
        getStreamStatus: () => self.telemetry.getStreamStatus(),
        getServiceStatus: (options) => self.limits.getServiceStatus(options),
        getCodexResetForecast: (options) => self.limits.getCodexResetForecast(options),
        openDashboard: () => self.window.openDashboard(),
        getDashboardHistory: (options) => self.telemetry.getHistory(options),
        onDashboardHistoryChanged: (cb) => self.telemetry.onHistoryChanged(cb),
        dashboard: {
          ready: () => self.window.dashboard.ready(),
          minimize: () => self.window.dashboard.minimize(),
          close: () => self.window.dashboard.close()
        },
        getSyncContentStatus: (refresh = true) => self.syncContent.getStatus(refresh),
        previewSyncContent: (kind) => self.syncContent.preview(kind),
        configureSyncContent: (options) => self.syncContent.configure(options),
        retrySyncContentCleanup: () => self.syncContent.retryCleanup(),
        onSyncContentPush: (cb) => self.syncContent.onSync(cb),
        getHubInfo: () => self.hub.getInfo(),
        getHubBuildStatus: () => self.hub.getBuildStatus(),
        regenerateHubSecret: () => self.hub.regenerateSecret(),
        onHubPush: (cb) => self.hub.onHub(cb),
        onStatsPush: (cb) => self.telemetry.onStats(cb),
        onWindowVisibilityPush: (cb) => self.window.onVisibility(cb),
        onSettingsPush: (cb) => self.settings.onSettings(cb),
        onSystemUiThemePush: (cb) => self.settings.onTheme(cb),
        onOpenSettings: (cb) => self.window.onOpenSettings(cb),
        onOpenView: (cb) => self.window.onOpenView(cb),
        getAppInfo: () => self.app.getInfo(),
        generateDiagnosticReport: () => self.app.generateDiagnosticReport(),
        copyText: (text) => self.app.copyText(text),
        clientSources: (clientId) => self.app.clientSources(clientId),
        pickCustomScanPath: (clientId) => self.app.pickCustomScanPath(clientId),
        revealClientSource: (clientId) => self.app.revealClientSource(clientId),
        revealClientSyncLock: (clientId) => self.app.revealClientSyncLock(clientId),
        rescanClient: (clientId) => self.app.rescanClient(clientId),
        repairClientSyncLock: (clientId) => self.app.repairClientSyncLock(clientId),
        openExternal: (url) => self.app.openExternal(url),
        openUserData: () => self.app.openUserData(),
        exportNow: () => self.app.exportNow(),
        pickExportDir: () => self.app.pickExportDir(),
        getTokscaleStatus: () => self.app.getTokscaleStatus(),
        getAppUpdateState: () => self.app.getAppUpdateState(),
        checkAppUpdateNow: () => self.app.checkAppUpdateNow(),
        downloadAppUpdate: () => self.app.downloadAppUpdate(),
        installAppUpdate: () => self.app.installAppUpdate(),
        dismissAppUpdate: (version) => self.app.dismissAppUpdate(version),
        expandFloatingBubble: () => self.window.expandBubble(),
        moveFloatingBubble: (delta) => self.window.moveBubble(delta),
        signalContentReady: () => self.window.signalContentReady(),
        setViewState: (patch) => self.window.setViewState(patch),
        peekFloatingBubble: () => self.window.peekBubble(),
        collapseFloatingBubbleIfIdle: () => self.window.collapseBubbleIfIdle(),
        setFloatingBubbleCollapsedSize: (size) => self.window.setBubbleCollapsedSize(size),
        onFloatingBubbleState: (cb) => self.window.onFloatingBubbleState(cb),
        onAppUpdatePush: (cb) => self.app.onAppUpdate(cb),
        setTrayIcons: (icons) => self.app.setTrayIcons(icons),
        cursor: {
          loginManual: (token) => self.limits.cursor.loginManual(token),
          setAccountEnabled: (id, enabled) => self.limits.cursor.setAccountEnabled(id, enabled),
          logout: (id) => self.limits.cursor.logout(id),
          status: (opts) => self.limits.cursor.status(opts)
        },
        limits: {
          saveCredential: (providerId, values) => self.limits.saveCredential(providerId, values),
          listOrganizationChoices: (providerId) => self.limits.listOrganizationChoices(providerId),
          clearCredential: (providerId) => self.limits.clearCredential(providerId)
        },
        opencode: { ...self.limits.opencode },
        openrouter: { ...self.limits.openrouter },
        thirdparty: { ...self.limits.thirdparty },
        codex: { ...self.limits.codex },
        antigravity: { ...self.limits.antigravity },
        mimo: { ...self.limits.mimo },
        copilot: { ...self.limits.copilot },
        minimize: () => self.window.minimize(),
        close: () => self.window.close(),
        bridge: self,
        subscribe: (event, callback) => self.subscribe(event, callback)
      };
    }

    installAsGlobal(target = typeof window !== 'undefined' ? window : null) {
      if (!target) return;
      target.TokenMonitorClientBridge = {
        createClientBridge,
        clientBridge: this,
        TelemetryService,
        LimitsService,
        SessionService,
        SettingsService,
        WindowService,
        createMockBackend,
        DEFAULT_MOCK_DATA
      };
      target.clientBridge = this;
      if (!target.tokenMonitor) {
        target.tokenMonitor = this.createTokenMonitorCompat();
      } else if (!target.tokenMonitor.bridge) {
        target.tokenMonitor.bridge = this;
        target.tokenMonitor.subscribe = (ev, cb) => this.subscribe(ev, cb);
      }
    }
  }

  function createClientBridge(options = {}) {
    return new ClientBridge(options);
  }

  // Default singleton instance
  const clientBridge = createClientBridge();

  // If in browser context, auto-install onto window/globalThis
  if (typeof window !== 'undefined') {
    clientBridge.installAsGlobal(window);
  }

  return {
    createClientBridge,
    clientBridge,
    ClientBridge,
    TelemetryService,
    LimitsService,
    SessionService,
    SettingsService,
    WindowService,
    createMockBackend,
    DEFAULT_MOCK_DATA
  };
});
