import React, { useState, useEffect } from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import type { TokenMonitorSettingsState } from './types';

interface GeneralSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
}

export function GeneralSettings({ settings, updateSettings }: GeneralSettingsProps) {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportResult, setReportResult] = useState<string | null>(null);
  const [tokscaleInfo, setTokscaleInfo] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.getTokscaleStatus) {
      window.tokenMonitor.getTokscaleStatus().then((status: any) => {
        setTokscaleInfo(status);
      }).catch(() => {});
    }
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateMessage(null);
    try {
      if (typeof window !== 'undefined' && window.tokenMonitor?.checkAppUpdateNow) {
        const res = await window.tokenMonitor.checkAppUpdateNow();
        if (res && res.updateAvailable) {
          setUpdateMessage(`Update available: ${res.version}`);
        } else {
          setUpdateMessage('You are on the latest version.');
        }
      }
    } catch (err: any) {
      setUpdateMessage(err?.message || 'Failed to check updates');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setReportResult(null);
    try {
      if (typeof window !== 'undefined' && window.tokenMonitor?.generateDiagnosticReport) {
        const path = await window.tokenMonitor.generateDiagnosticReport();
        setReportResult(`Report generated: ${path}`);
      }
    } catch (err: any) {
      setReportResult(err?.message || 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleOpenUserData = () => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.openUserData) {
      window.tokenMonitor.openUserData();
    }
  };

  return (
    <div className="space-y-6">
      <SettingSection title="Preferences" description="Basic application behavior and display language.">
        <SettingRow
          title="Language"
          description="Interface display language."
          control={
            <select
              value={settings.language || 'auto'}
              onChange={(e) => updateSettings({ language: e.target.value })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="auto">System Default</option>
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
              <option value="zh-TW">繁體中文</option>
            </select>
          }
        />

        <SettingRow
          title="Startup"
          description="Automatically launch Token Monitor when you sign in."
          control={
            <Switch
              checked={Boolean(settings.startAtLogin)}
              onCheckedChange={(checked) => updateSettings({ startAtLogin: checked })}
            />
          }
        />

        <SettingRow
          title="Discord Rich Presence"
          description="Show active AI coding sessions and model stats on your Discord profile."
          control={
            <Switch
              checked={Boolean(settings.discordRpcEnabled)}
              onCheckedChange={(checked) => updateSettings({ discordRpcEnabled: checked })}
            />
          }
        />
      </SettingSection>

      <SettingSection title="Updates" description="Software update checks and background installations.">
        <SettingRow
          title="Automatic Updates"
          description="Automatically check for and install application updates in the background."
          control={
            <Switch
              checked={settings.automaticAppUpdates !== false}
              onCheckedChange={(checked) => updateSettings({ automaticAppUpdates: checked })}
            />
          }
        />

        <SettingRow
          title="Check for Updates"
          description={updateMessage || "Check for the latest available release."}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={checkingUpdate}
              onClick={handleCheckUpdate}
            >
              {checkingUpdate ? <Spinner className="size-3.5 mr-1" /> : null}
              Check now
            </Button>
          }
        />
      </SettingSection>

      <SettingSection title="Diagnostics & System" description="Troubleshooting details and configuration directories.">
        <SettingRow
          title="Tokscale Status"
          description={
            tokscaleInfo
              ? `Version: ${tokscaleInfo.version || 'Active'} · Source: ${tokscaleInfo.path || 'Bundled'}`
              : 'Tokscale usage parser engine is running.'
          }
        />

        <SettingRow
          title="Application Data"
          description="Open the directory where local token logs and configurations are stored."
          control={
            <Button variant="outline" size="sm" onClick={handleOpenUserData}>
              Open directory
            </Button>
          }
        />

        <SettingRow
          title="Diagnostic Report"
          description={reportResult || "Generate a redacted diagnostic archive to attach when reporting issues."}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={generatingReport}
              onClick={handleGenerateReport}
            >
              {generatingReport ? <Spinner className="size-3.5 mr-1" /> : null}
              Generate report
            </Button>
          }
        />
      </SettingSection>
    </div>
  );
}
