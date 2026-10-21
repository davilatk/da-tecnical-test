export const USERS_LIST_CACHE_KEY = 'users:all';

export const USER_CACHE_TTL_SECONDS = 60;

export function userCacheKey(id: string): string {
  return `users:id:${id}`;
}
