import React, { useState, useEffect } from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { selectClass } from './GeneralSettings';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import type { TokenMonitorSettingsState, ManagedAccount } from './types';
import { maskEmailIfNeeded } from '../adapters/presentationState';

function accountLabel(account: { email?: string; name?: string; id?: string }, maskEmails: boolean): string {
  return maskEmailIfNeeded(account.email || account.name || account.id, maskEmails) || account.id || '';
}

interface LimitsSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

export function LimitsSettings({ settings, updateSettings, refreshSettings }: LimitsSettingsProps) {
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

  // Notion state
  const [notionCookie, setNotionCookie] = useState('');
  const [notionWorkspaceId, setNotionWorkspaceId] = useState(settings.notionWorkspaceId || '');
  const [notionSaving, setNotionSaving] = useState(false);
  const [notionMessage, setNotionMessage] = useState<string | null>(null);

  // MiniMax state
  const [minimaxBillingMode, setMinimaxBillingMode] = useState<'token-plan' | 'api'>(
    (settings.minimaxBillingMode as 'token-plan' | 'api') || 'token-plan'
  );
  const [minimaxApiRegion, setMinimaxApiRegion] = useState<'auto' | 'cn' | 'intl'>(
    (settings.minimaxApiRegion as 'auto' | 'cn' | 'intl') || 'auto'
  );
  const [minimaxApiKey, setMinimaxApiKey] = useState('');
  const [minimaxSaving, setMinimaxSaving] = useState(false);
  const [minimaxMessage, setMinimaxMessage] = useState<string | null>(null);

  // Copilot state
  const [copilotSigningIn, setCopilotSigningIn] = useState(false);
  const [copilotDeviceCode, setCopilotDeviceCode] = useState<{ userCode?: string; verificationUri?: string } | null>(null);
  const [copilotManualToken, setCopilotManualToken] = useState('');

  // Claude Web state
  const [claudeOrganizations, setClaudeOrganizations] = useState<Array<{ id: string; name?: string }>>([]);
  const [claudeOrgId, setClaudeOrgId] = useState(settings.claudeWebOrganizationId || '');
  const [claudeOrgStatus, setClaudeOrgStatus] = useState<string | null>(null);

  // Cursor state
  const [cursorManualToken, setCursorManualToken] = useState('');
  const [cursorStatus, setCursorStatus] = useState<any>(null);

  // MiMo state
  const [mimoAccounts, setMimoAccounts] = useState<ManagedAccount[]>([]);
  const [mimoCookieInput, setMimoCookieInput] = useState('');

  // OpenCode state
  const [opencodeProfiles, setOpencodeProfiles] = useState<Record<string, any>>({});
  const [opencodeNewName, setOpencodeNewName] = useState('');
  const [opencodeNewKey, setOpencodeNewKey] = useState('');
  const [opencodeCookieInput, setOpencodeCookieInput] = useState('');

  // OpenRouter state
  const [openrouterProfiles, setOpenrouterProfiles] = useState<Record<string, any>>({});
  const [openrouterNewName, setOpenrouterNewName] = useState('');
  const [openrouterNewKey, setOpenrouterNewKey] = useState('');

  // Third-party state
  const [thirdpartyProfiles, setThirdpartyProfiles] = useState<Record<string, any>>({});
  const [tpName, setTpName] = useState('');
  const [tpBaseUrl, setTpBaseUrl] = useState('');
  const [tpApiKey, setTpApiKey] = useState('');

  // Load account lists on mount
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
      tm.opencode.getProfiles().then((p: any) => setOpencodeProfiles(p || {})).catch(() => {});
    }
    if (tm.openrouter?.getProfiles) {
      tm.openrouter.getProfiles().then((p: any) => setOpenrouterProfiles(p || {})).catch(() => {});
    }
    if (tm.thirdparty?.getProfiles) {
      tm.thirdparty.getProfiles().then((p: any) => setThirdpartyProfiles(p || {})).catch(() => {});
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
        refreshSettings();
      } else if (status?.status === 'error' || status?.status === 'cancelled') {
        setCopilotSigningIn(false);
        setCopilotDeviceCode(null);
      }
    });

    const unsubWorkbuddy = tm.workbuddy?.onAccounts?.((accs: any) => {
      setWorkbuddyAccounts(Array.isArray(accs) ? accs : []);
      setWorkbuddyLoggingIn(null);
    });

    return () => {
      unsubCodex?.();
      unsubCopilot?.();
      unsubWorkbuddy?.();
    };
  }, [refreshSettings]);

  // Codex actions
  const handleCodexAdd = async () => {
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
  };

  const handleCodexCancel = async () => {
    if (window.tokenMonitor?.codex?.cancelLogin) {
      await window.tokenMonitor.codex.cancelLogin();
    }
    setCodexLoggingIn(false);
    setCodexStatusMessage(null);
  };

  const handleCodexRemove = async (id: string) => {
    if (window.tokenMonitor?.codex?.removeAccount) {
      await window.tokenMonitor.codex.removeAccount(id);
      const accs = await window.tokenMonitor.codex.accounts();
      setCodexAccounts(accs || []);
    }
  };

  const handleCodexToggle = async (id: string, enabled: boolean) => {
    if (window.tokenMonitor?.codex?.setAccountEnabled) {
      await window.tokenMonitor.codex.setAccountEnabled(id, enabled);
      const accs = await window.tokenMonitor.codex.accounts();
      setCodexAccounts(accs || []);
    }
  };

  // Antigravity actions
  const handleAntigravityAdd = async () => {
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
  };

  const handleAntigravityCancel = async () => {
    if (window.tokenMonitor?.antigravity?.cancelLogin) {
      await window.tokenMonitor.antigravity.cancelLogin();
    }
    setAntigravityLoggingIn(false);
  };

  const handleAntigravityRemove = async (id: string) => {
    if (window.tokenMonitor?.antigravity?.removeAccount) {
      await window.tokenMonitor.antigravity.removeAccount(id);
      const accs = await window.tokenMonitor.antigravity.accounts();
      setAntigravityAccounts(accs || []);
    }
  };

  const handleAntigravityToggle = async (id: string, enabled: boolean) => {
    if (window.tokenMonitor?.antigravity?.setAccountEnabled) {
      await window.tokenMonitor.antigravity.setAccountEnabled(id, enabled);
      const accs = await window.tokenMonitor.antigravity.accounts();
      setAntigravityAccounts(accs || []);
    }
  };

  // WorkBuddy actions
  const handleWorkBuddyAdd = async (realm: 'cn' | 'ai') => {
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
  };

  const handleWorkBuddyCancel = async () => {
    if (window.tokenMonitor?.workbuddy?.cancelLogin) {
      await window.tokenMonitor.workbuddy.cancelLogin();
    }
    setWorkbuddyLoggingIn(null);
    setWorkbuddyStatusMessage(null);
  };

  const handleWorkBuddyRemove = async (id: string) => {
    if (window.tokenMonitor?.workbuddy?.removeAccount) {
      await window.tokenMonitor.workbuddy.removeAccount(id);
      const accs = await window.tokenMonitor.workbuddy.accounts();
      setWorkbuddyAccounts(accs || []);
    }
  };

  const handleWorkBuddyToggle = async (id: string, enabled: boolean) => {
    if (window.tokenMonitor?.workbuddy?.setAccountEnabled) {
      await window.tokenMonitor.workbuddy.setAccountEnabled(id, enabled);
      const accs = await window.tokenMonitor.workbuddy.accounts();
      setWorkbuddyAccounts(accs || []);
    }
  };

  // Notion actions
  const handleNotionSave = async () => {
    if (!notionWorkspaceId.trim()) {
      setNotionMessage('Workspace ID is required.');
      return;
    }
    setNotionSaving(true);
    setNotionMessage(null);
    try {
      if (window.tokenMonitor?.limits?.saveCredential) {
        const payload: Record<string, string> = { notionWorkspaceId: notionWorkspaceId.trim() };
        if (notionCookie.trim()) {
          payload.notionCookie = notionCookie.trim();
        }
        await window.tokenMonitor.limits.saveCredential('notion', payload);
        setNotionMessage('Notion credentials saved.');
        setNotionCookie('');
        await refreshSettings();
      }
    } catch (err: any) {
      setNotionMessage(err?.message || 'Failed to save Notion credentials.');
    } finally {
      setNotionSaving(false);
    }
  };

  const handleNotionClear = async () => {
    if (window.tokenMonitor?.limits?.clearCredential) {
      await window.tokenMonitor.limits.clearCredential('notion');
      setNotionMessage('Notion credentials cleared.');
      setNotionCookie('');
      await refreshSettings();
    }
  };

  const handleNotionOpen = () => {
    window.tokenMonitor?.openExternal?.('https://app.notion.com/');
  };

  // MiniMax actions
  const handleMiniMaxBillingModeChange = async (mode: 'token-plan' | 'api') => {
    setMinimaxBillingMode(mode);
    const patch = { minimaxBillingMode: mode };
    await updateSettings(patch as any);
  };

  const handleMiniMaxRegionChange = async (region: 'auto' | 'cn' | 'intl') => {
    setMinimaxApiRegion(region);
    const patch = { minimaxApiRegion: region };
    await updateSettings(patch as any);
  };

  const handleMiniMaxSave = async () => {
    if (!minimaxApiKey.trim()) {
      setMinimaxMessage('API key is required.');
      return;
    }
    setMinimaxSaving(true);
    setMinimaxMessage(null);
    try {
      if (window.tokenMonitor?.limits?.saveCredential) {
        await window.tokenMonitor.limits.saveCredential('minimax', {
          minimaxApiKey: minimaxApiKey.trim(),
          minimaxBillingMode,
          minimaxApiRegion,
        });
        setMinimaxMessage('MiniMax credentials saved.');
        setMinimaxApiKey('');
        await refreshSettings();
      }
    } catch (err: any) {
      setMinimaxMessage(err?.message || 'Failed to save MiniMax credentials.');
    } finally {
      setMinimaxSaving(false);
    }
  };

  const handleMiniMaxClear = async () => {
    if (window.tokenMonitor?.limits?.clearCredential) {
      await window.tokenMonitor.limits.clearCredential('minimax');
      setMinimaxMessage('MiniMax credentials cleared.');
      setMinimaxApiKey('');
      await refreshSettings();
    }
  };

  const handleMiniMaxOpen = () => {
    const url =
      minimaxBillingMode === 'api'
        ? 'https://platform.minimaxi.com/user-center/payment/balance'
        : 'https://platform.minimaxi.com/user-center/payment/token-plan';
    window.tokenMonitor?.openExternal?.(url);
  };

  // Claude actions
  const handleLoadClaudeOrganizations = async () => {
    if (!window.tokenMonitor?.limits?.listOrganizationChoices) return;
    setClaudeOrgStatus('Loading organizations...');
    const result = await window.tokenMonitor.limits.listOrganizationChoices('claude');
    const choices = Array.isArray(result) ? result : result?.choices;
    setClaudeOrganizations(choices || []);
    setClaudeOrgStatus(choices?.length ? null : 'No organizations available. Sign in to Claude first.');
  };

  const handleSaveClaudeOrgId = async () => {
    if (!claudeOrgId.trim() || !window.tokenMonitor?.limits?.saveCredential) return;
    await window.tokenMonitor.limits.saveCredential('claude', { claudeWebOrganizationId: claudeOrgId.trim() });
    setClaudeOrgStatus('Organization saved.');
    await refreshSettings();
  };

  // Copilot actions
  const handleCopilotSignIn = async () => {
    setCopilotSigningIn(true);
    try {
      if (window.tokenMonitor?.copilot?.signIn) {
        await window.tokenMonitor.copilot.signIn();
      }
    } catch {
      setCopilotSigningIn(false);
    }
  };

  const handleCopilotCancel = async () => {
    if (window.tokenMonitor?.copilot?.cancelSignIn) {
      await window.tokenMonitor.copilot.cancelSignIn();
    }
    setCopilotSigningIn(false);
    setCopilotDeviceCode(null);
  };

  const handleCopilotSaveManual = async () => {
    if (!copilotManualToken.trim()) return;
    if (window.tokenMonitor?.limits?.saveCredential) {
      await window.tokenMonitor.limits.saveCredential('copilot', { token: copilotManualToken.trim() });
    }
    setCopilotManualToken('');
    refreshSettings();
  };

  // Cursor actions
  const handleCursorSaveManual = async () => {
    if (!cursorManualToken.trim()) return;
    if (window.tokenMonitor?.cursor?.loginManual) {
      await window.tokenMonitor.cursor.loginManual(cursorManualToken.trim());
      setCursorManualToken('');
      const s = await window.tokenMonitor.cursor.status();
      setCursorStatus(s);
    }
  };

  const handleCursorLogout = async (id: string) => {
    if (window.tokenMonitor?.cursor?.logout) {
      await window.tokenMonitor.cursor.logout(id);
      const s = await window.tokenMonitor.cursor.status();
      setCursorStatus(s);
    }
  };

  // MiMo actions
  const handleMimoAdd = async () => {
    if (!mimoCookieInput.trim()) return;
    if (window.tokenMonitor?.mimo?.addAccount) {
      await window.tokenMonitor.mimo.addAccount(mimoCookieInput.trim());
      setMimoCookieInput('');
      const accs = await window.tokenMonitor.mimo.accounts();
      setMimoAccounts(accs || []);
    }
  };

  const handleMimoRemove = async (id: string) => {
    if (window.tokenMonitor?.mimo?.removeAccount) {
      await window.tokenMonitor.mimo.removeAccount(id);
      const accs = await window.tokenMonitor.mimo.accounts();
      setMimoAccounts(accs || []);
    }
  };

  const handleMimoToggle = async (id: string, enabled: boolean) => {
    if (window.tokenMonitor?.mimo?.setAccountEnabled) {
      await window.tokenMonitor.mimo.setAccountEnabled(id, enabled);
      const accs = await window.tokenMonitor.mimo.accounts();
      setMimoAccounts(accs || []);
    }
  };

  // OpenCode actions
  const handleOpencodeAddProfile = async () => {
    if (!opencodeNewName.trim()) return;
    if (window.tokenMonitor?.opencode?.saveProfile) {
      await window.tokenMonitor.opencode.saveProfile(opencodeNewName.trim(), opencodeNewKey.trim(), 'api', {});
      setOpencodeNewName('');
      setOpencodeNewKey('');
      const p = await window.tokenMonitor.opencode.getProfiles();
      setOpencodeProfiles(p || {});
    }
  };

  const handleOpencodeSaveCookie = async () => {
    if (!opencodeCookieInput.trim()) return;
    if (window.tokenMonitor?.opencode?.saveCookie) {
      await window.tokenMonitor.opencode.saveCookie(opencodeCookieInput.trim());
      setOpencodeCookieInput('');
      const p = await window.tokenMonitor.opencode.getProfiles();
      setOpencodeProfiles(p || {});
    }
  };

  const handleOpencodeDeleteProfile = async (name: string) => {
    if (window.tokenMonitor?.opencode?.deleteProfile) {
      await window.tokenMonitor.opencode.deleteProfile(name);
      const p = await window.tokenMonitor.opencode.getProfiles();
      setOpencodeProfiles(p || {});
    }
  };

  const handleOpencodeToggle = async (name: string, enabled: boolean) => {
    if (window.tokenMonitor?.opencode?.setProfileEnabled) {
      await window.tokenMonitor.opencode.setProfileEnabled(name, enabled);
      const p = await window.tokenMonitor.opencode.getProfiles();
      setOpencodeProfiles(p || {});
    }
  };

  // OpenRouter actions
  const handleOpenrouterAddProfile = async () => {
    if (!openrouterNewName.trim() || !openrouterNewKey.trim()) return;
    if (window.tokenMonitor?.openrouter?.saveProfile) {
      await window.tokenMonitor.openrouter.saveProfile(openrouterNewName.trim(), openrouterNewKey.trim());
      setOpenrouterNewName('');
      setOpenrouterNewKey('');
      const p = await window.tokenMonitor.openrouter.getProfiles();
      setOpenrouterProfiles(p || {});
    }
  };

  const handleOpenrouterDeleteProfile = async (name: string) => {
    if (window.tokenMonitor?.openrouter?.deleteProfile) {
      await window.tokenMonitor.openrouter.deleteProfile(name);
      const p = await window.tokenMonitor.openrouter.getProfiles();
      setOpenrouterProfiles(p || {});
    }
  };

  const handleOpenrouterToggle = async (name: string, enabled: boolean) => {
    if (window.tokenMonitor?.openrouter?.setProfileEnabled) {
      await window.tokenMonitor.openrouter.setProfileEnabled(name, enabled);
      const p = await window.tokenMonitor.openrouter.getProfiles();
      setOpenrouterProfiles(p || {});
    }
  };

  // Thirdparty actions
  const handleTpAddProfile = async () => {
    if (!tpName.trim() || !tpBaseUrl.trim()) return;
    if (window.tokenMonitor?.thirdparty?.saveProfile) {
      await window.tokenMonitor.thirdparty.saveProfile({
        name: tpName.trim(),
        baseUrl: tpBaseUrl.trim(),
        apiKey: tpApiKey.trim(),
        mode: 'token',
        enabled: true,
      });
      setTpName('');
      setTpBaseUrl('');
      setTpApiKey('');
      const p = await window.tokenMonitor.thirdparty.getProfiles();
      setThirdpartyProfiles(p || {});
    }
  };

  const handleTpDeleteProfile = async (name: string) => {
    if (window.tokenMonitor?.thirdparty?.deleteProfile) {
      await window.tokenMonitor.thirdparty.deleteProfile(name);
      const p = await window.tokenMonitor.thirdparty.getProfiles();
      setThirdpartyProfiles(p || {});
    }
  };

  const handleTpToggle = async (name: string, enabled: boolean) => {
    if (window.tokenMonitor?.thirdparty?.setProfileEnabled) {
      await window.tokenMonitor.thirdparty.setProfileEnabled(name, enabled);
      const p = await window.tokenMonitor.thirdparty.getProfiles();
      setThirdpartyProfiles(p || {});
    }
  };

  return (
    <div className="space-y-6">
      {/* Quota Display & Privacy */}
      <SettingSection title="Quota Display & Privacy" description="Remaining capacity visualization and display privacy.">
        <SettingRow
          title="Show Quota Source"
          description="Display badge indicating whether data comes from local config, session, or cloud API."
          control={
            <Switch
              checked={Boolean(settings.showLimitSource)}
              onCheckedChange={(checked) => updateSettings({ showLimitSource: checked })}
            />
          }
        />

        <SettingRow
          title="Mask Account Emails"
          description="Obscure email addresses and organization IDs in quota headers."
          control={
            <Switch
              checked={settings.maskLimitAccountEmails === true}
              onCheckedChange={(checked) => updateSettings({ maskLimitAccountEmails: checked })}
            />
          }
        />

        <SettingRow
          title="Quota Progress Bar Mode"
          description="Show used percentage or remaining capacity."
          control={
            <select
              value={settings.showLimitUsed || 'remaining'}
              onChange={(e) => updateSettings({ showLimitUsed: e.target.value as any })}
              className={selectClass}
            >
              <option value="remaining">Remaining Quota Available</option>
              <option value="used">Used Quota Consumed</option>
            </select>
          }
        />

        {settings.limitProviderOrder && (
          <SettingRow
            title="Provider Order"
            description="Custom sequence for AI limit providers."
            control={
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => updateSettings({ limitProviderOrder: '', limitProviderHiddenItems: '' })}
              >
                Reset provider order
              </Button>
            }
          />
        )}
      </SettingSection>

      {/* Anthropic / Claude Code */}
      <SettingSection title="Anthropic / Claude Code" description="Claude Code sign-in status and organization selection.">
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Claude account organization:</span>
            <Button size="sm" variant="outline" onClick={handleLoadClaudeOrganizations}>
              Refresh status
            </Button>
          </div>
          {claudeOrganizations.length > 0 && (
            <div className="flex gap-2">
              <select
                value={claudeOrgId}
                onChange={(e) => setClaudeOrgId(e.target.value)}
                className={`${selectClass} flex-1`}
              >
                <option value="">Choose an organization</option>
                {claudeOrganizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name || org.id}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={handleSaveClaudeOrgId}>
                Save organization
              </Button>
            </div>
          )}
          {claudeOrgStatus && <p className="text-xs text-muted-foreground">{claudeOrgStatus}</p>}
          <SettingRow
            title="Prepaid balance"
            description="Show Claude prepaid credit balance when available."
            control={
              <Switch
                checked={settings.claudePrepaidBalanceEnabled !== false}
                onCheckedChange={(checked) => updateSettings({ claudePrepaidBalanceEnabled: checked })}
              />
            }
          />
        </div>
      </SettingSection>

      {/* OpenAI Codex Accounts */}
      <SettingSection
        title="OpenAI Codex Accounts"
        description="OAuth browser sign-in for ChatGPT Plus/Team/Enterprise."
        headerAction={
          <div className="flex items-center gap-2">
            {codexLoggingIn && (
              <Button size="sm" variant="ghost" onClick={handleCodexCancel}>
                Cancel
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={codexLoggingIn} onClick={handleCodexAdd}>
              {codexLoggingIn ? <Spinner className="size-3.5 mr-1" /> : null}
              Add Account
            </Button>
          </div>
        }
      >
        <div className="p-3 space-y-2">
          {codexStatusMessage && <p className="text-xs text-amber-500">{codexStatusMessage}</p>}
          {codexAccounts.length > 0 ? (
            <div className="space-y-1.5">
              {codexAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <span className="font-medium text-foreground">{accountLabel(acc, maskEmails)}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      size="sm"
                      checked={acc.enabled !== false}
                      onCheckedChange={(checked) => handleCodexToggle(acc.id, checked)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-destructive hover:bg-destructive/10"
                      onClick={() => handleCodexRemove(acc.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No Codex accounts connected.</p>
          )}
        </div>
      </SettingSection>

      {/* Antigravity Accounts */}
      <SettingSection
        title="Antigravity Accounts"
        description="Google OAuth authentication for Antigravity quotas."
        headerAction={
          <div className="flex items-center gap-2">
            {antigravityLoggingIn && (
              <Button size="sm" variant="ghost" onClick={handleAntigravityCancel}>
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={antigravityLoggingIn}
              onClick={handleAntigravityAdd}
            >
              {antigravityLoggingIn ? <Spinner className="size-3.5 mr-1" /> : null}
              Add Account
            </Button>
          </div>
        }
      >
        <div className="p-3 space-y-2">
          {antigravityAccounts.length > 0 ? (
            <div className="space-y-1.5">
              {antigravityAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <span className="font-medium text-foreground">{accountLabel(acc, maskEmails)}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      size="sm"
                      checked={acc.enabled !== false}
                      onCheckedChange={(checked) => handleAntigravityToggle(acc.id, checked)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-destructive hover:bg-destructive/10"
                      onClick={() => handleAntigravityRemove(acc.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No Antigravity accounts connected.</p>
          )}
        </div>
      </SettingSection>

      {/* WorkBuddy Managed Accounts */}
      <SettingSection
        title="WorkBuddy Accounts"
        description="Connect WorkBuddy China (CN) or International (AI) accounts."
        headerAction={
          <div className="flex items-center gap-2">
            {workbuddyLoggingIn && (
              <Button size="sm" variant="ghost" onClick={handleWorkBuddyCancel}>
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={workbuddyLoggingIn !== null}
              onClick={() => handleWorkBuddyAdd('cn')}
            >
              {workbuddyLoggingIn === 'cn' ? <Spinner className="size-3.5 mr-1" /> : null}
              Add CN Account
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={workbuddyLoggingIn !== null}
              onClick={() => handleWorkBuddyAdd('ai')}
            >
              {workbuddyLoggingIn === 'ai' ? <Spinner className="size-3.5 mr-1" /> : null}
              Add AI Account
            </Button>
          </div>
        }
      >
        <div className="p-3 space-y-2">
          {workbuddyStatusMessage && <p className="text-xs text-amber-500">{workbuddyStatusMessage}</p>}
          {workbuddyAccounts.length > 0 ? (
            <div className="space-y-1.5">
              {workbuddyAccounts.map((acc: any) => (
                <div key={acc.id} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold px-1 py-0.5 rounded bg-muted text-[10px] uppercase">
                      {acc.realm || 'CN'}
                    </span>
                    <span className="font-medium text-foreground truncate">{accountLabel(acc, maskEmails)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      size="sm"
                      checked={acc.enabled !== false}
                      onCheckedChange={(checked) => handleWorkBuddyToggle(acc.id, checked)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-destructive hover:bg-destructive/10"
                      onClick={() => handleWorkBuddyRemove(acc.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No WorkBuddy accounts connected.</p>
          )}
        </div>
      </SettingSection>

      {/* Notion AI */}
      <SettingSection
        title="Notion AI"
        description="Track rolling and monthly Notion AI allowances for a Business or Enterprise workspace."
      >
        <div className="p-3 space-y-3">
          <div className="space-y-1.5 text-xs text-muted-foreground rounded-lg bg-muted/20 p-2.5 border border-border/40">
            <span className="font-semibold text-foreground block">Setup Steps:</span>
            <ol className="list-decimal list-inside space-y-1">
              <li>Open app.notion.com, sign in, and select a Business or Enterprise workspace.</li>
              <li>Open DevTools → Network, then Settings → Notion AI → Usage; select the getCreditRateLimitStatus request.</li>
              <li>Manually copy token_v2 from Cookie header and spaceId from payload (workspace UUID, not page ID).</li>
              <li>Paste the cookie and explicit workspace ID below, then save.</li>
            </ol>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Workspace ID (spaceId UUID)</label>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleNotionOpen}>
                Open Notion
              </Button>
            </div>
            <Input
              type="text"
              placeholder="e.g. 11111111-2222-3333-4444-555555555555"
              value={notionWorkspaceId}
              onChange={(e) => setNotionWorkspaceId(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">token_v2 Session Cookie</label>
            <Input
              type="password"
              placeholder="token_v2=..."
              value={notionCookie}
              onChange={(e) => setNotionCookie(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>

          {notionMessage && <p className="text-xs text-muted-foreground">{notionMessage}</p>}

          <div className="flex items-center justify-between pt-1">
            <Button size="sm" variant="outline" onClick={handleNotionClear}>
              Clear cookie
            </Button>
            <Button size="sm" variant="outline" disabled={notionSaving} onClick={handleNotionSave}>
              {notionSaving ? <Spinner className="size-3.5 mr-1" /> : null}
              Save Notion
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* MiniMax */}
      <SettingSection
        title="MiniMax"
        description="Quota balance and token-plan usage for MiniMax models."
      >
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Billing Mode</label>
              <select
                value={minimaxBillingMode}
                onChange={(e) => handleMiniMaxBillingModeChange(e.target.value as 'token-plan' | 'api')}
                className={`${selectClass} w-full`}
              >
                <option value="token-plan">Token Plan</option>
                <option value="api">API Balance</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Region</label>
              <select
                value={minimaxApiRegion}
                onChange={(e) => handleMiniMaxRegionChange(e.target.value as 'auto' | 'cn' | 'intl')}
                className={`${selectClass} w-full`}
              >
                <option value="auto">Auto Detect</option>
                <option value="cn">China (minimaxi.com)</option>
                <option value="intl">International (minimax.io)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">API Key</label>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleMiniMaxOpen}>
                Open MiniMax Platform
              </Button>
            </div>
            <Input
              type="password"
              placeholder="eyJhbGciOi..."
              value={minimaxApiKey}
              onChange={(e) => setMinimaxApiKey(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>

          {minimaxMessage && <p className="text-xs text-muted-foreground">{minimaxMessage}</p>}

          <div className="flex items-center justify-between pt-1">
            <Button size="sm" variant="outline" onClick={handleMiniMaxClear}>
              Clear API key
            </Button>
            <Button size="sm" variant="outline" disabled={minimaxSaving} onClick={handleMiniMaxSave}>
              {minimaxSaving ? <Spinner className="size-3.5 mr-1" /> : null}
              Save MiniMax
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* GitHub Copilot */}
      <SettingSection title="GitHub Copilot" description="Device code sign-in or manual token authentication.">
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-foreground">GitHub Authorization</div>
              <div className="text-2xs text-muted-foreground">Sign in with browser via device code.</div>
            </div>
            <div className="flex items-center gap-2">
              {copilotSigningIn && (
                <Button size="sm" variant="ghost" onClick={handleCopilotCancel}>
                  Cancel
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={copilotSigningIn} onClick={handleCopilotSignIn}>
                {copilotSigningIn ? <Spinner className="size-3.5 mr-1" /> : null}
                Sign in with GitHub
              </Button>
            </div>
          </div>
          {copilotDeviceCode && (
            <div className="p-2.5 rounded-md bg-muted/40 border border-border text-xs space-y-1">
              <div>Enter code on GitHub: <strong className="font-mono text-foreground">{copilotDeviceCode.userCode}</strong></div>
              {copilotDeviceCode.verificationUri && (
                <a
                  href={copilotDeviceCode.verificationUri}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline text-2xs block"
                >
                  {copilotDeviceCode.verificationUri}
                </a>
              )}
            </div>
          )}
          <div className="pt-2 border-t border-border/40 space-y-2">
            <label className="text-xs font-medium text-foreground">Manual Copilot Token</label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="ghu_... or gho_..."
                value={copilotManualToken}
                onChange={(e) => setCopilotManualToken(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
              />
              <Button size="sm" variant="outline" onClick={handleCopilotSaveManual}>
                Save Token
              </Button>
            </div>
          </div>
        </div>
      </SettingSection>

      {/* Cursor Accounts */}
      <SettingSection title="Cursor Accounts" description="Manage Cursor token credentials and detected profiles.">
        <div className="p-3 space-y-3">
          {cursorStatus?.accounts?.length > 0 && (
            <div className="space-y-1.5 pb-2 border-b border-border/40">
              {cursorStatus.accounts.map((acc: any) => (
                <div key={acc.id} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <span className="font-medium text-foreground">{accountLabel(acc, maskEmails)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-destructive hover:bg-destructive/10"
                    onClick={() => handleCursorLogout(acc.id)}
                  >
                    Logout
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">Manual Cursor Token</label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="WorkosCursorSessionToken=..."
                value={cursorManualToken}
                onChange={(e) => setCursorManualToken(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
              />
              <Button size="sm" variant="outline" onClick={handleCursorSaveManual}>
                Save Token
              </Button>
            </div>
          </div>
        </div>
      </SettingSection>

      {/* MiMo Accounts */}
      <SettingSection title="MiMo Accounts" description="Cookie credentials for Xiaomi MiMo quotas.">
        <div className="p-3 space-y-3">
          {mimoAccounts.length > 0 && (
            <div className="space-y-1.5 pb-2 border-b border-border/40">
              {mimoAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <span className="font-medium text-foreground">{acc.name || acc.id}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      size="sm"
                      checked={acc.enabled !== false}
                      onCheckedChange={(checked) => handleMimoToggle(acc.id, checked)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-destructive hover:bg-destructive/10"
                      onClick={() => handleMimoRemove(acc.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="serviceToken=... or cookie header"
              value={mimoCookieInput}
              onChange={(e) => setMimoCookieInput(e.target.value)}
              className="h-8 text-xs font-mono flex-1"
            />
            <Button size="sm" variant="outline" onClick={handleMimoAdd}>
              Add Account
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* OpenCode Profiles */}
      <SettingSection title="OpenCode Profiles" description="API and cookie profiles for OpenCode provider.">
        <div className="p-3 space-y-3">
          {Object.keys(opencodeProfiles).length > 0 && (
            <div className="space-y-1.5 pb-2 border-b border-border/40">
              {Object.entries(opencodeProfiles).map(([name, prof]: [string, any]) => (
                <div key={name} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <span className="font-medium text-foreground">{name}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      size="sm"
                      checked={prof.enabled !== false}
                      onCheckedChange={(checked) => handleOpencodeToggle(name, checked)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-destructive hover:bg-destructive/10"
                      onClick={() => handleOpencodeDeleteProfile(name)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <div className="text-2xs font-medium text-muted-foreground uppercase">Add API Profile</div>
            <div className="flex gap-2">
              <Input
                placeholder="Profile Name"
                value={opencodeNewName}
                onChange={(e) => setOpencodeNewName(e.target.value)}
                className="h-8 text-xs w-36"
              />
              <Input
                type="password"
                placeholder="API Key"
                value={opencodeNewKey}
                onChange={(e) => setOpencodeNewKey(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
              />
              <Button size="sm" variant="outline" onClick={handleOpencodeAddProfile}>
                Add
              </Button>
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-border/40">
            <div className="text-2xs font-medium text-muted-foreground uppercase">Session Cookie</div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="session=..."
                value={opencodeCookieInput}
                onChange={(e) => setOpencodeCookieInput(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
              />
              <Button size="sm" variant="outline" onClick={handleOpencodeSaveCookie}>
                Save Cookie
              </Button>
            </div>
          </div>
        </div>
      </SettingSection>

      {/* OpenRouter Profiles */}
      <SettingSection title="OpenRouter Profiles" description="Manage API key profiles for OpenRouter limits tracking.">
        <div className="p-3 space-y-3">
          {Object.keys(openrouterProfiles).length > 0 && (
            <div className="space-y-1.5 pb-2 border-b border-border/40">
              {Object.entries(openrouterProfiles).map(([name, prof]: [string, any]) => (
                <div key={name} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <span className="font-medium text-foreground">{name}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      size="sm"
                      checked={prof.enabled !== false}
                      onCheckedChange={(checked) => handleOpenrouterToggle(name, checked)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-destructive hover:bg-destructive/10"
                      onClick={() => handleOpenrouterDeleteProfile(name)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Profile Name"
              value={openrouterNewName}
              onChange={(e) => setOpenrouterNewName(e.target.value)}
              className="h-8 text-xs w-36"
            />
            <Input
              type="password"
              placeholder="sk-or-v1-..."
              value={openrouterNewKey}
              onChange={(e) => setOpenrouterNewKey(e.target.value)}
              className="h-8 text-xs font-mono flex-1"
            />
            <Button size="sm" variant="outline" onClick={handleOpenrouterAddProfile}>
              Add Profile
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* Third-party Profiles */}
      <SettingSection title="Third-party Profiles" description="Custom OpenAI-compatible and Anthropic-compatible endpoints.">
        <div className="p-3 space-y-3">
          {Object.keys(thirdpartyProfiles).length > 0 && (
            <div className="space-y-1.5 pb-2 border-b border-border/40">
              {Object.entries(thirdpartyProfiles).map(([name, prof]: [string, any]) => (
                <div key={name} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <div>
                    <span className="font-medium text-foreground">{name}</span>
                    <span className="text-2xs text-muted-foreground ml-2 font-mono">{prof.baseUrl}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      size="sm"
                      checked={prof.enabled !== false}
                      onCheckedChange={(checked) => handleTpToggle(name, checked)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-destructive hover:bg-destructive/10"
                      onClick={() => handleTpDeleteProfile(name)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              placeholder="Profile Name"
              value={tpName}
              onChange={(e) => setTpName(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              placeholder="Base URL (e.g. https://api.together.xyz/v1)"
              value={tpBaseUrl}
              onChange={(e) => setTpBaseUrl(e.target.value)}
              className="h-8 text-xs font-mono"
            />
            <Input
              type="password"
              placeholder="API Key"
              value={tpApiKey}
              onChange={(e) => setTpApiKey(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={handleTpAddProfile}>
              Add Profile
            </Button>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
