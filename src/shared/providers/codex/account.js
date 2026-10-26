'use strict';

// Codex limits account wiring. Leaf module: no requires.
module.exports = {
  id: 'codex',
  fetch: 'fetchCodexLimits',
  fields: [
    {
      key: 'codexManagedAccounts',
      kind: 'managed',
      contextOverride: true,
      persist: 'never',
      initial: []
    }
  ],
  discover: (env, limits) => limits.resolveCodexAutomaticCredential(env),
  accountStatus: ({ settings, discovered }) => ({
    codexConfigured: Boolean(settings?.codexManagedAccounts?.length || discovered?.source),
    codexSource: settings?.codexManagedAccounts?.length ? 'settings' : (discovered?.source ?? ''),
    codexAutoDetected: Boolean(discovered?.source)
  }),
  urlPolicy: [
    { hosts: ['codex-resets.com'], exactPaths: ['', '/'] }
  ]
};
