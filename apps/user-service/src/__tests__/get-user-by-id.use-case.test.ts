import { GetUserByIdUseCase } from '../application/get-user-by-id.use-case.js';
import { USER_CACHE_TTL_SECONDS, userCacheKey } from '../domain/cache-keys.js';
import { ACTOR_ID, MemoryCache, MemoryUsers, RecordingLogger, TRACE_ID, USER_ID, VIEW, capture, sampleUser } from './fakes.js';

function useCase() {
  const users = new MemoryUsers();
  const cache = new MemoryCache();
  const logger = new RecordingLogger();
  const getUserById = new GetUserByIdUseCase(users, cache, logger);
  return { getUserById, users, cache, logger };
}

describe('GetUserByIdUseCase', () => {
  it('reads users:id:{id} and stores the user for 60 seconds on a cache miss', async () => {
    const { getUserById, users, cache } = useCase();
    users.rows.push(sampleUser());
    const key = userCacheKey(USER_ID);

    const user = await getUserById.execute(`  ${USER_ID}  `, ACTOR_ID, TRACE_ID);

    expect(user).toEqual(VIEW);
    expect(cache.reads).toEqual([key]);
    expect(cache.values.get(key)).toEqual({ value: JSON.stringify(VIEW), ttlSeconds: USER_CACHE_TTL_SECONDS });
    expect(cache.values.get(key)?.ttlSeconds).toBe(60);
  });

  it('returns the cached user without querying PostgreSQL', async () => {
    const { getUserById, users, cache } = useCase();
    users.failFindById = new Error('should not query');
    cache.values.set(userCacheKey(USER_ID), { value: JSON.stringify(VIEW), ttlSeconds: 60 });

    await expect(getUserById.execute(USER_ID, ACTOR_ID, TRACE_ID)).resolves.toEqual(VIEW);
  });

  it('responds 404 USER_NOT_FOUND and does not cache a miss', async () => {
    const { getUserById, cache } = useCase();
    const missing = await capture(getUserById.execute(USER_ID, ACTOR_ID, TRACE_ID));
    expect(missing).toMatchObject({ status: 404, code: 'USER_NOT_FOUND', message: 'user was not found' });
    expect(cache.values.size).toBe(0);

    const blank = await capture(getUserById.execute('   ', ACTOR_ID, TRACE_ID));
    expect(blank.code).toBe('USER_NOT_FOUND');
    expect(cache.reads).toEqual([userCacheKey(USER_ID)]);
  });

  it('treats a corrupt users:id entry as a miss and hides infrastructure failures', async () => {
    const { getUserById, users, cache } = useCase();
    users.rows.push(sampleUser());
    const key = userCacheKey(USER_ID);
    cache.values.set(key, { value: JSON.stringify({ ...VIEW, roles: [1], createdAt: NOW() }), ttlSeconds: 1 });
    await expect(getUserById.execute(USER_ID, ACTOR_ID, TRACE_ID)).resolves.toEqual(VIEW);

    cache.values.set(key, { value: 'not-json', ttlSeconds: 1 });
    await expect(getUserById.execute(USER_ID, ACTOR_ID, TRACE_ID)).resolves.toEqual(VIEW);

    cache.values.set(key, { value: '{}', ttlSeconds: 1 });
    await expect(getUserById.execute(USER_ID, ACTOR_ID, TRACE_ID)).resolves.toEqual(VIEW);

    const unauthenticated = await capture(getUserById.execute(USER_ID, ' ', TRACE_ID));
    expect(unauthenticated.code).toBe('TOKEN_INVALID_OR_REVOKED');

    users.failFindById = new Error('db down');
    cache.values.clear();
    expect((await capture(getUserById.execute(USER_ID, ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');
  });
});

function NOW(): string {
  return '2026-10-21T17:24:00.000Z';
}
