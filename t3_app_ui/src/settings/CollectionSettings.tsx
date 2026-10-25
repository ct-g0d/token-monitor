import React, { useState } from 'react';
import { SettingRow, SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import type { TokenMonitorSettingsState, CustomPricingEntry } from './types';

const CLIENT_CATALOG = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'hermes', label: 'Hermes Agent' },
  { id: 'openclaw', label: 'OpenClaw' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'cline', label: 'Cline' },
  { id: 'amp', label: 'Amp' },
  { id: 'droid', label: 'Factory Droid' },
  { id: 'kimi', label: 'Kimi' },
  { id: 'qwen', label: 'Qwen' },
  { id: 'grok', label: 'Grok Build' },
  { id: 'copilot', label: 'GitHub Copilot' },
  { id: 'pi', label: 'Pi' },
  { id: 'omp', label: 'Oh My Pi' },
  { id: 'zed', label: 'Zed' },
  { id: 'kilo', label: 'Kilo' },
  { id: 'commandcode', label: 'Command Code' },
  { id: 'mimo', label: 'Xiaomi MiMo' },
  { id: 'muse', label: 'Muse Code' },
  { id: 'zcode', label: 'ZCode' },
  { id: 'kiro', label: 'Kiro' },
  { id: 'codebuddy', label: 'CodeBuddy' },
  { id: 'workbuddy', label: 'WorkBuddy' },
  { id: 'proma', label: 'Proma' },
  { id: 'catpaw', label: 'CatPaw' },
  { id: 'qodercn', label: 'Qoder CN' },
  { id: 'reasonix', label: 'Reasonix' },
  { id: 'dsh', label: 'DeepSeek Harness' },
  { id: 'cherrystudio', label: 'Cherry Studio' },
  { id: 'lmstudio', label: 'LM Studio' },
  { id: 'unsloth', label: 'Unsloth' },
  { id: 'devin', label: 'Devin' },
  { id: 'fx', label: 'fx' },
  { id: 'mcode', label: 'MiniMax Code' },
];

interface CollectionSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
}

