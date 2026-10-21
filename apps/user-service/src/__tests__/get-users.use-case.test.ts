import { GetUsersUseCase } from '../application/get-users.use-case.js';
import { USERS_LIST_CACHE_KEY, USER_CACHE_TTL_SECONDS } from '../domain/cache-keys.js';
import { ACTOR_ID, MemoryCache, MemoryUsers, NOW, RecordingLogger, TRACE_ID, VIEW, capture, sampleUser } from './fakes.js';

function useCase() {
  const users = new MemoryUsers();
  const cache = new MemoryCache();
  const logger = new RecordingLogger();
  const getUsers = new GetUsersUseCase(users, cache, logger);
  return { getUsers, users, cache, logger };
}

describe('GetUsersUseCase', () => {
  it('reads users:all and stores the list for 60 seconds on a cache miss', async () => {
    const { getUsers, users, cache } = useCase();
    users.rows.push(sampleUser());

    const listed = await getUsers.execute(ACTOR_ID, TRACE_ID);

    expect(cache.reads).toEqual([USERS_LIST_CACHE_KEY]);
    expect(listed).toEqual([VIEW]);
    expect(cache.values.get(USERS_LIST_CACHE_KEY)).toEqual({
      value: JSON.stringify([VIEW]),
      ttlSeconds: USER_CACHE_TTL_SECONDS,
    });

    const again = await getUsers.execute(ACTOR_ID, TRACE_ID);
    expect(again).toEqual([VIEW]);
    users.failFindAll = new Error('should not query');
    await expect(getUsers.execute(ACTOR_ID, TRACE_ID)).resolves.toEqual([VIEW]);
  });

  it('does not query PostgreSQL when the cached list is valid', async () => {
    const { getUsers, users, cache } = useCase();
    users.failFindAll = new Error('should not query');
    cache.values.set(USERS_LIST_CACHE_KEY, { value: JSON.stringify([VIEW]), ttlSeconds: 60 });

    await expect(getUsers.execute(ACTOR_ID, TRACE_ID)).resolves.toEqual([VIEW]);
  });

  it('treats a corrupt users:all entry as a miss and replaces it', async () => {
    const { getUsers, users, cache } = useCase();
    users.rows.push(sampleUser());
    cache.values.set(USERS_LIST_CACHE_KEY, { value: '{}', ttlSeconds: 1 });
    await expect(getUsers.execute(ACTOR_ID, TRACE_ID)).resolves.toEqual([VIEW]);

    cache.values.set(USERS_LIST_CACHE_KEY, { value: 'not-json', ttlSeconds: 1 });
    await expect(getUsers.execute(ACTOR_ID, TRACE_ID)).resolves.toEqual([VIEW]);

    cache.values.set(USERS_LIST_CACHE_KEY, {
      value: JSON.stringify([{ ...VIEW, roles: [1] }]),
      ttlSeconds: 1,
    });
    await expect(getUsers.execute(ACTOR_ID, TRACE_ID)).resolves.toEqual([VIEW]);
    expect(cache.values.get(USERS_LIST_CACHE_KEY)?.ttlSeconds).toBe(60);
  });

  it('caches an empty list and hides actor or infrastructure failures', async () => {
    const { getUsers, cache, users, logger } = useCase();
    await expect(getUsers.execute(ACTOR_ID, TRACE_ID)).resolves.toEqual([]);
    expect(cache.values.get(USERS_LIST_CACHE_KEY)?.value).toBe('[]');
    expect(logger.entries[0]?.context).toEqual({ source: 'database', count: 0 });

    const unauthenticated = await capture(getUsers.execute('  ', TRACE_ID));
    expect(unauthenticated).toMatchObject({ status: 401, code: 'TOKEN_INVALID_OR_REVOKED' });

    users.failFindAll = new Error('db down');
    cache.values.clear();
    expect((await capture(getUsers.execute(ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');

    users.failFindAll = null;
    cache.failSet = true;
    expect((await capture(getUsers.execute(ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');
  });
});
