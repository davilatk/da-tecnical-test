import { EmailAlreadyRegisteredError } from '../application/email-already-registered.error.js';
import { CreateUserUseCase } from '../application/create-user.use-case.js';
import {
  ACTOR_ID,
  EVENT_ID,
  FakeAuthRegistrar,
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
} from './fakes.js';

function useCase(now = NOW) {
  const users = new MemoryUsers();
  const auth = new FakeAuthRegistrar();
  const cache = new MemoryCache();
  const events = new RecordingPublisher();
  const logger = new RecordingLogger();
  const clock = new FixedClock(now);
  const createUser = new CreateUserUseCase(users, auth, cache, events, new FixedIds(), clock, logger);
  return { createUser, users, auth, cache, events, logger, clock };
}

const command = {
  email: '  Ana@Toka.com ',
  password: 'Password123!',
  fullName: '  Ana Pérez  ',
  department: ' Engineering ',
};

describe('CreateUserUseCase', () => {
  it('registers in auth-service before persisting the returned id and roles', async () => {
    const { createUser, users, auth, cache, events, logger } = useCase();
    auth.result = { status: 'registered', user: { id: USER_ID, email: 'ana@toka.com', roles: ['AUDITOR'] } };

    const user = await createUser.execute({ ...command, roles: ['USER'] }, ACTOR_ID, TRACE_ID);

    expect(auth.calls).toEqual([
      { email: 'ana@toka.com', password: 'Password123!', roles: ['USER'], traceId: TRACE_ID },
    ]);
    expect(user).toEqual({
      id: USER_ID,
      email: 'ana@toka.com',
      fullName: 'Ana Pérez',
      department: 'Engineering',
      status: 'ACTIVE',
      roles: ['AUDITOR'],
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(users.rows[0]?.toView()).toEqual(user);
    expect(JSON.stringify(users.rows[0]?.toView())).not.toContain('Password123!');
    expect(logger.serialized()).not.toContain('Password123!');
    expect(events.events).toEqual([
      {
        eventId: EVENT_ID,
        eventType: 'user.created',
        occurredAt: NOW.toISOString(),
        actorId: ACTOR_ID,
        targetId: USER_ID,
        serviceSource: 'user-service',
        payload: {
          email: 'ana@toka.com',
          fullName: 'Ana Pérez',
          department: 'Engineering',
          status: 'ACTIVE',
          roles: ['AUDITOR'],
        },
      },
    ]);
    expect(cache.deleted).toEqual(['users:all', `users:id:${USER_ID}`]);
    expect(cache.values.size).toBe(0);
  });

  it('defaults the remote role list to USER when roles are omitted', async () => {
    const { createUser, auth } = useCase();
    const user = await createUser.execute(command, `  ${ACTOR_ID}  `, TRACE_ID);
    expect(auth.calls[0]?.roles).toEqual(['USER']);
    expect(user.roles).toEqual(['USER']);
    expect(user.id).toBe(USER_ID);
  });

  it('does not persist a local user when the remote registration fails', async () => {
    const { createUser, users, auth, events, cache, logger } = useCase();
    auth.result = {
      status: 'rejected',
      error: {
        status: 409,
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'email is already registered',
        details: [{ field: 'email', message: 'is already registered' }],
      },
    };

    const error = await capture(createUser.execute(command, ACTOR_ID, TRACE_ID));

    expect(error).toMatchObject({
      status: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'email is already registered',
      details: [{ field: 'email', message: 'is already registered' }],
    });
    expect(users.rows).toHaveLength(0);
    expect(events.events).toHaveLength(0);
    expect(cache.deleted).toHaveLength(0);
    expect(logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
    expect(logger.serialized()).not.toContain('Password123!');
  });

  it('returns 400 VALIDATION_ERROR and skips auth when the request is invalid', async () => {
    const { createUser, auth, users } = useCase();
    const error = await capture(
      createUser.execute(
        { email: 'bad', password: 'short', fullName: ' ', department: '', roles: ['USER', 'USER'] },
        ACTOR_ID,
        TRACE_ID,
      ),
    );
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.map((detail) => detail.field)).toEqual(['email', 'password', 'fullName', 'department', 'roles']);
    expect(auth.calls).toHaveLength(0);
    expect(users.rows).toHaveLength(0);
  });

  it('rejects a missing actor and hides auth, persistence and broker failures', async () => {
    const unauthenticated = useCase();
    const missingActor = await capture(unauthenticated.createUser.execute(command, '   ', TRACE_ID));
    expect(missingActor).toMatchObject({ status: 401, code: 'TOKEN_INVALID_OR_REVOKED' });
    expect(unauthenticated.auth.calls).toHaveLength(0);

    const remote = useCase();
    remote.auth.fail = 'boom';
    const remoteError = await capture(remote.createUser.execute(command, ACTOR_ID, TRACE_ID));
    expect(remoteError).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', message: 'internal error' });
    expect(remote.users.rows).toHaveLength(0);
    expect(remote.logger.entries.at(-1)?.context).toEqual({ errorName: 'UnknownError' });

    const invalidIdentity = useCase();
    invalidIdentity.auth.result = { status: 'registered', user: { id: '   ', email: 'ana@toka.com', roles: ['USER'] } };
    const identity = await capture(invalidIdentity.createUser.execute(command, ACTOR_ID, TRACE_ID));
    expect(identity.code).toBe('INTERNAL_ERROR');
    expect(invalidIdentity.users.rows).toHaveLength(0);

    const duplicate = useCase();
    duplicate.users.failSave = new EmailAlreadyRegisteredError();
    const conflict = await capture(duplicate.createUser.execute(command, ACTOR_ID, TRACE_ID));
    expect(conflict).toMatchObject({ status: 409, code: 'EMAIL_ALREADY_REGISTERED' });
    expect(duplicate.events.events).toHaveLength(0);

    const persistence = useCase();
    persistence.users.failSave = new Error('connection reset');
    expect((await capture(persistence.createUser.execute(command, ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');

    const broker = useCase();
    broker.events.fail = new Error('broker down');
    expect((await capture(broker.createUser.execute(command, ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');
    expect(broker.users.rows).toHaveLength(1);
    expect(broker.cache.deleted).toHaveLength(0);

    const cache = useCase(LATER);
    cache.cache.failDelete = true;
    expect((await capture(cache.createUser.execute(command, ACTOR_ID, TRACE_ID))).code).toBe('INTERNAL_ERROR');
    expect(cache.events.events).toHaveLength(1);
  });
});