export function CollectionSettings({ settings, updateSettings }: CollectionSettingsProps) {
  const [toolSearch, setToolSearch] = useState('');
  const [clearingArchive, setClearingArchive] = useState(false);
  const [exportingNow, setExportingNow] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Model Aliases state
  const [aliasPattern, setAliasPattern] = useState('');
  const [aliasTarget, setAliasTarget] = useState('');

  // Custom Pricing state
  const [pricingModelId, setPricingModelId] = useState('');
  const [pricingInput, setPricingInput] = useState('');
  const [pricingOutput, setPricingOutput] = useState('');

  // Tracked clients list
  const trackedClientsValue = Array.isArray(settings.clients)
    ? settings.clients.join(',')
    : typeof settings.clients === 'string'
      ? settings.clients
      : '';
  const trackedClientsSet = new Set(
    (trackedClientsValue || CLIENT_CATALOG.map((c) => c.id).join(','))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  // Hidden clients list
  const hiddenClientsSet = new Set(
    (typeof settings.hiddenClients === 'string' ? settings.hiddenClients : '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  // Pinned clients list
  const pinnedClientsSet = new Set(
    (typeof settings.pinnedClients === 'string' ? settings.pinnedClients : '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const toggleClientTracked = (clientId: string) => {
    const next = new Set(trackedClientsSet);
    if (next.has(clientId)) {
      next.delete(clientId);
    } else {
      next.add(clientId);
    }
    updateSettings({ clients: Array.from(next).join(',') });
  };

  const toggleClientPinned = (clientId: string) => {
    const next = new Set(pinnedClientsSet);
    if (next.has(clientId)) {
      next.delete(clientId);
    } else {
      next.add(clientId);
    }
    updateSettings({ pinnedClients: Array.from(next).join(',') });
  };

  const toggleClientHidden = (clientId: string) => {
    const next = new Set(hiddenClientsSet);
    if (next.has(clientId)) {
      next.delete(clientId);
    } else {
      next.add(clientId);
    }
    updateSettings({ hiddenClients: Array.from(next).join(',') });
  };

  const handlePickExportDir = async () => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.pickExportDir) {
      const selected = await window.tokenMonitor.pickExportDir();
      if (selected) {
        updateSettings({ exportDir: selected });
      }
    }
  };

  const handleExportNow = async () => {
    setExportingNow(true);
    setExportMessage(null);
    try {
      if (typeof window !== 'undefined' && window.tokenMonitor?.exportNow) {
        const res = await window.tokenMonitor.exportNow();
        setExportMessage(res?.path ? `Exported to ${res.path}` : 'Export completed successfully.');
      }
    } catch (err: any) {
      setExportMessage(err?.message || 'Export failed');
    } finally {
      setExportingNow(false);
    }
  };

  const handleClearArchive = async () => {
    if (!window.confirm('Clear all archived session history? This cannot be undone.')) return;
    setClearingArchive(true);
    try {
      if (typeof window !== 'undefined' && window.tokenMonitor?.clearSessionUsageArchive) {
        await window.tokenMonitor.clearSessionUsageArchive();
      }
    } finally {
      setClearingArchive(false);
    }
  };

  const handleAddAlias = async () => {
    if (!aliasPattern || !aliasTarget) return;
    const nextAliases = { ...(settings.modelAliases || {}), [aliasPattern]: aliasTarget };
    await updateSettings({ modelAliases: nextAliases });
    setAliasPattern('');
    setAliasTarget('');
  };

  const handleRemoveAlias = async (pattern: string) => {
    const nextAliases = { ...(settings.modelAliases || {}) };
    delete nextAliases[pattern];
    await updateSettings({ modelAliases: nextAliases });
  };

  const handleAddPricing = async () => {
    if (!pricingModelId || isNaN(Number(pricingInput)) || isNaN(Number(pricingOutput))) return;
    const entry: CustomPricingEntry = {
      modelId: pricingModelId.trim(),
      inputPerM: Number(pricingInput),
      outputPerM: Number(pricingOutput),
    };
    const list = [...(settings.customModelPricing || [])].filter((p) => p.modelId !== entry.modelId);
    list.push(entry);
    await updateSettings({ customModelPricing: list });
    setPricingModelId('');
    setPricingInput('');
    setPricingOutput('');
  };

  const handleRemovePricing = async (modelId: string) => {
    const list = (settings.customModelPricing || []).filter((p) => p.modelId !== modelId);
    await updateSettings({ customModelPricing: list });
  };

  const filteredCatalog = CLIENT_CATALOG.filter(
    (c) =>
      c.label.toLowerCase().includes(toolSearch.toLowerCase()) ||
      c.id.toLowerCase().includes(toolSearch.toLowerCase())
  );

  const cadenceValue = settings.collectionMode === 'live'
    ? 'live'
    : settings.collectionMode === 'smart'
      ? 'smart'
      : String(settings.collectionIntervalMs || 300000);

  return (
    <div className="space-y-6">
      <SettingSection title="Collection Options" description="Environment scanning and history retention.">
        <SettingRow
          title="Collection Cadence"
          description="Frequency for gathering local session logs and token counts."
          control={
            <select
              value={cadenceValue}
              onChange={(e) => {
                const val = e.target.value;
                updateSettings({
                  collectionMode: val === 'live' ? 'live' : val === 'smart' ? 'smart' : 'interval',
                  collectionIntervalMs: val === 'smart'
                    ? 600000
                    : val === 'live'
                      ? Number(settings.collectionIntervalMs || 300000)
                      : Number(val),
                });
              }}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="live">Live (Adaptive)</option>
              <option value="smart">Smart (10 min idle)</option>
              <option value="300000">5 minutes</option>
              <option value="900000">15 minutes</option>
              <option value="1800000">30 minutes</option>
            </select>
          }
        />

        <SettingRow
          title="Scan WSL Environments"
          description="Scan installed Windows Subsystem for Linux distributions for AI tool sessions."
          control={
            <Switch
              checked={Boolean(settings.wslScanEnabled)}
              onCheckedChange={(checked) => updateSettings({ wslScanEnabled: checked })}
            />
          }
        />

        <SettingRow
          title="Archive Session Usage"
          description="Save detailed history records for prompt sessions."
          control={
            <Switch
              checked={settings.sessionUsageArchiveEnabled !== false}
              onCheckedChange={(checked) => updateSettings({ sessionUsageArchiveEnabled: checked })}
            />
          }
        />

        <SettingRow
          title="Clear Session Archive"
          description="Delete cached session logs and history while preserving daily summary totals."
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={clearingArchive}
              onClick={handleClearArchive}
            >
              {clearingArchive ? <Spinner className="size-3.5 mr-1" /> : null}
              Clear archive
            </Button>
          }
        />
      </SettingSection>

      <SettingSection title="History Recording" description="Snapshots of historical token usage over time.">
        <SettingRow
          title="Enable History Recording"
          description="Record periodic snapshots for trend charts and timelines."
          control={
            <Switch
              checked={settings.historyEnabled !== false}
              onCheckedChange={(checked) => updateSettings({ historyEnabled: checked })}
            />
          }
        />

        {settings.historyEnabled !== false && (
          <SettingRow
            title="Snapshot Frequency"
            description="Interval between background history snapshots."
            control={
              <select
                value={String(settings.historyIntervalMs || 900000)}
                onChange={(e) => updateSettings({ historyIntervalMs: parseInt(e.target.value, 10) })}
                className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="300000">5 minutes</option>
                <option value="600000">10 minutes</option>
                <option value="900000">15 minutes</option>
                <option value="1800000">30 minutes</option>
                <option value="3600000">1 hour</option>
              </select>
            }
          />
        )}
      </SettingSection>

      <SettingSection
        title="Tracked Tools & Clients"
        description="Select and prioritize which AI coding assistants to monitor."
        headerAction={
          <div className="flex items-center gap-2">
            <Input
              placeholder="Filter tools..."
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              className="h-7 w-40 text-xs"
            />
            {settings.clientDisplayOrder && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => updateSettings({ clientDisplayOrder: '' })}
              >
                Reset order
              </Button>
            )}
          </div>
        }
      >
        <div className="p-3 max-h-72 overflow-y-auto space-y-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {filteredCatalog.map((tool) => {
              const isChecked = trackedClientsSet.has(tool.id);
              const isPinned = pinnedClientsSet.has(tool.id);
              const isHidden = hiddenClientsSet.has(tool.id);

              return (
                <div
                  key={tool.id}
                  className="flex flex-col justify-between p-2 rounded-lg bg-muted/20 border border-border/40 text-xs gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{tool.label}</span>
                    <Switch
                      size="sm"
                      checked={isChecked}
                      onCheckedChange={() => toggleClientTracked(tool.id)}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-border/20 text-2xs">
                    <button
                      type="button"
                      onClick={() => toggleClientPinned(tool.id)}
                      className={`cursor-pointer hover:underline ${isPinned ? 'text-primary font-semibold' : 'text-muted-foreground'}`}
                    >
                      {isPinned ? '★ Pinned' : '☆ Pin'}
                    </button>
                    <span className="text-muted-foreground/40">·</span>
                    <button
                      type="button"
                      onClick={() => toggleClientHidden(tool.id)}
                      className={`cursor-pointer hover:underline ${isHidden ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
                    >
                      {isHidden ? 'Hidden' : 'Hide'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SettingSection>

      <SettingSection title="Data Export" description="Automatically or manually export token logs to CSV/JSON.">
        <SettingRow
          title="Automated Backups"
          description="Periodically write exported logs to disk."
          control={
            <Switch
              checked={Boolean(settings.exportAutoEnabled)}
              onCheckedChange={(checked) => updateSettings({ exportAutoEnabled: checked })}
            />
          }
        />

        {settings.exportAutoEnabled && (
          <>
            <SettingRow
              title="Export Interval"
              description="Frequency of automatic background exports."
              control={
                <select
                  value={String(settings.exportIntervalMs || 86400000)}
                  onChange={(e) => updateSettings({ exportIntervalMs: parseInt(e.target.value, 10) })}
                  className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="3600000">1 hour</option>
                  <option value="21600000">6 hours</option>
                  <option value="43200000">12 hours</option>
                  <option value="86400000">24 hours (Daily)</option>
                  <option value="604800000">7 days (Weekly)</option>
                </select>
              }
            />

            <SettingRow
              title="Export Destination"
              description={settings.exportDir ? `Folder: ${settings.exportDir}` : 'No directory chosen.'}
              control={
                <Button variant="outline" size="sm" onClick={handlePickExportDir}>
                  Select directory...
                </Button>
              }
            />
          </>
        )}

        <SettingRow
          title="Export Now"
          description={exportMessage || "Generate a snapshot export file immediately."}
          control={
            <Button
              variant="outline"
              size="sm"
              disabled={exportingNow}
              onClick={handleExportNow}
            >
              {exportingNow ? <Spinner className="size-3.5 mr-1" /> : null}
              Export now
            </Button>
          }
        />
      </SettingSection>

      <SettingSection title="Model Aliases & Grouping" description="Map raw model identifiers to user-friendly names.">
        <SettingRow
          title="Group by Model Alias"
          description="Combine variants under the same alias when presenting aggregations."
          control={
            <select
              value={typeof settings.modelAliasGrouping === 'string' ? settings.modelAliasGrouping : settings.modelAliasGrouping ? 'duplicates' : 'off'}
              onChange={(e) => updateSettings({ modelAliasGrouping: e.target.value as any })}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="off">Off (Keep distinct)</option>
              <option value="duplicates">Collapse exact duplicate names</option>
              <option value="prefix">Group by family prefix</option>
            </select>
          }
        />

        <div className="p-3 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Model pattern (e.g. claude-3-5-sonnet-20241022)"
              value={aliasPattern}
              onChange={(e) => setAliasPattern(e.target.value)}
              className="h-8 text-xs flex-1"
            />
            <Input
              placeholder="Display alias (e.g. Claude 3.5 Sonnet)"
              value={aliasTarget}
              onChange={(e) => setAliasTarget(e.target.value)}
              className="h-8 text-xs flex-1"
            />
            <Button size="sm" variant="outline" onClick={handleAddAlias}>
              Add Alias
            </Button>
          </div>

          {settings.modelAliases && Object.keys(settings.modelAliases).length > 0 && (
            <div className="space-y-1 pt-1">
              {Object.entries(settings.modelAliases).map(([pattern, target]) => (
                <div key={pattern} className="flex items-center justify-between p-2 rounded-md bg-muted/20 text-xs border border-border/40">
                  <div>
                    <span className="font-mono text-muted-foreground">{pattern}</span>
                    <span className="mx-2 text-muted-foreground/60">→</span>
                    <span className="font-medium text-foreground">{target}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-2xs text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemoveAlias(pattern)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingSection>

      <SettingSection title="Custom Model Pricing" description="Override pricing per million tokens ($/1M tokens).">
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Input
              placeholder="Model ID (e.g. gpt-4o)"
              value={pricingModelId}
              onChange={(e) => setPricingModelId(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Input $/1M"
              value={pricingInput}
              onChange={(e) => setPricingInput(e.target.value)}
              className="h-8 text-xs tabular-nums"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Output $/1M"
              value={pricingOutput}
              onChange={(e) => setPricingOutput(e.target.value)}
              className="h-8 text-xs tabular-nums"
            />
            <Button size="sm" variant="outline" onClick={handleAddPricing}>
              Save Price
            </Button>
          </div>

          {settings.customModelPricing && settings.customModelPricing.length > 0 && (
            <div className="space-y-1 pt-1">
              {settings.customModelPricing.map((item) => (
                <div key={item.modelId} className="flex items-center justify-between p-2 rounded-md bg-muted/20 text-xs border border-border/40">
                  <div>
                    <span className="font-mono font-medium text-foreground">{item.modelId}</span>
                    <span className="ml-3 text-muted-foreground tabular-nums">
                      Input: ${item.inputPerM} / 1M · Output: ${item.outputPerM} / 1M
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-2xs text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemovePricing(item.modelId)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingSection>
    </div>
  );
}
