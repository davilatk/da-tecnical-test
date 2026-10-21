import { parseDomainEvent } from '@toka/shared';
import { AssignRoleUseCase } from '../application/assign-role.use-case.js';
import { AuthCredential } from '../domain/auth-credential.js';
import {
  FixedClock,
  FixedIds,
  MemoryCredentials,
  MemoryRoles,
  NOW,
  OTHER_ID,
  RecordingLogger,
  RecordingPublisher,
  TRACE_ID,
  USER_ID,
  adminActor,
  capture,
} from './fakes.js';

function setup() {
  const credentials = new MemoryCredentials();
  const roles = new MemoryRoles();
  roles.seed('ADMIN', 'USER', 'AUDITOR');
  const publisher = new RecordingPublisher();
  const logger = new RecordingLogger();
  credentials.saved.push(
    AuthCredential.create({ id: USER_ID, email: 'ana@toka.com', passwordHash: 'hash-1', roles: ['USER'], now: NOW }),
  );
  const assign = new AssignRoleUseCase(credentials, roles, publisher, new FixedIds(), new FixedClock(NOW), logger);
  return { assign, credentials, publisher, roles };
}

describe('AssignRoleUseCase', () => {
  it('requires an ADMIN actor', async () => {
    const { assign, publisher } = setup();
    await expect(capture(assign.execute(null, { userId: USER_ID, role: 'AUDITOR' }, TRACE_ID))).resolves.toMatchObject({
      status: 401,
      code: 'TOKEN_INVALID_OR_REVOKED',
    });
    await expect(
      capture(assign.execute(adminActor({ id: '   ' }), { userId: USER_ID, role: 'AUDITOR' }, TRACE_ID)),
    ).resolves.toMatchObject({ status: 401, code: 'TOKEN_INVALID_OR_REVOKED' });
    await expect(
      capture(assign.execute(adminActor({ roles: ['USER'] }), { userId: USER_ID, role: 'AUDITOR' }, TRACE_ID)),
    ).resolves.toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'forbidden' });
    await expect(
      capture(assign.execute(adminActor({ roles: ['AUDITOR'] }), { userId: USER_ID, role: 'AUDITOR' }, TRACE_ID)),
    ).resolves.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(publisher.events).toHaveLength(0);
  });

  it('publishes a single auth.role.assigned event only when the role changes', async () => {
    const { assign, publisher, credentials } = setup();
    const actor = adminActor();
    const first = await assign.execute(actor, { userId: USER_ID, role: 'AUDITOR' }, TRACE_ID);
    const second = await assign.execute(actor, { userId: `  ${USER_ID}  `, role: 'AUDITOR' }, TRACE_ID);
    const third = await assign.execute(actor, { userId: USER_ID, role: 'ADMIN' }, TRACE_ID);

    expect(first).toEqual({ id: USER_ID, email: 'ana@toka.com', roles: ['USER', 'AUDITOR'] });
    expect(second).toEqual(first);
    expect(third.roles).toEqual(['USER', 'AUDITOR', 'ADMIN']);
    expect(publisher.events).toHaveLength(2);
    expect(parseDomainEvent(publisher.events[0])).toMatchObject({
      eventType: 'auth.role.assigned',
      actorId: OTHER_ID,
      targetId: USER_ID,
      serviceSource: 'auth-service',
      payload: { role: 'AUDITOR' },
    });
    expect(parseDomainEvent(publisher.events[1]).payload).toEqual({ role: 'ADMIN' });
    expect(credentials.saved).toHaveLength(1);
    expect(JSON.stringify(first)).not.toContain('hash-1');
  });

  it('returns 404 when the credential does not exist and 400 for invalid input', async () => {
    const { assign, roles } = setup();
    const missing = await capture(assign.execute(adminActor(), { userId: OTHER_ID, role: 'USER' }, TRACE_ID));
    expect(missing).toMatchObject({ status: 404, code: 'AUTH_USER_NOT_FOUND', message: 'auth user was not found' });

    const invalid = await capture(assign.execute(adminActor(), { userId: '  ', role: 'ROOT' }, TRACE_ID));
    expect(invalid).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(invalid.details.map((detail) => detail.field)).toEqual(['userId', 'role']);

    roles.names.delete('AUDITOR');
    const unknownRole = await capture(assign.execute(adminActor(), { userId: USER_ID, role: 'AUDITOR' }, TRACE_ID));
    expect(unknownRole).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', details: [{ field: 'role' }] });
  });

  it('returns 500 when saving or publishing fails', async () => {
    const { assign, credentials, publisher } = setup();
    credentials.failSave = new Error('db down');
    await expect(capture(assign.execute(adminActor(), { userId: USER_ID, role: 'AUDITOR' }, TRACE_ID))).resolves.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    credentials.failSave = null;
    publisher.fail = new Error('broker down');
    await expect(capture(assign.execute(adminActor(), { userId: USER_ID, role: 'AUDITOR' }, TRACE_ID))).resolves.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
