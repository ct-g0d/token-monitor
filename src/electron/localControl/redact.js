'use strict';

const os = require('node:os');

const SECRET_KEY_NAMES = new Set([
  'apikey',
  'apitoken',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'secret',
  'clientsecret',
  'password',
  'cookie',
  'cookies',
  'authorization',
  'bearer',
  'copilotapitoken',
  'workoscursorsessiontoken',
  'geminiapikey',
  'credential',
  'credentials',
  'filecontent',
  'rawcontent'
]);

function escapeRegex(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSecretKey(key) {
  if (typeof key !== 'string') return false;
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return SECRET_KEY_NAMES.has(normalized);
}

function redactHomePath(str, homedir) {
  if (typeof str !== 'string' || !homedir) return str;
  const normalizedHome = homedir.replace(/\\/g, '/');
  const backslashHome = homedir.replace(/\//g, '\\');
  let result = str;
  result = result.split(new RegExp(escapeRegex(backslashHome), 'i')).join('~');
  result = result.split(new RegExp(escapeRegex(normalizedHome), 'i')).join('~');
  return result;
}

function redactStringValue(str, homedir) {
  if (typeof str !== 'string') return str;
  let result = redactHomePath(str, homedir);
  // Redact Bearer authorization header values
  result = result.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]');
  return result;
}

/**
 * Recursively sanitizes response payloads:
 * - Redacts raw credentials, tokens, cookies, secrets, passwords
 * - Replaces absolute home paths with '~'
 * - Preserves structural display/action metadata
 */
function sanitizeResponse(value, homedir = os.homedir()) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return redactStringValue(value, homedir);
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeResponse(item, homedir));
  }

  const sanitized = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSecretKey(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeResponse(child, homedir);
    }
  }
  return sanitized;
}

module.exports = {
  isSecretKey,
  redactHomePath,
  sanitizeResponse
};
