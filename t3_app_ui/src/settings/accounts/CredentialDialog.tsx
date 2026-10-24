import React, { useState, useEffect } from 'react';
import type { ProviderAccounts } from '../../adapters/accountsState';
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Badge } from '~/components/ui/badge';
import { Spinner } from '~/components/ui/spinner';

export interface CredentialDialogProps {
  open: boolean;
  provider: ProviderAccounts | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CredentialDialog({
  open,
  provider,
  onClose,
  onSuccess,
}: CredentialDialogProps) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [opencodeMode, setOpencodeMode] = useState<'api' | 'cookie'>('api');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear all secrets and form state on open/close
  useEffect(() => {
    if (open && provider) {
      const initial: Record<string, string> = {};
      if (provider.providerId === 'minimax') {
        initial.minimaxBillingMode = 'token_plan';
        initial.minimaxApiRegion = 'cn';
      } else if (provider.providerId === 'volcengine') {
        initial.volcengineRegion = 'cn-beijing';
      }
      setFields(initial);
      setOpencodeMode('api');
      setError(null);
    } else {
      setFields({});
      setError(null);
      setPending(false);
    }
  }, [open, provider]);

  if (!provider) return null;

  const isConfigured = provider.status === 'connected' || provider.accounts.length > 0;

  const handleFieldChange = (key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const payload: Record<string, any> = { ...fields };
      if (provider.providerId === 'opencode') {
        if (opencodeMode === 'cookie') {
          delete payload.name;
          delete payload.apiKey;
        } else {
          delete payload.cookie;
        }
      }

      if (provider.actions.saveCredential) {
        await provider.actions.saveCredential(payload);
      }
      setFields({});
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save credential');
    } finally {
      setPending(false);
    }
  };

  const renderFields = () => {
    switch (provider.providerId) {
      case 'notion':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Workspace ID
              </label>
              <Input
                type="text"
                placeholder="32 hex characters"
                value={fields.notionWorkspaceId || ''}
                onChange={(e) => handleFieldChange('notionWorkspaceId', e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Notion Cookie (token_v2)
              </label>
              <Input
                type="password"
                placeholder="Enter new cookie (not saved in browser history)"
                value={fields.notionCookie || ''}
                onChange={(e) => handleFieldChange('notionCookie', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      case 'minimax':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Billing Mode
              </label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={fields.minimaxBillingMode || 'token_plan'}
                onChange={(e) => handleFieldChange('minimaxBillingMode', e.target.value)}
              >
                <option value="token_plan">Token Plan</option>
                <option value="pay_as_you_go">Pay-as-you-go</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                API Region
              </label>
              <select
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={fields.minimaxApiRegion || 'cn'}
                onChange={(e) => handleFieldChange('minimaxApiRegion', e.target.value)}
              >
                <option value="cn">China (api.minimax.chat)</option>
                <option value="global">International (api.minimaxi.chat)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                API Key
              </label>
              <Input
                type="password"
                placeholder="Enter API key"
                value={fields.minimaxApiKey || ''}
                onChange={(e) => handleFieldChange('minimaxApiKey', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      case 'cursor':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Cursor Session Token
              </label>
              <Input
                type="password"
                placeholder="WorkosCursorSessionToken..."
                value={fields.token || ''}
                onChange={(e) => handleFieldChange('token', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      case 'mimo':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Xiaomi MiMo Cookie
              </label>
              <Input
                type="password"
                placeholder="serviceToken=... or cookie string"
                value={fields.cookie || ''}
                onChange={(e) => handleFieldChange('cookie', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      case 'opencode':
        return (
          <div className="space-y-3">
            <div className="flex gap-2 border-b border-border/60 pb-2">
              <Button
                type="button"
                size="sm"
                variant={opencodeMode === 'api' ? 'secondary' : 'ghost'}
                onClick={() => setOpencodeMode('api')}
                className="text-xs"
              >
                API Key Profile
              </Button>
              <Button
                type="button"
                size="sm"
                variant={opencodeMode === 'cookie' ? 'secondary' : 'ghost'}
                onClick={() => setOpencodeMode('cookie')}
                className="text-xs"
              >
                Browser Cookie
              </Button>
            </div>
            {opencodeMode === 'api' ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Profile Name
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Work, Personal"
                    value={fields.name || ''}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    API Key
                  </label>
                  <Input
                    type="password"
                    placeholder="sk-..."
                    value={fields.apiKey || ''}
                    onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Browser Cookie
                </label>
                <Input
                  type="password"
                  placeholder="Paste OpenCode session cookie"
                  value={fields.cookie || ''}
                  onChange={(e) => handleFieldChange('cookie', e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        );

      case 'openrouter':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Profile Name
              </label>
              <Input
                type="text"
                placeholder="e.g. Primary"
                value={fields.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                OpenRouter API Key
              </label>
              <Input
                type="password"
                placeholder="sk-or-v1-..."
                value={fields.apiKey || ''}
                onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      case 'thirdparty':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Profile Name
              </label>
              <Input
                type="text"
                placeholder="e.g. Local vLLM, DeepSeek API"
                value={fields.name || ''}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Base URL
              </label>
              <Input
                type="text"
                placeholder="https://api.openai.com/v1"
                value={fields.baseUrl || ''}
                onChange={(e) => handleFieldChange('baseUrl', e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                API Key
              </label>
              <Input
                type="password"
                placeholder="sk-..."
                value={fields.apiKey || ''}
                onChange={(e) => handleFieldChange('apiKey', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      case 'kimi':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Kimi Code API Key
              </label>
              <Input
                type="password"
                placeholder="sk-..."
                value={fields.kimiApiKey || ''}
                onChange={(e) => handleFieldChange('kimiApiKey', e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Web Access Token
              </label>
              <Input
                type="password"
                placeholder="ey..."
                value={fields.kimiWebAccessToken || ''}
                onChange={(e) => handleFieldChange('kimiWebAccessToken', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      case 'volcengine':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Access Key ID
              </label>
              <Input
                type="text"
                placeholder="AKLT..."
                value={fields.volcengineAccessKeyId || ''}
                onChange={(e) => handleFieldChange('volcengineAccessKeyId', e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Secret Access Key
              </label>
              <Input
                type="password"
                placeholder="Secret key"
                value={fields.volcengineSecretAccessKey || ''}
                onChange={(e) => handleFieldChange('volcengineSecretAccessKey', e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Region
              </label>
              <Input
                type="text"
                placeholder="cn-beijing"
                value={fields.volcengineRegion || ''}
                onChange={(e) => handleFieldChange('volcengineRegion', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      case 'deepseek':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                DeepSeek API Key
              </label>
              <Input
                type="password"
                placeholder="sk-..."
                value={fields.deepseekApiKey || ''}
                onChange={(e) => handleFieldChange('deepseekApiKey', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      case 'copilot':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Personal Access Token
              </label>
              <Input
                type="password"
                placeholder="ghu_... or ghp_..."
                value={fields.token || ''}
                onChange={(e) => handleFieldChange('token', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      case 'claude':
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Claude Web Session Cookie
              </label>
              <Input
                type="password"
                placeholder="sessionKey=..."
                value={fields.claudeWebCookie || ''}
                onChange={(e) => handleFieldChange('claudeWebCookie', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Credential Key / Token
              </label>
              <Input
                type="password"
                placeholder="Enter credential"
                value={fields.token || ''}
                onChange={(e) => handleFieldChange('token', e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogPopup className="max-w-md">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {provider.label} Credentials
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure credentials for {provider.label}. Secrets are saved securely and never exposed in the UI.
            </DialogDescription>
          </DialogHeader>

          <DialogPanel className="space-y-4 pt-2">
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Current status:</span>
              <Badge variant={isConfigured ? 'success' : 'outline'} size="sm">
                {isConfigured ? 'Configured (set)' : 'Not set'}
              </Badge>
            </div>

            {renderFields()}

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </DialogPanel>

          <DialogFooter className="gap-2 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={pending}
              className="gap-1.5"
            >
              {pending && <Spinner size="xs" />}
              Save Credential
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
