import { useState, useEffect, useCallback } from 'react';
import type { TokenMonitorSettingsState, ManagedAccount } from '../settings/types';
import { maskEmailIfNeeded } from './presentationState';

export type AuthKind = 'oauth' | 'deviceCode' | 'apiKey' | 'cookie' | 'token' | 'local';

export type AccountStatus = 'connected' | 'notConfigured' | 'error' | 'pending';

export interface AccountItem {
  id: string;
  label: string; /* masked via maskEmailIfNeeded when settings.maskLimitAccountEmails */
  enabled: boolean;
  isActive?: boolean;
  realm?: string;
  detail?: string;
}

export interface ProviderAccountActions {
  signIn?: (options?: any) => Promise<any> | void;
  cancel?: () => Promise<any> | void;
  addAccount?: (options?: any) => Promise<any> | void;
  remove?: (id?: string) => Promise<any> | void;
  setEnabled?: (id: string, on: boolean) => Promise<any> | void;
  saveCredential?: (fields: Record<string, any>) => Promise<any> | void;
  refresh?: () => Promise<any> | void;
}

export interface ProviderAccounts {
  providerId: string;
  label: string;
  icon?: string;
  authKind: AuthKind;
  status: AccountStatus;
  accounts: AccountItem[];
  pendingDetail?: {
    message?: string | null;
    deviceCode?: { userCode?: string; verificationUri?: string } | null;
  } | null;
  actions: ProviderAccountActions;
}

function resolveAccountLabel(
  account: { email?: string; name?: string; id?: string },
  maskEmails: boolean
): string {
  const target =
    (typeof account?.email === 'string' && account.email) ||
    (typeof account?.name === 'string' && account.name) ||
    (typeof account?.id === 'string' && account.id) ||
    '';
  return maskEmailIfNeeded(target, maskEmails) || target || '';
}

function extractProfilesMap(raw: any): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  const map =
    raw.profiles && typeof raw.profiles === 'object' && !Array.isArray(raw.profiles)
      ? raw.profiles
      : raw;
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(map)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = val;
    }
  }
  return result;
}

