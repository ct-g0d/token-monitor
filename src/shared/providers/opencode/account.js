'use strict';

// OpenCode limits account wiring. Leaf module: no requires.
module.exports = {
  id: 'opencode',
  fetch: 'fetchOpenCodeLimits',
  fields: [
    {
      key: 'opencodeCookie',
      kind: 'credential',
      storePath: ['providers', 'opencode', 'cookie'],
      envFallback: ['TOKEN_MONITOR_OPENCODE_COOKIE'],
      persist: 'spread',
      project: 'set'
    },
    {
      key: 'opencodeProfiles',
      kind: 'profiles',
      storePath: ['providers', 'opencode', 'profiles'],
      configDefault: {},
      persist: 'spread',
      project: 'redact'
    }
  ],
  discover: (env, limits) => limits.resolveOpenCodeAutomaticCredential(env),
  accountStatus: ({ settings, env, discovered }) => ({
    opencodeCookieConfigured: Boolean(settings?.opencodeCookie || env.TOKEN_MONITOR_OPENCODE_COOKIE || discovered?.source),
    opencodeCookieSource: settings?.opencodeCookie
      ? 'settings'
      : env.TOKEN_MONITOR_OPENCODE_COOKIE
        ? 'env'
        : (discovered?.source ?? ''),
    opencodeAutoDetected: Boolean(discovered?.source)
  }),
  extraSettingKeys: ['opencodeLocalLimitsEnabled'],
  urlPolicy: [
    { hosts: ['opencode.ai', 'www.opencode.ai'] }
  ]
};
