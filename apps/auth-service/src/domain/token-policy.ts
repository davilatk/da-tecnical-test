import { DomainInvariantError } from './domain-invariant.error.js';

export const ACCESS_TOKEN_TTL_SECONDS = 3600;

export const TOKEN_BLACKLIST_PREFIX = 'auth:blacklist:';

export function blacklistKey(tokenId: string): string {
  if (tokenId.trim().length === 0) {
    throw new DomainInvariantError('tokenId must be a non-empty string');
  }
  return `${TOKEN_BLACKLIST_PREFIX}${tokenId}`;
}

export function remainingTokenLifeSeconds(exp: number, now: Date): number {
  if (!Number.isSafeInteger(exp) || Number.isNaN(now.getTime())) {
    throw new DomainInvariantError('token lifetime is invalid');
  }
  return exp - Math.floor(now.getTime() / 1000);
}

export function normalizeBlacklistTtl(remainingTtlSeconds: number): number | null {
  if (!Number.isSafeInteger(remainingTtlSeconds) || remainingTtlSeconds < 1) {
    return null;
  }
  return remainingTtlSeconds;
}
