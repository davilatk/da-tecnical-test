import type { CacheStore } from '../../application/ports.js';

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  connect(): Promise<void>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

export class RedisUserCache implements CacheStore {
  constructor(private readonly redis: RedisClient) {}

  async get(key: string): Promise<string | null> {
    const value = await this.redis.get(key);
    return value === null || value.length === 0 ? null : value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
