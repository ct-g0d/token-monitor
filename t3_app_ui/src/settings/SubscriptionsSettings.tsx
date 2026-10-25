import React, { useState } from 'react';
import { SettingSection } from './SettingsComponents';
import { Switch } from '~/components/ui/switch';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import type { TokenMonitorSettingsState, SubscriptionRecord } from './types';

interface SubscriptionsSettingsProps {
  settings: TokenMonitorSettingsState;
  updateSettings: (patch: Partial<TokenMonitorSettingsState>) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

export function SubscriptionsSettings({ settings, updateSettings, refreshSettings }: SubscriptionsSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [adoptingOrphans, setAdoptingOrphans] = useState(false);

  // New subscription form state
  const [provider, setProvider] = useState('claude');
  const [account, setAccount] = useState('');
  const [planName, setPlanName] = useState('Pro');
  const [amount, setAmount] = useState('20');
  const [currency, setCurrency] = useState('USD');
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [autoRenew, setAutoRenew] = useState(true);

  const subscriptions: SubscriptionRecord[] = settings.subscriptions || [];
  const orphans = (settings.subscriptionsOrphaned as any)?.records || settings.subscriptionsOrphaned || [];
  const orphanList = Array.isArray(orphans) ? orphans : [];

  const handleSaveSubscription = async () => {
    if (!amount || isNaN(Number(amount))) return;
    setSaving(true);
    try {
      const newSub: SubscriptionRecord = {
        id: `sub_${Date.now()}`,
        provider,
        amount: Number(amount),
        currency,
        interval,
        intervalCount: 1,
        startDate,
        autoRenew,
        kind: 'subscription',
        ...(account.trim() ? { account: account.trim() } : {}),
        ...(planName.trim() ? { planName: planName.trim() } : {}),
      };
      const updated = [...subscriptions, newSub];
      if (typeof window !== 'undefined' && window.tokenMonitor?.saveSubscriptions) {
        await window.tokenMonitor.saveSubscriptions(updated);
        await refreshSettings();
        setAccount('');
        setPlanName('Pro');
        setAmount('20');
      } else {
        await updateSettings({ subscriptions: updated });
        setAccount('');
        setPlanName('Pro');
        setAmount('20');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubscription = async (id?: string) => {
    if (!id) return;
    const updated = subscriptions.filter((s) => s.id !== id);
    if (typeof window !== 'undefined' && window.tokenMonitor?.saveSubscriptions) {
      await window.tokenMonitor.saveSubscriptions(updated);
      await refreshSettings();
    } else {
      await updateSettings({ subscriptions: updated });
    }
  };

  const handleAdoptOrphans = async () => {
    setAdoptingOrphans(true);
    try {
      if (typeof window !== 'undefined' && window.tokenMonitor?.adoptOrphanedSubscriptions) {
        await window.tokenMonitor.adoptOrphanedSubscriptions();
        await refreshSettings();
      }
    } finally {
      setAdoptingOrphans(false);
    }
  };

  const handleDiscardOrphans = async () => {
    if (typeof window !== 'undefined' && window.tokenMonitor?.discardOrphanedSubscriptions) {
      await window.tokenMonitor.discardOrphanedSubscriptions();
      await refreshSettings();
    }
  };

  return (
    <div className="space-y-6">
      {orphanList.length > 0 && (
        <div className="p-3 rounded-xl border border-warning/40 bg-warning/10 space-y-2 text-xs">
          <p className="font-medium text-foreground">
            <span className="tabular-nums font-semibold">{orphanList.length}</span> local subscription records were found from before joining this Hub.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={adoptingOrphans} onClick={handleAdoptOrphans}>
              {adoptingOrphans ? <Spinner className="size-3.5 mr-1" /> : null}
              Add to shared list
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDiscardOrphans}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <SettingSection
        title="Active Subscriptions & Top-ups"
        description="Track your monthly AI tool fixed costs alongside pay-as-you-go tokens."
      >
        <div className="p-3 space-y-3">
          {subscriptions.length > 0 ? (
            <div className="space-y-2">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id || `${sub.provider}-${sub.planName}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/40 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground capitalize">{sub.provider}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="font-medium text-foreground">{sub.planName || 'Plan'}</span>
                      {sub.account && (
                        <span className="text-2xs text-muted-foreground">({sub.account})</span>
                      )}
                    </div>
                    <div className="text-2xs text-muted-foreground tabular-nums">
                      {sub.currency} {sub.amount} / {sub.interval}
                      {sub.startDate ? ` · Started ${sub.startDate}` : ''}
                      {sub.autoRenew ? ' · Auto-renewing' : ''}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive hover:bg-destructive/10 text-xs"
                    onClick={() => handleDeleteSubscription(sub.id)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No recurring subscriptions recorded yet.</p>
          )}
        </div>
      </SettingSection>

      <SettingSection title="Add Subscription" description="Record a new recurring AI service membership.">
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="tm-label">Provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
              >
                <option value="claude">Claude Code / Pro</option>
                <option value="codex">OpenAI / ChatGPT Plus</option>
                <option value="cursor">Cursor Pro / Business</option>
                <option value="copilot">GitHub Copilot</option>
                <option value="antigravity">Antigravity</option>
                <option value="kimi">Kimi</option>
                <option value="qwen">Qwen</option>
                <option value="mimo">Xiaomi MiMo</option>
                <option value="other">Other Service</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="tm-label">Plan Name</label>
              <Input
                placeholder="e.g. Pro, Team, Ultra"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="tm-label">Account / Email</label>
              <Input
                placeholder="Optional account tag"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="tm-label">Price</label>
              <Input
                type="number"
                step="0.01"
                placeholder="20.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-8 text-xs tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="tm-label">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
              >
                <option value="USD">USD ($)</option>
                <option value="CNY">CNY (¥)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="JPY">JPY (¥)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="tm-label">Billing Interval</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value as any)}
                className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
              >
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="tm-label">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={autoRenew} onCheckedChange={setAutoRenew} size="sm" />
              <span>Auto-renews at next billing date</span>
            </label>

            <Button size="sm" variant="outline" disabled={saving} onClick={handleSaveSubscription}>
              {saving ? <Spinner className="size-3.5 mr-1" /> : null}
              Add Subscription
            </Button>
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
