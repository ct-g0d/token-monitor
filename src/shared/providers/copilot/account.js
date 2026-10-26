'use strict';

// GitHub Copilot limits account wiring. Leaf module: no requires.
module.exports = {
  id: 'copilot',
  fetch: 'fetchCopilotLimits',
  fields: [
    {
      key: 'copilotApiToken',
      kind: 'credential',
      storePath: ['providers', 'copilot', 'apiToken'],
      resolve: 'copilotToken'
    },
    {
      key: 'copilotEnterpriseHost',
      kind: 'setting',
      normalize: (value) => String(value || '').trim().replace(/^https?:\/\//i, '').split('/')[0].toLowerCase()
    }
  ],
  discover: (env, limits) => limits.resolveCopilotAutomaticCredential(env),
  // Copilot's sign-in flow owns its pending state, so there is no pendingKey.
  status: {
    credential: 'copilotApiToken',
    configuredKey: 'copilotApiTokenConfigured',
    sourceKey: 'copilotApiTokenSource'
  },
  accountStatus: ({ settings, env, discovered, limits }) => ({
    copilotApiTokenConfigured: Boolean(settings?.copilotApiToken || limits.copilotToken(env) || discovered?.source),
    copilotApiTokenSource: settings?.copilotApiToken
      ? 'settings'
      : (env.COPILOT_API_TOKEN || env.GITHUB_COPILOT_TOKEN)
        ? 'env'
        : (discovered?.source ?? ''),
    copilotAutoDetected: Boolean(discovered?.source)
  })
};
