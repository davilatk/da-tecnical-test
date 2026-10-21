import { ListRolesUseCase } from '../application/list-roles.use-case.js';
import { MemoryRoles, RecordingLogger, TRACE_ID, adminActor, capture } from './fakes.js';

describe('ListRolesUseCase', () => {
  it('requires ADMIN and returns the catalog in contractual order', async () => {
    const roles = new MemoryRoles();
    roles.seed('USER', 'AUDITOR', 'ADMIN');
    const list = new ListRolesUseCase(roles, new RecordingLogger());

    await expect(list.execute(adminActor(), TRACE_ID)).resolves.toEqual(['ADMIN', 'USER', 'AUDITOR']);
    await expect(list.execute(adminActor({ roles: ['ADMIN', 'USER'] }), TRACE_ID)).resolves.toEqual([
      'ADMIN',
      'USER',
      'AUDITOR',
    ]);
    await expect(capture(list.execute(null, TRACE_ID))).resolves.toMatchObject({ status: 401, code: 'TOKEN_INVALID_OR_REVOKED' });
    await expect(capture(list.execute(adminActor({ roles: ['USER'] }), TRACE_ID))).resolves.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    await expect(capture(list.execute(adminActor({ roles: [] }), TRACE_ID))).resolves.toMatchObject({ status: 403 });
  });

  it('returns 500 when the catalog cannot be read', async () => {
    const roles = new MemoryRoles();
    roles.failList = new Error('db down');
    const list = new ListRolesUseCase(roles, new RecordingLogger());
    await expect(capture(list.execute(adminActor(), TRACE_ID))).resolves.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'internal error',
    });
  });
});
