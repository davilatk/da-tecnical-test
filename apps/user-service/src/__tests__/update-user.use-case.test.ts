import { UpdateUserUseCase } from '../application/update-user.use-case.js';
import {
  ACTOR_ID,
  EVENT_ID,
  FixedClock,
  FixedIds,
  LATER,
  MemoryCache,
  MemoryUsers,
  NOW,
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
  const clock = new FixedClock(LATER);
  const updateUser = new UpdateUserUseCase(users, cache, events, new FixedIds(), clock, logger);
  return { updateUser, users, cache, events, logger, clock };
}

describe('UpdateUserUseCase', () => {
  it('updates the allowed fields, publishes user.updated and drops both cache keys', async () => {
    const { updateUser, users, cache, events } = useCase();
    users.rows.push(sampleUser());

    const updated = await updateUser.execute(
      USER_ID,
      { status: 'INACTIVE', fullName: 'Ana María Pérez', department: 'Platform' },
      ACTOR_ID,
      TRACE_ID,
    );

    expect(updated).toEqual({
      id: USER_ID,
      email: 'ana@toka.com',
      fullName: 'Ana María Pérez',
      department: 'Platform',
      status: 'INACTIVE',
      roles: ['USER'],
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
    expect(events.events).toEqual([
      {
        eventId: EVENT_ID,
        eventType: 'user.updated',
        occurredAt: LATER.toISOString(),
        actorId: ACTOR_ID,
        targetId: USER_ID,
        serviceSource: 'user-service',
        payload: { changedFields: ['fullName', 'department', 'status'] },
      },
    ]);
    expect(cache.deleted).toEqual(['users:all', `users:id:${USER_ID}`]);
    expect(users.rows[0]?.toView().roles).toEqual(['USER']);
  });

  it('rejects an empty body and fields outside fullName, department and status', async () => {
    const { updateUser, users, events, cache } = useCase();
    users.rows.push(sampleUser());

    const empty = await capture(updateUser.execute(USER_ID, {}, ACTOR_ID, TRACE_ID));
    expect(empty).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'must include at least one of fullName, department or status',
      details: [{ field: null, message: 'must include at least one of fullName, department or status' }],
    });

    const unknown = await capture(updateUser.execute(USER_ID, { email: 'other@toka.com', fullName: '' }, ACTOR_ID, TRACE_ID));
    expect(unknown.status).toBe(400);
    expect(unknown.details.map((detail) => detail.field)).toEqual(['email', 'fullName']);

    const status = await capture(updateUser.execute(USER_ID, { status: 'PAUSED' }, ACTOR_ID, TRACE_ID));
    expect(status.details).toEqual([{ field: 'status', message: 'must be ACTIVE or INACTIVE' }]);

    const department = await capture(updateUser.execute(USER_ID, { department: 'd'.repeat(101) }, ACTOR_ID, TRACE_ID));
    expect(department.code).toBe('VALIDATION_ERROR');

    expect(await capture(updateUser.execute(USER_ID, null, ACTOR_ID, TRACE_ID))).toMatchObject({ status: 400 });
    expect(await capture(updateUser.execute(USER_ID, ['fullName'], ACTOR_ID, TRACE_ID))).toMatchObject({ status: 400 });
    expect(users.rows[0]?.toView().fullName).toBe('Ana Pérez');
    expect(events.events).toHaveLength(0);
    expect(cache.deleted).toHaveLength(0);
  });

  it('returns 404 when the user does not exist and 500 when a dependency fails', async () => {
    const missing = useCase();
    const notFound = await capture(missing.updateUser.execute(USER_ID, { department: 'Platform' }, ACTOR_ID, TRACE_ID));
    expect(notFound).toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
    expect(missing.events.events).toHaveLength(0);

    const blankId = await capture(missing.updateUser.execute('  ', { department: 'Platform' }, ACTOR_ID, TRACE_ID));
    expect(blankId.code).toBe('USER_NOT_FOUND');

    const emptyActor = await capture(missing.updateUser.execute(USER_ID, { department: 'Platform' }, ' ', TRACE_ID));
    expect(emptyActor.code).toBe('TOKEN_INVALID_OR_REVOKED');

    const saved = useCase();
    saved.users.rows.push(sampleUser());
    saved.users.failSave = new Error('db down');
    expect((await capture(saved.updateUser.execute(USER_ID, { fullName: 'Ana' }, ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');
    expect(saved.events.events).toHaveLength(0);

    const broker = useCase();
    broker.users.rows.push(sampleUser());
    broker.events.fail = new Error('broker down');
    expect((await capture(broker.updateUser.execute(USER_ID, { status: 'INACTIVE' }, ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');

    const cache = useCase();
    cache.users.rows.push(sampleUser());
    cache.cache.failDelete = true;
    expect((await capture(cache.updateUser.execute(USER_ID, { department: 'Platform' }, ACTOR_ID, TRACE_ID))).code).toBe(
      'INTERNAL_ERROR',
    );
    expect(cache.events.events[0]?.eventType).toBe('user.updated');
  });
});
