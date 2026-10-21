import { DeleteUserUseCase } from '../application/delete-user.use-case.js';
import {
  ACTOR_ID,
  EVENT_ID,
  FixedClock,
  FixedIds,
  LATER,
  MemoryCache,
  MemoryUsers,
  RecordingLogger,
  RecordingPublisher,
  TRACE_ID,
  USER_ID,
  capture,
  sampleUser,
} from './fakes.js';

function useCase() {
  const users = new MemoryUsers();
  const cache = new MemoryCache();
  const events = new RecordingPublisher();
  const logger = new RecordingLogger();
  const deleteUser = new DeleteUserUseCase(users, cache, events, new FixedIds(), new FixedClock(LATER), logger);
  return { deleteUser, users, cache, events, logger };
}

describe('DeleteUserUseCase', () => {
  it('removes the user, publishes user.deleted and drops both cache keys', async () => {
    const { deleteUser, users, cache, events } = useCase();
    users.rows.push(sampleUser());

    await expect(deleteUser.execute(USER_ID, ACTOR_ID, TRACE_ID)).resolves.toBeUndefined();

    expect(users.rows).toHaveLength(0);
    expect(events.events).toEqual([
      {
        eventId: EVENT_ID,
        eventType: 'user.deleted',
        occurredAt: LATER.toISOString(),
        actorId: ACTOR_ID,
        targetId: USER_ID,
        serviceSource: 'user-service',
        payload: { email: 'ana@toka.com' },
      },
    ]);
    expect(cache.deleted).toEqual(['users:all', `users:id:${USER_ID}`]);
  });

  it('returns 404 USER_NOT_FOUND without publishing when the user is missing', async () => {
    const { deleteUser, events, cache } = useCase();
    const missing = await capture(deleteUser.execute(USER_ID, ACTOR_ID, TRACE_ID));
    expect(missing).toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });

    const blank = await capture(deleteUser.execute('   ', ACTOR_ID, TRACE_ID));
    expect(blank.code).toBe('USER_NOT_FOUND');
    expect(events.events).toHaveLength(0);
    expect(cache.deleted).toHaveLength(0);

    const raced = useCase();
    raced.users.rows.push(sampleUser());
    raced.users.deleteResult = false;
    const lost = await capture(raced.deleteUser.execute(USER_ID, ACTOR_ID, TRACE_ID));
    expect(lost.code).toBe('USER_NOT_FOUND');
    expect(raced.events.events).toHaveLength(0);
    expect(raced.users.rows).toHaveLength(1);
  });

  it('hides repository, broker and cache failures behind 500 INTERNAL_ERROR', async () => {
    const unauthenticated = useCase();
    expect((await capture(unauthenticated.deleteUser.execute(USER_ID, ' ', TRACE_ID))).code).toBe('TOKEN_INVALID_OR_REVOKED');

    const persistence = useCase();
    persistence.users.rows.push(sampleUser());
    persistence.users.failDelete = new Error('db down');
    expect((await capture(persistence.deleteUser.execute(USER_ID, ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');
    expect(persistence.events.events).toHaveLength(0);

    const broker = useCase();
    broker.users.rows.push(sampleUser());
    broker.events.fail = 'broker';
    expect((await capture(broker.deleteUser.execute(USER_ID, ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');
    expect(broker.logger.entries.at(-1)?.context).toEqual({ errorName: 'UnknownError' });

    const cache = useCase();
    cache.users.rows.push(sampleUser());
    cache.cache.failDelete = true;
    expect((await capture(cache.deleteUser.execute(USER_ID, ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');
    expect(cache.events.events[0]?.eventType).toBe('user.deleted');
  });
});
