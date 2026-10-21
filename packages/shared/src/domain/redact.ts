import { isPlainObject } from './formats.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'passwd',
  'secret',
  'jwt',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'authorization',
  'credential',
  'credentials',
  'apikey',
  'api_key',
  'jwt_secret',
  'client_secret',
  'gemini_api_key',
]);

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  const compact = normalized.replace(/[_-]/g, '');
  return (
    SENSITIVE_KEYS.has(normalized) ||
    SENSITIVE_KEYS.has(compact) ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('jwt') ||
    normalized.includes('credential')
  );
}

export function redactJwt(value: string): string {
  return value.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');
}

export function redactSensitive(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactJwt(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = isSensitiveKey(key) ? '[REDACTED]' : redactSensitive(nested);
  }
  return output;
}
