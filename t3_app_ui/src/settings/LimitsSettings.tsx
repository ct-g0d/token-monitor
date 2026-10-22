import React, { useState, useEffect } from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import type { TokenMonitorSettingsState, ManagedAccount, LimitAccountForm } from './types';

interface LimitsSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

export function LimitsSettings({ settings, updateSettings, refreshSettings }: LimitsSettingsProps) {
  // Codex state
  const [codexAccounts, setCodexAccounts] = useState<ManagedAccount[]>([]);
  const [codexLoggingIn, setCodexLoggingIn] = useState(false);
  const [codexStatusMessage, setCodexStatusMessage] = useState<string | null>(null);

  // Antigravity state
  const [antigravityAccounts, setAntigravityAccounts] = useState<ManagedAccount[]>([]);
  const [antigravityLoggingIn, setAntigravityLoggingIn] = useState(false);

  // Copilot state
  const [copilotSigningIn, setCopilotSigningIn] = useState(false);
  const [copilotDeviceCode, setCopilotDeviceCode] = useState<{ userCode?: string; verificationUri?: string } | null>(null);
  const [copilotManualToken, setCopilotManualToken] = useState(settings.copilotApiToken || '');

  // Claude Web state
  const [claudeOrgId, setClaudeOrgId] = useState(settings.claudeWebOrganizationId || '');

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

  // Dynamic Credential Forms state: Record<providerId, Record<fieldKey, string>>
  const [formInputs, setFormInputs] = useState<Record<string, Record<string, string>>>({});
  const [formSaving, setFormSaving] = useState<Record<string, boolean>>({});
  const [formMessages, setFormMessages] = useState<Record<string, string>>({});

  // Load account lists on mount
  useEffect(() => {
    const tm = typeof window !== 'undefined' ? window.tokenMonitor : null;
    if (!tm) return;

    // Codex
    if (tm.codex?.accounts) {
      tm.codex.accounts().then((accs: any) => setCodexAccounts(accs || [])).catch(() => {});
    }
    // Antigravity
    if (tm.antigravity?.accounts) {
      tm.antigravity.accounts().then((accs: any) => setAntigravityAccounts(accs || [])).catch(() => {});
    }
    // MiMo
    if (tm.mimo?.accounts) {
      tm.mimo.accounts().then((accs: any) => setMimoAccounts(accs || [])).catch(() => {});
    }
    // OpenCode
    if (tm.opencode?.getProfiles) {
      tm.opencode.getProfiles().then((p: any) => setOpencodeProfiles(p || {})).catch(() => {});
    }
    // OpenRouter
    if (tm.openrouter?.getProfiles) {
      tm.openrouter.getProfiles().then((p: any) => setOpenrouterProfiles(p || {})).catch(() => {});
    }
    // Thirdparty
    if (tm.thirdparty?.getProfiles) {
      tm.thirdparty.getProfiles().then((p: any) => setThirdpartyProfiles(p || {})).catch(() => {});
    }
    // Cursor
    if (tm.cursor?.status) {
      tm.cursor.status().then((s: any) => setCursorStatus(s || null)).catch(() => {});
    }

    // Listeners
    const unsubCodex = tm.codex?.onLoginStatus?.((status: any) => {
      if (status?.status === 'waiting' || status?.status === 'authorizing') {
        setCodexLoggingIn(true);
        setCodexStatusMessage(status.message || 'Waiting for browser authentication...');
      } else if (status?.status === 'success' || status?.status === 'done') {
        setCodexLoggingIn(false);
        setCodexStatusMessage(null);
        tm.codex.accounts().then((accs: any) => setCodexAccounts(accs || []));
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

    return () => {
      if (typeof unsubCodex === 'function') unsubCodex();
      if (typeof unsubCopilot === 'function') unsubCopilot();
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
    await updateSettings({ ['copilotApiToken']: copilotManualToken.trim() });
    setCopilotManualToken('');
    refreshSettings();
  };

  // Claude Web Org actions
  const handleSaveClaudeOrgId = async () => {
    await updateSettings({ ['claudeWebOrganizationId']: claudeOrgId.trim() });
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

  // Dynamic Credential Forms handler
  const handleDynamicFormChange = (providerId: string, fieldKey: string, val: string) => {
    setFormInputs((prev) => ({
      ...prev,
      [providerId]: {
        ...(prev[providerId] || {}),
        [fieldKey]: val,
      },
    }));
  };

  const handleDynamicFormSave = async (form: LimitAccountForm) => {
    setFormSaving((prev) => ({ ...prev, [form.id]: true }));
    setFormMessages((prev) => ({ ...prev, [form.id]: '' }));
    try {
      const values = formInputs[form.id] || {};
      if (window.tokenMonitor?.limits?.saveCredential) {
        await window.tokenMonitor.limits.saveCredential(form.id, values);
        setFormMessages((prev) => ({ ...prev, [form.id]: 'Credential saved successfully.' }));
        // Clear input values in memory for security
        setFormInputs((prev) => ({ ...prev, [form.id]: {} }));
        refreshSettings();
      }
    } catch (err: any) {
      setFormMessages((prev) => ({ ...prev, [form.id]: err?.message || 'Failed to save credential.' }));
    } finally {
      setFormSaving((prev) => ({ ...prev, [form.id]: false }));
    }
  };

  const handleDynamicFormClear = async (formId: string) => {
    setFormSaving((prev) => ({ ...prev, [formId]: true }));
    try {
      if (window.tokenMonitor?.limits?.clearCredential) {
        await window.tokenMonitor.limits.clearCredential(formId);
        setFormMessages((prev) => ({ ...prev, [formId]: 'Credential cleared.' }));
        refreshSettings();
      }
    } finally {
      setFormSaving((prev) => ({ ...prev, [formId]: false }));
    }
  };

  const dynamicForms: LimitAccountForm[] = settings.limitAccountForms || [];

  return (
    <div className="space-y-6">
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
              checked={settings.maskLimitAccountEmails !== false}
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
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

      {/* OpenAI Codex Accounts */}
      <SettingSection
        title="OpenAI Codex Accounts"
        description="OAuth authentication and usage limit tracking for OpenAI Codex."
        headerAction={
          <Button
            size="sm"
            variant="outline"
            disabled={codexLoggingIn}
            onClick={handleCodexAdd}
          >
            {codexLoggingIn ? <Spinner className="size-3.5 mr-1" /> : null}
            Sign in with OpenAI
          </Button>
        }
      >
        <div className="p-3 space-y-2">
          {codexLoggingIn && (
            <div className="p-3 rounded-lg border border-primary/40 bg-primary/5 flex items-center justify-between text-xs">
              <span className="text-foreground">{codexStatusMessage || 'Authenticating...'}</span>
              <Button size="sm" variant="ghost" onClick={handleCodexCancel}>Cancel</Button>
            </div>
          )}

          {codexAccounts.length > 0 ? (
            <div className="space-y-1.5">
              {codexAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{acc.email || acc.name || acc.id}</span>
                    {acc.isDefault && <span className="text-2xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Default</span>}
                  </div>
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

      {/* GitHub Copilot */}
      <SettingSection title="GitHub Copilot" description="Device code sign-in or manual token authentication.">
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">GitHub Device Authorization Flow:</span>
            <Button
              size="sm"
              variant="outline"
              disabled={copilotSigningIn}
              onClick={handleCopilotSignIn}
            >
              {copilotSigningIn ? <Spinner className="size-3.5 mr-1" /> : null}
              Sign in with GitHub
            </Button>
          </div>

          {copilotDeviceCode && (
            <div className="p-3 rounded-lg border border-primary/40 bg-primary/5 space-y-2 text-xs">
              <p className="text-foreground">
                Enter code <span className="font-mono font-bold text-primary">{copilotDeviceCode.userCode}</span> at{' '}
                <a
                  href={copilotDeviceCode.verificationUri || 'https://github.com/login/device'}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-primary"
                >
                  {copilotDeviceCode.verificationUri || 'github.com/login/device'}
                </a>
              </p>
              <Button size="sm" variant="ghost" onClick={handleCopilotCancel}>Cancel</Button>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-border/30">
            <Input
              type="password"
              placeholder="Or paste copilotApiToken (gh_p...)"
              value={copilotManualToken}
              onChange={(e) => setCopilotManualToken(e.target.value)}
              className="h-8 text-xs flex-1"
            />
            <Button size="sm" variant="outline" onClick={handleCopilotSaveManual}>
              Save Token
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* Claude Web Organization */}
      <SettingSection title="Claude Web Organization" description="Specify custom organization ID for Claude Web session quotas.">
        <div className="p-3 flex gap-2">
          <Input
            placeholder="claudeWebOrganizationId (UUID format)"
            value={claudeOrgId}
            onChange={(e) => setClaudeOrgId(e.target.value)}
            className="h-8 text-xs flex-1"
          />
          <Button size="sm" variant="outline" onClick={handleSaveClaudeOrgId}>
            Save Org ID
          </Button>
        </div>
      </SettingSection>

      {/* Antigravity Accounts */}
      <SettingSection
        title="Antigravity Accounts"
        description="Google OAuth authentication for Antigravity quotas."
        headerAction={
          <Button
            size="sm"
            variant="outline"
            disabled={antigravityLoggingIn}
            onClick={handleAntigravityAdd}
          >
            {antigravityLoggingIn ? <Spinner className="size-3.5 mr-1" /> : null}
            Add Account
          </Button>
        }
      >
        <div className="p-3 space-y-2">
          {antigravityAccounts.length > 0 ? (
            <div className="space-y-1.5">
              {antigravityAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <span className="font-medium text-foreground">{acc.email || acc.name || acc.id}</span>
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

      {/* Cursor Accounts */}
      <SettingSection title="Cursor Accounts" description="Manage Cursor token credentials and detected profiles.">
        <div className="p-3 space-y-3">
          {cursorStatus?.accounts && cursorStatus.accounts.length > 0 && (
            <div className="space-y-1.5">
              {cursorStatus.accounts.map((acc: any) => (
                <div key={acc.id} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <span className="font-medium text-foreground">{acc.email || acc.name || acc.id}</span>
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

          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Paste Cursor WorkosCursorSessionToken"
              value={cursorManualToken}
              onChange={(e) => setCursorManualToken(e.target.value)}
              className="h-8 text-xs flex-1"
            />
            <Button size="sm" variant="outline" onClick={handleCursorSaveManual}>
              Save Cursor Token
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* Xiaomi MiMo */}
      <SettingSection title="Xiaomi MiMo Accounts" description="Manage MiMo credentials via cookie headers.">
        <div className="p-3 space-y-3">
          {mimoAccounts.length > 0 && (
            <div className="space-y-1.5">
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
              placeholder="Paste serviceToken cookie header"
              value={mimoCookieInput}
              onChange={(e) => setMimoCookieInput(e.target.value)}
              className="h-8 text-xs flex-1"
            />
            <Button size="sm" variant="outline" onClick={handleMimoAdd}>
              Add MiMo Account
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* OpenCode Profiles */}
      <SettingSection title="OpenCode Profiles" description="Manage API key or cookie sessions for OpenCode.">
        <div className="p-3 space-y-3">
          {Object.entries(opencodeProfiles).length > 0 && (
            <div className="space-y-1.5 pt-1">
              {Object.entries(opencodeProfiles).map(([name, prof]: [string, any]) => (
                <div key={name} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <span className="font-medium text-foreground">{name}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      size="sm"
                      checked={prof?.enabled !== false}
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

          <div className="flex gap-2">
            <Input
              placeholder="Profile name"
              value={opencodeNewName}
              onChange={(e) => setOpencodeNewName(e.target.value)}
              className="h-8 text-xs w-32"
            />
            <Input
              type="password"
              placeholder="API Key"
              value={opencodeNewKey}
              onChange={(e) => setOpencodeNewKey(e.target.value)}
              className="h-8 text-xs flex-1"
            />
            <Button size="sm" variant="outline" onClick={handleOpencodeAddProfile}>
              Add API Profile
            </Button>
          </div>

          <div className="flex gap-2 pt-1 border-t border-border/30">
            <Input
              type="password"
              placeholder="Or paste OpenCode cookie string"
              value={opencodeCookieInput}
              onChange={(e) => setOpencodeCookieInput(e.target.value)}
              className="h-8 text-xs flex-1"
            />
            <Button size="sm" variant="outline" onClick={handleOpencodeSaveCookie}>
              Save Cookie
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* OpenRouter Profiles */}
      <SettingSection title="OpenRouter Profiles" description="API Keys and balance tracking for OpenRouter.">
        <div className="p-3 space-y-3">
          {Object.entries(openrouterProfiles).length > 0 && (
            <div className="space-y-1.5">
              {Object.entries(openrouterProfiles).map(([name, prof]: [string, any]) => (
                <div key={name} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <span className="font-medium text-foreground">{name}</span>
                  <div className="flex items-center gap-2">
                    <Switch
                      size="sm"
                      checked={prof?.enabled !== false}
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
              placeholder="Profile name"
              value={openrouterNewName}
              onChange={(e) => setOpenrouterNewName(e.target.value)}
              className="h-8 text-xs w-32"
            />
            <Input
              type="password"
              placeholder="sk-or-v1-..."
              value={openrouterNewKey}
              onChange={(e) => setOpenrouterNewKey(e.target.value)}
              className="h-8 text-xs flex-1"
            />
            <Button size="sm" variant="outline" onClick={handleOpenrouterAddProfile}>
              Add Profile
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* Third-Party Custom Endpoints */}
      <SettingSection title="Third-Party API Endpoints" description="Compatible New API, Sub2API, or custom balance checkers.">
        <div className="p-3 space-y-3">
          {Object.entries(thirdpartyProfiles).length > 0 && (
            <div className="space-y-1.5">
              {Object.entries(thirdpartyProfiles).map(([name, prof]: [string, any]) => (
                <div key={name} className="flex items-center justify-between p-2 rounded-md bg-muted/20 border border-border/40 text-xs">
                  <div>
                    <span className="font-medium text-foreground">{name}</span>
                    <span className="ml-2 text-2xs text-muted-foreground">{prof?.baseUrl}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      size="sm"
                      checked={prof?.enabled !== false}
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
              placeholder="Service label"
              value={tpName}
              onChange={(e) => setTpName(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              placeholder="https://api.example.com"
              value={tpBaseUrl}
              onChange={(e) => setTpBaseUrl(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              type="password"
              placeholder="API Token / Key"
              value={tpApiKey}
              onChange={(e) => setTpApiKey(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={handleTpAddProfile}>
              Add Endpoint
            </Button>
          </div>
        </div>
      </SettingSection>

      {/* Dynamic Limit Forms */}
      {dynamicForms.map((form) => {
        const isSaving = Boolean(formSaving[form.id]);
        const msg = formMessages[form.id];
        const values = formInputs[form.id] || {};

        return (
          <SettingSection
            key={form.id}
            title={form.label}
            description={form.openUrl?.url ? `Configure access credentials for ${form.label}.` : undefined}
          >
            <div className="p-3 space-y-3">
              {msg && <p className="text-xs text-primary">{msg}</p>}

              <div className="space-y-2">
                {form.fields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground capitalize">
                      {field.key}
                    </label>
                    {field.input === 'select' ? (
                      <select
                        value={values[field.key] || ''}
                        onChange={(e) => handleDynamicFormChange(form.id, field.key, e.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
                      >
                        <option value="">Default</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        type={field.secret ? 'password' : 'text'}
                        placeholder={field.placeholderKey || `Enter ${field.key}`}
                        value={values[field.key] || ''}
                        onChange={(e) => handleDynamicFormChange(form.id, field.key, e.target.value)}
                        className="h-8 text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => handleDynamicFormClear(form.id)}
                >
                  Clear Credential
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => handleDynamicFormSave(form)}
                >
                  {isSaving ? <Spinner className="size-3.5 mr-1" /> : null}
                  Save {form.label}
                </Button>
              </div>
            </div>
          </SettingSection>
        );
      })}
    </div>
  );
}
