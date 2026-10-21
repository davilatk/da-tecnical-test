import type { CacheStore } from './ports.js';
import { USERS_LIST_CACHE_KEY, userCacheKey } from '../domain/cache-keys.js';

export async function invalidateUserCache(cache: CacheStore, id: string): Promise<void> {
  await cache.delete(USERS_LIST_CACHE_KEY);
  await cache.delete(userCacheKey(id));
}
