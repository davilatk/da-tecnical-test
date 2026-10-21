import type { TokenBlacklist } from '../../application/ports.js';
import { blacklistKey, normalizeBlacklistTtl, remainingTokenLifeSeconds } from '../../domain/token-policy.js';

export interface RedisKeyValueStore {
  set(key: string, value: string, expiryMode: 'EX', ttlSeconds: number): Promise<unknown>;
  exists(key: string): Promise<number>;
  connect(): Promise<void>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

export class RedisTokenBlacklist implements TokenBlacklist {
  constructor(private readonly redis: RedisKeyValueStore) {}

  async revoke(tokenId: string, remainingTtlSeconds: number): Promise<void> {
    const ttl = normalizeBlacklistTtl(remainingTtlSeconds);
    if (ttl === null) {
      return;
    }
    await this.redis.set(blacklistKey(tokenId), '1', 'EX', ttl);
  }

  async revokeUntilExpiry(accessToken: string, exp: number, now: Date): Promise<void> {
    await this.revoke(accessToken, remainingTokenLifeSeconds(exp, now));
  }

  async isRevoked(tokenId: string): Promise<boolean> {
    const existing = await this.redis.exists(blacklistKey(tokenId));
    return existing > 0;
  }
}