export function useProviderAccounts(settings: TokenMonitorSettingsState): ProviderAccounts[] {
  const maskEmails = settings.maskLimitAccountEmails === true;

  // Codex state
  const [codexAccounts, setCodexAccounts] = useState<ManagedAccount[]>([]);
  const [codexLoggingIn, setCodexLoggingIn] = useState(false);
  const [codexStatusMessage, setCodexStatusMessage] = useState<string | null>(null);

  // Antigravity state
  const [antigravityAccounts, setAntigravityAccounts] = useState<ManagedAccount[]>([]);
  const [antigravityLoggingIn, setAntigravityLoggingIn] = useState(false);

  // WorkBuddy state
  const [workbuddyAccounts, setWorkbuddyAccounts] = useState<any[]>([]);
  const [workbuddyLoggingIn, setWorkbuddyLoggingIn] = useState<'cn' | 'ai' | null>(null);
  const [workbuddyStatusMessage, setWorkbuddyStatusMessage] = useState<string | null>(null);

  // Copilot state
  const [copilotSigningIn, setCopilotSigningIn] = useState(false);
  const [copilotDeviceCode, setCopilotDeviceCode] = useState<{ userCode?: string; verificationUri?: string } | null>(null);

  // Cursor state
  const [cursorStatus, setCursorStatus] = useState<any>(null);

  // MiMo state
  const [mimoAccounts, setMimoAccounts] = useState<ManagedAccount[]>([]);

  // OpenCode state
  const [opencodeProfiles, setOpencodeProfiles] = useState<Record<string, any>>({});

  // OpenRouter state
  const [openrouterProfiles, setOpenrouterProfiles] = useState<Record<string, any>>({});

  // Third-party state
  const [thirdpartyProfiles, setThirdpartyProfiles] = useState<Record<string, any>>({});

  // Initial fetch and event subscriptions
  useEffect(() => {
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    if (!tm) return;

    if (tm.codex?.accounts) {
      tm.codex.accounts().then((accs: any) => setCodexAccounts(accs || [])).catch(() => {});
    }
    if (tm.antigravity?.accounts) {
      tm.antigravity.accounts().then((accs: any) => setAntigravityAccounts(accs || [])).catch(() => {});
    }
    if (tm.workbuddy?.accounts) {
      tm.workbuddy.accounts().then((accs: any) => setWorkbuddyAccounts(accs || [])).catch(() => {});
    }
    if (tm.mimo?.accounts) {
      tm.mimo.accounts().then((accs: any) => setMimoAccounts(accs || [])).catch(() => {});
    }
    if (tm.opencode?.getProfiles) {
      tm.opencode.getProfiles().then((p: any) => setOpencodeProfiles(extractProfilesMap(p))).catch(() => {});
    }
    if (tm.openrouter?.getProfiles) {
      tm.openrouter.getProfiles().then((p: any) => setOpenrouterProfiles(extractProfilesMap(p))).catch(() => {});
    }
    if (tm.thirdparty?.getProfiles) {
      tm.thirdparty.getProfiles().then((p: any) => setThirdpartyProfiles(extractProfilesMap(p))).catch(() => {});
    }
    if (tm.cursor?.status) {
      tm.cursor.status().then((s: any) => setCursorStatus(s || null)).catch(() => {});
    }

    const unsubCodex = tm.codex?.onLoginStatus?.((status: any) => {
      if (status?.status === 'waiting' || status?.status === 'authorizing') {
        setCodexLoggingIn(true);
        setCodexStatusMessage(status.message || 'Waiting for browser authentication...');
      } else if (status?.status === 'success' || status?.status === 'done') {
        setCodexLoggingIn(false);
        setCodexStatusMessage(null);
        tm.codex?.accounts().then((accs: any) => setCodexAccounts(accs || []));
      } else if (status?.status === 'error' || status?.status === 'cancelled') {
        setCodexLoggingIn(false);
        setCodexStatusMessage(status?.error || 'Login cancelled.');
      }
    });

    const unsubCopilot = tm.copilot?.onLoginStatus?.((status: any) => {
      if (status?.status === 'prompt') {
        setCopilotSigningIn(true);
        setCopilotDeviceCode({ userCode: status.userCode, verificationUri: status.verificationUri });
      } else if (status?.status === 'success') {
        setCopilotSigningIn(false);
        setCopilotDeviceCode(null);
      } else if (status?.status === 'error' || status?.status === 'cancelled') {
        setCopilotSigningIn(false);
        setCopilotDeviceCode(null);
      }
    });

    const unsubWorkbuddy = tm.workbuddy?.onAccounts?.((accs: any) => {
      setWorkbuddyAccounts(Array.isArray(accs) ? accs : []);
      setWorkbuddyLoggingIn(null);
    });

    const unsubAntigravity = tm.antigravity?.onAccounts?.((accs: any) => {
      setAntigravityAccounts(Array.isArray(accs) ? accs : []);
      setAntigravityLoggingIn(false);
    });

    const unsubMimo = tm.mimo?.onAccounts?.((accs: any) => {
      setMimoAccounts(Array.isArray(accs) ? accs : []);
    });

    return () => {
      unsubCodex?.();
      unsubCopilot?.();
      unsubWorkbuddy?.();
      unsubAntigravity?.();
      unsubMimo?.();
    };
  }, []);

  // Generic credential actions
  const handleGenericSave = useCallback((providerId: string) => async (fields: Record<string, any>) => {
    if (window.tokenMonitor?.limits?.saveCredential) {
      await window.tokenMonitor.limits.saveCredential(providerId, fields);
    }
  }, []);

  const handleGenericClear = useCallback((providerId: string) => async () => {
    if (window.tokenMonitor?.limits?.clearCredential) {
      await window.tokenMonitor.limits.clearCredential(providerId);
    }
  }, []);

  // Codex actions
  const handleCodexSignIn = useCallback(async () => {
    setCodexLoggingIn(true);
    setCodexStatusMessage('Opening OpenAI authorization page...');
    try {
      if (window.tokenMonitor?.codex?.addAccount) {
        await window.tokenMonitor.codex.addAccount();
      }
    } catch (err: any) {
      setCodexStatusMessage(err?.message || 'Login failed');
      setCodexLoggingIn(false);
    }
  }, []);

  const handleCodexCancel = useCallback(async () => {
    if (window.tokenMonitor?.codex?.cancelLogin) {
      await window.tokenMonitor.codex.cancelLogin();
    }
    setCodexLoggingIn(false);
    setCodexStatusMessage(null);
  }, []);

  const handleCodexRemove = useCallback(async (id?: string) => {
    if (!id) return;
    if (window.tokenMonitor?.codex?.removeAccount) {
      await window.tokenMonitor.codex.removeAccount(id);
      const accs = await window.tokenMonitor.codex.accounts();
      setCodexAccounts(accs || []);
    }
  }, []);

  const handleCodexSetEnabled = useCallback(async (id: string, on: boolean) => {
    if (window.tokenMonitor?.codex?.setAccountEnabled) {
      await window.tokenMonitor.codex.setAccountEnabled(id, on);
      const accs = await window.tokenMonitor.codex.accounts();
      setCodexAccounts(accs || []);
    }
  }, []);

  // Antigravity actions
  const handleAntigravitySignIn = useCallback(async () => {
    setAntigravityLoggingIn(true);
    try {
      if (window.tokenMonitor?.antigravity?.addAccount) {
        await window.tokenMonitor.antigravity.addAccount();
        const accs = await window.tokenMonitor.antigravity.accounts();
        setAntigravityAccounts(accs || []);
      }
    } finally {
      setAntigravityLoggingIn(false);
    }
  }, []);

  const handleAntigravityCancel = useCallback(async () => {
    if (window.tokenMonitor?.antigravity?.cancelLogin) {
      await window.tokenMonitor.antigravity.cancelLogin();
    }
    setAntigravityLoggingIn(false);
  }, []);

  const handleAntigravityRemove = useCallback(async (id?: string) => {
    if (!id) return;
    if (window.tokenMonitor?.antigravity?.removeAccount) {
      await window.tokenMonitor.antigravity.removeAccount(id);
      const accs = await window.tokenMonitor.antigravity.accounts();
      setAntigravityAccounts(accs || []);
    }
  }, []);

  const handleAntigravitySetEnabled = useCallback(async (id: string, on: boolean) => {
    if (window.tokenMonitor?.antigravity?.setAccountEnabled) {
      await window.tokenMonitor.antigravity.setAccountEnabled(id, on);
      const accs = await window.tokenMonitor.antigravity.accounts();
      setAntigravityAccounts(accs || []);
    }
  }, []);

  // WorkBuddy actions
  const handleWorkBuddySignIn = useCallback(async (realm: 'cn' | 'ai' = 'cn') => {
    setWorkbuddyLoggingIn(realm);
    setWorkbuddyStatusMessage(`Opening WorkBuddy ${realm.toUpperCase()} authentication...`);
    try {
      if (window.tokenMonitor?.workbuddy?.addAccount) {
        await window.tokenMonitor.workbuddy.addAccount(realm);
        const accs = await window.tokenMonitor.workbuddy.accounts();
        setWorkbuddyAccounts(accs || []);
      }
    } catch (err: any) {
      setWorkbuddyStatusMessage(err?.message || 'Login failed');
    } finally {
      setWorkbuddyLoggingIn(null);
    }
  }, []);

  const handleWorkBuddyCancel = useCallback(async () => {
    if (window.tokenMonitor?.workbuddy?.cancelLogin) {
      await window.tokenMonitor.workbuddy.cancelLogin();
    }
    setWorkbuddyLoggingIn(null);
    setWorkbuddyStatusMessage(null);
  }, []);

  const handleWorkBuddyRemove = useCallback(async (id?: string) => {
    if (!id) return;
    if (window.tokenMonitor?.workbuddy?.removeAccount) {
      await window.tokenMonitor.workbuddy.removeAccount(id);
      const accs = await window.tokenMonitor.workbuddy.accounts();
      setWorkbuddyAccounts(accs || []);
    }
  }, []);

  const handleWorkBuddySetEnabled = useCallback(async (id: string, on: boolean) => {
    if (window.tokenMonitor?.workbuddy?.setAccountEnabled) {
      await window.tokenMonitor.workbuddy.setAccountEnabled(id, on);
      const accs = await window.tokenMonitor.workbuddy.accounts();
      setWorkbuddyAccounts(accs || []);
    }
  }, []);

  // Notion actions
  const handleNotionSave = useCallback(async (fields: Record<string, any>) => {
    if (window.tokenMonitor?.limits?.saveCredential) {
      const payload: Record<string, string> = {};
      if (fields.notionWorkspaceId?.trim()) payload.notionWorkspaceId = fields.notionWorkspaceId.trim();
      if (fields.notionCookie?.trim()) payload.notionCookie = fields.notionCookie.trim();
      await window.tokenMonitor.limits.saveCredential('notion', payload);
    }
  }, []);

  const handleNotionClear = useCallback(async () => {
    if (window.tokenMonitor?.limits?.clearCredential) {
      await window.tokenMonitor.limits.clearCredential('notion');
    }
  }, []);

  // MiniMax actions
  const handleMiniMaxSave = useCallback(async (fields: Record<string, any>) => {
    if (window.tokenMonitor?.limits?.saveCredential) {
      const payload: Record<string, any> = {};
      if (fields.minimaxApiKey?.trim()) payload.minimaxApiKey = fields.minimaxApiKey.trim();
      if (fields.minimaxBillingMode) payload.minimaxBillingMode = fields.minimaxBillingMode;
      if (fields.minimaxApiRegion) payload.minimaxApiRegion = fields.minimaxApiRegion;
      await window.tokenMonitor.limits.saveCredential('minimax', payload);
    }
  }, []);

  const handleMiniMaxClear = useCallback(async () => {
    if (window.tokenMonitor?.limits?.clearCredential) {
      await window.tokenMonitor.limits.clearCredential('minimax');
    }
  }, []);

  // Claude actions
  const handleClaudeSave = useCallback(async (fields: Record<string, any>) => {
    if (window.tokenMonitor?.limits?.saveCredential) {
      await window.tokenMonitor.limits.saveCredential('claude', fields);
    }
  }, []);

  const handleClaudeClear = useCallback(async () => {
    if (window.tokenMonitor?.limits?.clearCredential) {
      await window.tokenMonitor.limits.clearCredential('claude');
    }
  }, []);

  // Copilot actions
  const handleCopilotSignIn = useCallback(async () => {
    setCopilotSigningIn(true);
    try {
      if (window.tokenMonitor?.copilot?.signIn) {
        await window.tokenMonitor.copilot.signIn();
      }
    } catch {
      setCopilotSigningIn(false);
    }
  }, []);

  const handleCopilotCancel = useCallback(async () => {
    if (window.tokenMonitor?.copilot?.cancelSignIn) {
      await window.tokenMonitor.copilot.cancelSignIn();
    }
    setCopilotSigningIn(false);
    setCopilotDeviceCode(null);
  }, []);

  const handleCopilotSave = useCallback(async (fields: Record<string, any>) => {
    if (fields.token?.trim() && window.tokenMonitor?.limits?.saveCredential) {
      await window.tokenMonitor.limits.saveCredential('copilot', { copilotApiToken: fields.token.trim(), token: fields.token.trim() });
    }
  }, []);

  const handleCopilotClear = useCallback(async () => {
    if (window.tokenMonitor?.limits?.clearCredential) {
      await window.tokenMonitor.limits.clearCredential('copilot');
    }
  }, []);

  // Cursor actions
  const handleCursorSave = useCallback(async (fields: Record<string, any>) => {
    const token = fields.token?.trim() || fields.cursorSessionToken?.trim();
    if (token && window.tokenMonitor?.cursor?.loginManual) {
      await window.tokenMonitor.cursor.loginManual(token);
      const s = await window.tokenMonitor.cursor.status();
      setCursorStatus(s || null);
    }
  }, []);

  const handleCursorLogout = useCallback(async (id?: string) => {
    if (!id) return;
    if (window.tokenMonitor?.cursor?.logout) {
      await window.tokenMonitor.cursor.logout(id);
      const s = await window.tokenMonitor.cursor.status();
      setCursorStatus(s || null);
    }
  }, []);

  const handleCursorSetEnabled = useCallback(async (id: string, on: boolean) => {
    if (window.tokenMonitor?.cursor?.setAccountEnabled) {
      await window.tokenMonitor.cursor.setAccountEnabled(id, on);
      const s = await window.tokenMonitor.cursor.status();
      setCursorStatus(s || null);
    }
  }, []);

  // MiMo actions
  const handleMimoSave = useCallback(async (fields: Record<string, any>) => {
    const cookie = fields.cookie?.trim() || fields.mimoCookieInput?.trim();
    if (cookie && window.tokenMonitor?.mimo?.addAccount) {
      await window.tokenMonitor.mimo.addAccount(cookie);
      const accs = await window.tokenMonitor.mimo.accounts();
      setMimoAccounts(accs || []);
    }
  }, []);

  const handleMimoRemove = useCallback(async (id?: string) => {
    if (!id) return;
    if (window.tokenMonitor?.mimo?.removeAccount) {
      await window.tokenMonitor.mimo.removeAccount(id);
      const accs = await window.tokenMonitor.mimo.accounts();
      setMimoAccounts(accs || []);
    }
  }, []);

  const handleMimoSetEnabled = useCallback(async (id: string, on: boolean) => {
    if (window.tokenMonitor?.mimo?.setAccountEnabled) {
      await window.tokenMonitor.mimo.setAccountEnabled(id, on);
      const accs = await window.tokenMonitor.mimo.accounts();
      setMimoAccounts(accs || []);
    }
  }, []);

  // OpenCode actions
  const handleOpencodeSave = useCallback(async (fields: Record<string, any>) => {
    if (fields.cookie?.trim() && window.tokenMonitor?.opencode?.saveCookie) {
      await window.tokenMonitor.opencode.saveCookie(fields.cookie.trim());
    } else if (fields.name?.trim() && window.tokenMonitor?.opencode?.saveProfile) {
      await window.tokenMonitor.opencode.saveProfile(
        fields.name.trim(),
        (fields.apiKey || '').trim(),
        'api',
        {}
      );
    }
    const p = await window.tokenMonitor?.opencode?.getProfiles();
    setOpencodeProfiles(extractProfilesMap(p));
  }, []);

  const handleOpencodeDelete = useCallback(async (name?: string) => {
    if (!name) return;
    if (window.tokenMonitor?.opencode?.deleteProfile) {
      await window.tokenMonitor.opencode.deleteProfile(name);
      const p = await window.tokenMonitor?.opencode?.getProfiles();
      setOpencodeProfiles(extractProfilesMap(p));
    }
  }, []);

  const handleOpencodeSetEnabled = useCallback(async (name: string, on: boolean) => {
    if (window.tokenMonitor?.opencode?.setProfileEnabled) {
      await window.tokenMonitor.opencode.setProfileEnabled(name, on);
      const p = await window.tokenMonitor?.opencode?.getProfiles();
      setOpencodeProfiles(extractProfilesMap(p));
    }
  }, []);

  // OpenRouter actions
  const handleOpenrouterSave = useCallback(async (fields: Record<string, any>) => {
    if (fields.name?.trim() && fields.apiKey?.trim() && window.tokenMonitor?.openrouter?.saveProfile) {
      await window.tokenMonitor.openrouter.saveProfile(fields.name.trim(), fields.apiKey.trim());
      const p = await window.tokenMonitor.openrouter.getProfiles();
      setOpenrouterProfiles(extractProfilesMap(p));
    }
  }, []);

  const handleOpenrouterDelete = useCallback(async (name?: string) => {
    if (!name) return;
    if (window.tokenMonitor?.openrouter?.deleteProfile) {
      await window.tokenMonitor.openrouter.deleteProfile(name);
      const p = await window.tokenMonitor.openrouter.getProfiles();
      setOpenrouterProfiles(extractProfilesMap(p));
    }
  }, []);

  const handleOpenrouterSetEnabled = useCallback(async (name: string, on: boolean) => {
    if (window.tokenMonitor?.openrouter?.setProfileEnabled) {
      await window.tokenMonitor.openrouter.setProfileEnabled(name, on);
      const p = await window.tokenMonitor.openrouter.getProfiles();
      setOpenrouterProfiles(extractProfilesMap(p));
    }
  }, []);

  // Third-party actions
  const handleThirdpartySave = useCallback(async (fields: Record<string, any>) => {
    if (fields.name?.trim() && fields.baseUrl?.trim() && window.tokenMonitor?.thirdparty?.saveProfile) {
      await window.tokenMonitor.thirdparty.saveProfile({
        name: fields.name.trim(),
        baseUrl: fields.baseUrl.trim(),
        apiKey: (fields.apiKey || '').trim(),
        mode: 'token',
        enabled: true,
      });
      const p = await window.tokenMonitor.thirdparty.getProfiles();
      setThirdpartyProfiles(extractProfilesMap(p));
    }
  }, []);

  const handleThirdpartyDelete = useCallback(async (name?: string) => {
    if (!name) return;
    if (window.tokenMonitor?.thirdparty?.deleteProfile) {
      await window.tokenMonitor.thirdparty.deleteProfile(name);
      const p = await window.tokenMonitor.thirdparty.getProfiles();
      setThirdpartyProfiles(extractProfilesMap(p));
    }
  }, []);

  const handleThirdpartySetEnabled = useCallback(async (name: string, on: boolean) => {
    if (window.tokenMonitor?.thirdparty?.setProfileEnabled) {
      await window.tokenMonitor.thirdparty.setProfileEnabled(name, on);
      const p = await window.tokenMonitor.thirdparty.getProfiles();
      setThirdpartyProfiles(extractProfilesMap(p));
    }
  }, []);

  // Kimi actions
  const handleKimiSave = useCallback(async (fields: Record<string, any>) => {
    if (window.tokenMonitor?.limits?.saveCredential) {
      await window.tokenMonitor.limits.saveCredential('kimi', fields);
    }
  }, []);

  const handleKimiClear = useCallback(async () => {
    if (window.tokenMonitor?.limits?.clearCredential) {
      await window.tokenMonitor.limits.clearCredential('kimi');
    }
  }, []);

  // Volcengine actions
  const handleVolcengineSave = useCallback(async (fields: Record<string, any>) => {
    if (window.tokenMonitor?.limits?.saveCredential) {
      await window.tokenMonitor.limits.saveCredential('volcengine', fields);
    }
  }, []);

  const handleVolcengineClear = useCallback(async () => {
    if (window.tokenMonitor?.limits?.clearCredential) {
      await window.tokenMonitor.limits.clearCredential('volcengine');
    }
  }, []);

  // DeepSeek actions
  const handleDeepSeekSave = useCallback(async (fields: Record<string, any>) => {
    if (window.tokenMonitor?.limits?.saveCredential) {
      await window.tokenMonitor.limits.saveCredential('deepseek', fields);
    }
  }, []);

  const handleDeepSeekClear = useCallback(async () => {
    if (window.tokenMonitor?.limits?.clearCredential) {
      await window.tokenMonitor.limits.clearCredential('deepseek');
    }
  }, []);

  // Providers assembly (ordered according to LIMIT_PROVIDER_CATALOG)
  const providers: ProviderAccounts[] = [];

  // 1. Claude
  const isClaudeConfigured = Boolean(
    settings.claudeWebCookieConfigured ||
    settings.claudeWebCookie === 'set' ||
    settings.claudeWebOrganizationId
  );
  providers.push({
    providerId: 'claude',
    label: 'Claude Code',
    icon: 'claude',
    authKind: 'cookie',
    status: isClaudeConfigured ? 'connected' : 'notConfigured',
    accounts: isClaudeConfigured
      ? [
          {
            id: 'claude',
            label: maskEmailIfNeeded(settings.claudeWebOrganizationId || 'Claude Web Session', maskEmails) || 'Claude Web Session',
            enabled: true,
            isActive: true,
          },
        ]
      : [],
    actions: {
      saveCredential: handleClaudeSave,
      remove: handleClaudeClear,
      refresh: () => window.tokenMonitor?.limits?.listOrganizationChoices?.('claude'),
    },
  });

  // 2. Codex
  providers.push({
    providerId: 'codex',
    label: 'OpenAI Codex',
    icon: 'codex',
    authKind: 'oauth',
    status: codexLoggingIn ? 'pending' : codexAccounts.length > 0 ? 'connected' : 'notConfigured',
    accounts: codexAccounts.map((acc) => ({
      id: acc.id,
      label: resolveAccountLabel(acc, maskEmails),
      enabled: acc.enabled !== false,
      isActive: (acc as any).isActive ?? acc.isDefault,
    })),
    pendingDetail: codexLoggingIn ? { message: codexStatusMessage || 'Opening OpenAI authorization page...' } : null,
    actions: {
      signIn: handleCodexSignIn,
      addAccount: handleCodexSignIn,
      cancel: handleCodexCancel,
      remove: handleCodexRemove,
      setEnabled: handleCodexSetEnabled,
      refresh: () => window.tokenMonitor?.codex?.accounts?.().then((accs: any) => setCodexAccounts(accs || [])),
    },
  });

  // 3. OpenCode
  const opencodeAccountsList: AccountItem[] = Object.entries(opencodeProfiles).map(([name, prof]) => ({
    id: name,
    label: name,
    enabled: prof.enabled !== false,
    isActive: prof.isActive,
  }));
  providers.push({
    providerId: 'opencode',
    label: 'OpenCode',
    icon: 'opencode',
    authKind: 'apiKey',
    status: opencodeAccountsList.length > 0 ? 'connected' : 'notConfigured',
    accounts: opencodeAccountsList,
    actions: {
      saveCredential: handleOpencodeSave,
      addAccount: handleOpencodeSave,
      remove: handleOpencodeDelete,
      setEnabled: handleOpencodeSetEnabled,
      refresh: () => window.tokenMonitor?.opencode?.getProfiles?.().then((p: any) => setOpencodeProfiles(extractProfilesMap(p))),
    },
  });

  // 4. Cursor
  const cursorAccountsList: AccountItem[] = (cursorStatus?.accounts || []).map((acc: any) => ({
    id: acc.id,
    label: resolveAccountLabel(acc, maskEmails),
    enabled: acc.enabled !== false,
    isActive: (acc as any).isActive ?? acc.isDefault,
  }));
  const isCursorConfigured = cursorAccountsList.length > 0 || Boolean(settings.cursorSessionTokenConfigured || settings.cursorSessionToken === 'set');
  providers.push({
    providerId: 'cursor',
    label: 'Cursor',
    icon: 'cursor',
    authKind: 'token',
    status: isCursorConfigured ? 'connected' : 'notConfigured',
    accounts: cursorAccountsList,
    actions: {
      saveCredential: handleCursorSave,
      addAccount: (token: string) => handleCursorSave({ token }),
      remove: handleCursorLogout,
      setEnabled: handleCursorSetEnabled,
      refresh: () => window.tokenMonitor?.cursor?.status?.().then((s: any) => setCursorStatus(s || null)),
    },
  });

  // 5. Antigravity
  providers.push({
    providerId: 'antigravity',
    label: 'Google Antigravity',
    icon: 'antigravity',
    authKind: 'oauth',
    status: antigravityLoggingIn ? 'pending' : antigravityAccounts.length > 0 ? 'connected' : 'notConfigured',
    accounts: antigravityAccounts.map((acc) => ({
      id: acc.id,
      label: resolveAccountLabel(acc, maskEmails),
      enabled: acc.enabled !== false,
      isActive: (acc as any).isActive ?? acc.isDefault,
    })),
    pendingDetail: antigravityLoggingIn ? { message: 'Waiting for Google authentication in browser...' } : null,
    actions: {
      signIn: handleAntigravitySignIn,
      addAccount: handleAntigravitySignIn,
      cancel: handleAntigravityCancel,
      remove: handleAntigravityRemove,
      setEnabled: handleAntigravitySetEnabled,
      refresh: () => window.tokenMonitor?.antigravity?.accounts?.().then((accs: any) => setAntigravityAccounts(accs || [])),
    },
  });

  // 6. Cline
  const isClineConfigured = Boolean(
    settings.clineCredentialConfigured ||
    settings.clineApiKeyConfigured ||
    settings.clineApiKey === 'set'
  );
  providers.push({
    providerId: 'cline',
    label: 'Cline',
    icon: 'cline',
    authKind: 'apiKey',
    status: isClineConfigured ? 'connected' : 'notConfigured',
    accounts: isClineConfigured
      ? [{ id: 'cline', label: 'Cline API Key', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('cline'),
      remove: handleGenericClear('cline'),
    },
  });

  // 7. Factory Droid
  const isFactoryConfigured = Boolean(
    settings.factoryCredentialConfigured ||
    settings.factoryApiKeyConfigured ||
    settings.factoryApiKey === 'set'
  );
  providers.push({
    providerId: 'factory',
    label: 'Factory Droid',
    icon: 'factory',
    authKind: 'apiKey',
    status: isFactoryConfigured ? 'connected' : 'notConfigured',
    accounts: isFactoryConfigured
      ? [{ id: 'factory', label: 'Factory API Key', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('factory'),
      remove: handleGenericClear('factory'),
    },
  });

  // 8. Kimi
  const isKimiConfigured = Boolean(
    settings.kimiCredentialConfigured ||
    settings.kimiApiKeyConfigured ||
    settings.kimiWebAccessTokenConfigured ||
    settings.kimiApiKey === 'set' ||
    settings.kimiWebAccessToken === 'set'
  );
  providers.push({
    providerId: 'kimi',
    label: 'Kimi',
    icon: 'kimi',
    authKind: 'apiKey',
    status: isKimiConfigured ? 'connected' : 'notConfigured',
    accounts: isKimiConfigured
      ? [
          {
            id: 'kimi',
            label: settings.kimiApiKeyConfigured ? 'Kimi Code API' : 'Kimi Web Session',
            enabled: true,
            isActive: true,
          },
        ]
      : [],
    actions: {
      saveCredential: handleKimiSave,
      remove: handleKimiClear,
    },
  });

  // 9. Grok
  const isGrokConfigured = Boolean(
    settings.grokConfigured ||
    settings.grokAutoDetected
  );
  providers.push({
    providerId: 'grok',
    label: 'Grok',
    icon: 'grok',
    authKind: 'local',
    status: isGrokConfigured ? 'connected' : 'notConfigured',
    accounts: isGrokConfigured
      ? [{ id: 'grok', label: 'Grok Local CLI', enabled: true, isActive: true }]
      : [],
    actions: {},
  });

  // 10. Copilot
  const isCopilotConfigured = Boolean(
    settings.copilotApiTokenConfigured ||
    settings.copilotTokenConfigured ||
    settings.copilotConfigured ||
    settings.copilotToken === 'set'
  );
  providers.push({
    providerId: 'copilot',
    label: 'GitHub Copilot',
    icon: 'copilot',
    authKind: 'deviceCode',
    status: copilotSigningIn ? 'pending' : isCopilotConfigured ? 'connected' : 'notConfigured',
    accounts: isCopilotConfigured
      ? [
          {
            id: 'copilot',
            label: 'GitHub Copilot Account',
            enabled: true,
            isActive: true,
          },
        ]
      : [],
    pendingDetail: copilotSigningIn
      ? {
          message: 'Authorizing GitHub Copilot via device code...',
          deviceCode: copilotDeviceCode,
        }
      : null,
    actions: {
      signIn: handleCopilotSignIn,
      cancel: handleCopilotCancel,
      saveCredential: handleCopilotSave,
      remove: handleCopilotClear,
    },
  });

  // 11. Zed
  const isZedConfigured = Boolean(
    settings.zedCookieConfigured ||
    settings.zedCookie === 'set'
  );
  providers.push({
    providerId: 'zed',
    label: 'Zed',
    icon: 'zed',
    authKind: 'cookie',
    status: isZedConfigured ? 'connected' : 'notConfigured',
    accounts: isZedConfigured
      ? [{ id: 'zed', label: 'Zed Web Session', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('zed'),
      remove: handleGenericClear('zed'),
    },
  });

  // 12. Command Code
  const isCommandCodeConfigured = Boolean(
    settings.commandcodeCookieConfigured ||
    settings.commandcodeCookie === 'set'
  );
  providers.push({
    providerId: 'commandcode',
    label: 'Command Code',
    icon: 'commandcode',
    authKind: 'cookie',
    status: isCommandCodeConfigured ? 'connected' : 'notConfigured',
    accounts: isCommandCodeConfigured
      ? [{ id: 'commandcode', label: 'Command Code Session', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('commandcode'),
      remove: handleGenericClear('commandcode'),
    },
  });

  // 13. MiMo
  providers.push({
    providerId: 'mimo',
    label: 'Xiaomi MiMo',
    icon: 'mimo',
    authKind: 'cookie',
    status: mimoAccounts.length > 0 ? 'connected' : 'notConfigured',
    accounts: mimoAccounts.map((acc) => ({
      id: acc.id,
      label: resolveAccountLabel(acc, maskEmails),
      enabled: acc.enabled !== false,
      isActive: (acc as any).isActive ?? acc.isDefault,
    })),
    actions: {
      saveCredential: handleMimoSave,
      addAccount: (cookie: string) => handleMimoSave({ cookie }),
      remove: handleMimoRemove,
      setEnabled: handleMimoSetEnabled,
      refresh: () => window.tokenMonitor?.mimo?.accounts?.().then((accs: any) => setMimoAccounts(accs || [])),
    },
  });

  // 14. Z.ai / GLM
  const isZaiConfigured = Boolean(
    settings.zaiApiKeyConfigured ||
    settings.zaiApiKey === 'set'
  );
  providers.push({
    providerId: 'zai',
    label: 'Z.ai / GLM',
    icon: 'zai',
    authKind: 'apiKey',
    status: isZaiConfigured ? 'connected' : 'notConfigured',
    accounts: isZaiConfigured
      ? [{ id: 'zai', label: 'Z.ai Coding Plan', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('zai'),
      remove: handleGenericClear('zai'),
    },
  });

  // 15. GLM Team
  const isZaiTeamConfigured = Boolean(
    settings.zaiTeamApiKeyConfigured ||
    settings.zaiTeamApiKey === 'set'
  );
  providers.push({
    providerId: 'zaiteam',
    label: 'GLM Team',
    icon: 'zaiteam',
    authKind: 'apiKey',
    status: isZaiTeamConfigured ? 'connected' : 'notConfigured',
    accounts: isZaiTeamConfigured
      ? [{ id: 'zaiteam', label: 'GLM Team Plan', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('zaiteam'),
      remove: handleGenericClear('zaiteam'),
    },
  });

  // 16. Kiro
  const isKiroConfigured = Boolean(
    settings.kiroConfigured ||
    settings.kiroAutoDetected
  );
  providers.push({
    providerId: 'kiro',
    label: 'Kiro',
    icon: 'kiro',
    authKind: 'local',
    status: isKiroConfigured ? 'connected' : 'notConfigured',
    accounts: isKiroConfigured
      ? [{ id: 'kiro', label: 'Kiro CLI Session', enabled: true, isActive: true }]
      : [],
    actions: {},
  });

  // 17. WorkBuddy
  providers.push({
    providerId: 'workbuddy',
    label: 'WorkBuddy',
    icon: 'workbuddy',
    authKind: 'oauth',
    status: workbuddyLoggingIn !== null ? 'pending' : workbuddyAccounts.length > 0 ? 'connected' : 'notConfigured',
    accounts: workbuddyAccounts.map((acc: any) => ({
      id: acc.id,
      label: `${acc.realm ? `[${acc.realm.toUpperCase()}] ` : ''}${resolveAccountLabel(acc, maskEmails)}`,
      enabled: acc.enabled !== false,
      isActive: (acc as any).isActive ?? acc.isDefault,
      realm: acc.realm,
    })),
    pendingDetail: workbuddyLoggingIn !== null
      ? { message: workbuddyStatusMessage || `Opening WorkBuddy ${workbuddyLoggingIn.toUpperCase()} authentication...` }
      : null,
    actions: {
      signIn: handleWorkBuddySignIn,
      addAccount: handleWorkBuddySignIn,
      cancel: handleWorkBuddyCancel,
      remove: handleWorkBuddyRemove,
      setEnabled: handleWorkBuddySetEnabled,
      refresh: () => window.tokenMonitor?.workbuddy?.accounts?.().then((accs: any) => setWorkbuddyAccounts(accs || [])),
    },
  });

  // 18. Qoder
  const isQoderConfigured = Boolean(
    settings.qoderCookieConfigured ||
    settings.qoderCookie === 'set' ||
    settings.qoderAutoDetected
  );
  providers.push({
    providerId: 'qoder',
    label: 'Qoder',
    icon: 'qoder',
    authKind: 'cookie',
    status: isQoderConfigured ? 'connected' : 'notConfigured',
    accounts: isQoderConfigured
      ? [
          {
            id: 'qoder',
            label: settings.qoderSite === 'cn' ? 'Qoder (CN)' : 'Qoder (Global)',
            enabled: true,
            isActive: true,
          },
        ]
      : [],
    actions: {
      saveCredential: handleGenericSave('qoder'),
      remove: handleGenericClear('qoder'),
    },
  });

  // 19. DeepSeek
  const isDeepSeekConfigured = Boolean(
    settings.deepseekApiKeyConfigured ||
    settings.deepseekApiKey === 'set'
  );
  providers.push({
    providerId: 'deepseek',
    label: 'DeepSeek',
    icon: 'deepseek',
    authKind: 'apiKey',
    status: isDeepSeekConfigured ? 'connected' : 'notConfigured',
    accounts: isDeepSeekConfigured
      ? [
          {
            id: 'deepseek',
            label: 'DeepSeek API Key',
            enabled: true,
            isActive: true,
          },
        ]
      : [],
    actions: {
      saveCredential: handleDeepSeekSave,
      remove: handleDeepSeekClear,
    },
  });

  // 20. Devin
  const isDevinConfigured = Boolean(
    settings.devinBearerTokenConfigured ||
    settings.devinBearerToken === 'set'
  );
  providers.push({
    providerId: 'devin',
    label: 'Devin',
    icon: 'devin',
    authKind: 'token',
    status: isDevinConfigured ? 'connected' : 'notConfigured',
    accounts: isDevinConfigured
      ? [
          {
            id: 'devin',
            label: settings.devinOrganization ? `Devin (${settings.devinOrganization})` : 'Devin Session',
            enabled: true,
            isActive: true,
          },
        ]
      : [],
    actions: {
      saveCredential: handleGenericSave('devin'),
      remove: handleGenericClear('devin'),
    },
  });

  // 21. MiniMax
  const isMinimaxConfigured = Boolean(
    settings.minimaxApiKeyConfigured ||
    settings.minimaxApiKey === 'set'
  );
  providers.push({
    providerId: 'minimax',
    label: 'MiniMax',
    icon: 'minimax',
    authKind: 'apiKey',
    status: isMinimaxConfigured ? 'connected' : 'notConfigured',
    accounts: isMinimaxConfigured
      ? [
          {
            id: 'minimax',
            label: settings.minimaxBillingMode === 'api' ? 'MiniMax API Plan' : 'MiniMax Token Plan',
            enabled: true,
            isActive: true,
          },
        ]
      : [],
    actions: {
      saveCredential: handleMiniMaxSave,
      remove: handleMiniMaxClear,
    },
  });

  // 22. TypeSafe
  const isTypesafeConfigured = Boolean(
    settings.typesafeCookieConfigured ||
    settings.typesafeCookie === 'set'
  );
  providers.push({
    providerId: 'typesafe',
    label: 'TypeSafe',
    icon: 'typesafe',
    authKind: 'cookie',
    status: isTypesafeConfigured ? 'connected' : 'notConfigured',
    accounts: isTypesafeConfigured
      ? [{ id: 'typesafe', label: 'TypeSafe Web Session', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('typesafe'),
      remove: handleGenericClear('typesafe'),
    },
  });

  // 23. OpenRouter
  const openrouterAccountsList: AccountItem[] = Object.entries(openrouterProfiles).map(([name, prof]) => ({
    id: name,
    label: name,
    enabled: prof.enabled !== false,
    isActive: prof.isActive,
  }));
  providers.push({
    providerId: 'openrouter',
    label: 'OpenRouter',
    icon: 'openrouter',
    authKind: 'apiKey',
    status: openrouterAccountsList.length > 0 ? 'connected' : 'notConfigured',
    accounts: openrouterAccountsList,
    actions: {
      saveCredential: handleOpenrouterSave,
      addAccount: handleOpenrouterSave,
      remove: handleOpenrouterDelete,
      setEnabled: handleOpenrouterSetEnabled,
      refresh: () => window.tokenMonitor?.openrouter?.getProfiles?.().then((p: any) => setOpenrouterProfiles(extractProfilesMap(p))),
    },
  });

  // 24. Volcengine Ark
  const isVolcengineConfigured = Boolean(
    settings.volcengineCredentialsConfigured ||
    settings.volcengineAccessKeyIdConfigured ||
    settings.volcengineAccessKeyId === 'set'
  );
  providers.push({
    providerId: 'volcengine',
    label: 'Volcengine Ark',
    icon: 'volcengine',
    authKind: 'apiKey',
    status: isVolcengineConfigured ? 'connected' : 'notConfigured',
    accounts: isVolcengineConfigured
      ? [
          {
            id: 'volcengine',
            label: settings.volcengineRegion ? `Volcengine (${settings.volcengineRegion})` : 'Volcengine Ark',
            enabled: true,
            isActive: true,
          },
        ]
      : [],
    actions: {
      saveCredential: handleVolcengineSave,
      remove: handleVolcengineClear,
    },
  });

  // 25. Ollama
  const isOllamaConfigured = Boolean(
    settings.ollamaCookieConfigured ||
    settings.ollamaCookie === 'set'
  );
  providers.push({
    providerId: 'ollama',
    label: 'Ollama',
    icon: 'ollama',
    authKind: 'cookie',
    status: isOllamaConfigured ? 'connected' : 'notConfigured',
    accounts: isOllamaConfigured
      ? [{ id: 'ollama', label: 'Ollama Web Session', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('ollama'),
      remove: handleGenericClear('ollama'),
    },
  });

  // 26. Trae CN
  const isTraeConfigured = Boolean(
    settings.traeAccessTokenConfigured ||
    settings.traeAccessToken === 'set'
  );
  providers.push({
    providerId: 'trae',
    label: 'Trae CN',
    icon: 'trae',
    authKind: 'token',
    status: isTraeConfigured ? 'connected' : 'notConfigured',
    accounts: isTraeConfigured
      ? [{ id: 'trae', label: 'Trae CN Session', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('trae'),
      remove: handleGenericClear('trae'),
    },
  });

  // 27. Alibaba Cloud
  const isAlibabaConfigured = Boolean(
    settings.alibabaCookieConfigured ||
    settings.alibabaCookie === 'set'
  );
  providers.push({
    providerId: 'alibaba',
    label: 'Alibaba Cloud',
    icon: 'alibaba',
    authKind: 'cookie',
    status: isAlibabaConfigured ? 'connected' : 'notConfigured',
    accounts: isAlibabaConfigured
      ? [{ id: 'alibaba', label: 'Alibaba Cloud Token Plan', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('alibaba'),
      remove: handleGenericClear('alibaba'),
    },
  });

  // 28. StepFun
  const isStepfunConfigured = Boolean(
    settings.stepfunTokenConfigured ||
    settings.stepfunToken === 'set'
  );
  providers.push({
    providerId: 'stepfun',
    label: 'StepFun',
    icon: 'stepfun',
    authKind: 'token',
    status: isStepfunConfigured ? 'connected' : 'notConfigured',
    accounts: isStepfunConfigured
      ? [{ id: 'stepfun', label: 'StepFun Session', enabled: true, isActive: true }]
      : [],
    actions: {
      saveCredential: handleGenericSave('stepfun'),
      remove: handleGenericClear('stepfun'),
    },
  });

  // 29. Notion AI
  const isNotionConfigured = Boolean(
    settings.notionCookieConfigured ||
    settings.notionCookie === 'set' ||
    settings.notionWorkspaceId
  );
  providers.push({
    providerId: 'notion',
    label: 'Notion AI',
    icon: 'notion',
    authKind: 'cookie',
    status: isNotionConfigured ? 'connected' : 'notConfigured',
    accounts: isNotionConfigured
      ? [
          {
            id: 'notion',
            label: maskEmailIfNeeded(settings.notionWorkspaceId || 'Notion Workspace', maskEmails) || 'Notion Workspace',
            enabled: true,
            isActive: true,
          },
        ]
      : [],
    actions: {
      saveCredential: handleNotionSave,
      remove: handleNotionClear,
    },
  });

  // 30. Third-party Endpoints
  const thirdpartyAccountsList: AccountItem[] = Object.entries(thirdpartyProfiles).map(([name, prof]) => ({
    id: name,
    label: `${name}${prof.baseUrl ? ` (${prof.baseUrl})` : ''}`,
    enabled: prof.enabled !== false,
    isActive: prof.isActive,
  }));
  providers.push({
    providerId: 'thirdparty',
    label: 'Third-party Endpoints',
    icon: 'thirdparty',
    authKind: 'apiKey',
    status: thirdpartyAccountsList.length > 0 ? 'connected' : 'notConfigured',
    accounts: thirdpartyAccountsList,
    actions: {
      saveCredential: handleThirdpartySave,
      addAccount: handleThirdpartySave,
      remove: handleThirdpartyDelete,
      setEnabled: handleThirdpartySetEnabled,
      refresh: () => window.tokenMonitor?.thirdparty?.getProfiles?.().then((p: any) => setThirdpartyProfiles(extractProfilesMap(p))),
    },
  });

  return providers;
}
