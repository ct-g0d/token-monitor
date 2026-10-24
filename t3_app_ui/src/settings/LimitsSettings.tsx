import React, { useState } from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { selectClass } from './GeneralSettings';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import type { TokenMonitorSettingsState } from './types';
import { useProviderAccounts } from '../adapters/accountsState';
import { ProviderAccountRow } from './accounts/ProviderAccountRow';

interface LimitsSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

export function LimitsSettings({ settings, updateSettings, refreshSettings }: LimitsSettingsProps) {
  // Claude Web organization state
  const [claudeOrganizations, setClaudeOrganizations] = useState<Array<{ id: string; name?: string }>>([]);
  const [claudeOrgId, setClaudeOrgId] = useState(settings.claudeWebOrganizationId || '');
  const [claudeOrgStatus, setClaudeOrgStatus] = useState<string | null>(null);

  // Hook providing normalized provider accounts for all 15 providers
  const providers = useProviderAccounts(settings);

  // Claude actions
  const handleLoadClaudeOrganizations = async () => {
    setClaudeOrgStatus('Loading organizations...');
    try {
      if (!window.tokenMonitor?.limits?.listOrganizationChoices) return;
      const result = await window.tokenMonitor.limits.listOrganizationChoices('claude');
      const choices = result?.choices || result?.organizations || (Array.isArray(result) ? result : []);
      setClaudeOrganizations(choices || []);
      setClaudeOrgStatus(choices?.length ? null : 'No organizations available. Sign in to Claude first.');
    } catch {
      setClaudeOrgStatus('Could not load organizations.');
    }
  };

  const handleSaveClaudeOrgId = async () => {
    if (!claudeOrgId.trim() || !window.tokenMonitor?.limits?.saveCredential) return;
    try {
      await window.tokenMonitor.limits.saveCredential('claude', { claudeWebOrganizationId: claudeOrgId.trim() });
      await updateSettings({ claudeWebOrganizationId: claudeOrgId.trim() });
      setClaudeOrgStatus('Organization saved.');
      await refreshSettings();
    } catch {
      setClaudeOrgStatus('Failed to save organization.');
    }
  };

  // Group providers into "Signed in" and "Available"
  const signedInProviders = providers.filter(
    (p) => p.status === 'connected' || p.status === 'pending' || p.accounts.length > 0
  );
  const availableProviders = providers.filter(
    (p) => !(p.status === 'connected' || p.status === 'pending' || p.accounts.length > 0)
  );

  return (
    <div className="space-y-6">
      {/* Quota Display & Privacy */}
      <SettingSection
        title="Quota Display & Privacy"
        description="Remaining capacity visualization and display privacy."
      >
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
      <SettingSection
        title="Anthropic / Claude Code"
        description="Claude Code sign-in status and organization selection."
      >
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

      {/* Accounts */}
      <SettingSection
        title="Accounts"
        description="Manage sign-in status and credentials for AI providers."
      >
        <div className="p-3 space-y-5">
          {signedInProviders.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Signed in ({signedInProviders.length})
                </h3>
              </div>
              <div className="space-y-2">
                {signedInProviders.map((provider) => (
                  <ProviderAccountRow key={provider.providerId} provider={provider} />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Available ({availableProviders.length})
              </h3>
            </div>
            <div className="space-y-2">
              {availableProviders.map((provider) => (
                <ProviderAccountRow key={provider.providerId} provider={provider} />
              ))}
            </div>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
