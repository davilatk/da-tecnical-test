import { EmailAlreadyRegisteredError } from '../application/email-already-registered.error.js';
import { RegisterAuthUseCase } from '../application/register-auth.use-case.js';
import type { UserRole } from '@toka/shared';
import {
  FixedClock,
  FixedIds,
  MemoryCredentials,
  MemoryRoles,
  NOW,
  RecordingLogger,
  TRACE_ID,
  USER_ID,
  capture,
} from './fakes.js';
import { FakeHasher } from './fakes.js';

function useCase(seeded: readonly UserRole[] = ['ADMIN', 'USER', 'AUDITOR']) {
  const credentials = new MemoryCredentials();
  const roles = new MemoryRoles();
  const hasher = new FakeHasher();
  const logger = new RecordingLogger();
  roles.seed(...seeded);
  const register = new RegisterAuthUseCase(credentials, roles, hasher, new FixedIds(), new FixedClock(NOW), logger);
  return { register, credentials, hasher, logger, roles };
}

describe('RegisterAuthUseCase', () => {
  it('creates a hashed credential, normalizes the email and defaults the role to USER', async () => {
    const { register, credentials, logger } = useCase();
    const user = await register.execute({ email: '  Ana@Toka.com ', password: 'Password123!' }, TRACE_ID);

    expect(user).toEqual({ id: USER_ID, email: 'ana@toka.com', roles: ['USER'] });
    expect(credentials.saved[0]?.passwordHash).toBe('hash-1');
    expect(credentials.saved[0]?.passwordHash).not.toBe('Password123!');
    expect(logger.serialized()).not.toContain('Password123!');
    expect(logger.entries[0]).toMatchObject({ level: 'info', message: 'credential registered', context: { userId: USER_ID } });
  });

  it('stores the requested unique roles', async () => {
    const { register, credentials } = useCase();
    const user = await register.execute(
      { email: 'ana@toka.com', password: 'Password123!', roles: ['AUDITOR', 'USER'] },
      TRACE_ID,
    );
    expect(user.roles).toEqual(['AUDITOR', 'USER']);
    expect(credentials.saved).toHaveLength(1);
  });

  it('responds 409 EMAIL_ALREADY_REGISTERED when the email already exists', async () => {
    const { register } = useCase();
    await register.execute({ email: 'ana@toka.com', password: 'Password123!' }, TRACE_ID);
    const error = await capture(register.execute({ email: 'ANA@toka.com', password: 'Otherpass1!' }, TRACE_ID));
    expect(error).toMatchObject({
      status: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'email is already registered',
      details: [{ field: 'email', message: 'is already registered' }],
    });
  });

  it('maps a unique constraint race to the same 409', async () => {
    const { register, credentials, logger } = useCase();
    credentials.failSave = new EmailAlreadyRegisteredError();
    const error = await capture(register.execute({ email: 'ana@toka.com', password: 'Password123!' }, TRACE_ID));
    expect(error.status).toBe(409);
    expect(error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('returns 400 VALIDATION_ERROR for an invalid email, password or role list', async () => {
    const { register, credentials } = useCase();
    const error = await capture(
      register.execute({ email: 'bad', password: 'short', roles: ['USER', 'USER'] }, TRACE_ID),
    );
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.map((detail) => detail.field)).toEqual(['email', 'password', 'roles']);
    expect(credentials.saved).toHaveLength(0);
  });

  it('rejects a role that is not present in the catalog and a missing default role', async () => {
    const missingDefault = useCase([]);
    const defaultError = await capture(missingDefault.register.execute({ email: 'ana@toka.com', password: 'Password123!' }, TRACE_ID));
    expect(defaultError).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', message: 'internal error' });

    const { register } = useCase(['USER']);
    const unknown = await capture(
      register.execute({ email: 'ana@toka.com', password: 'Password123!', roles: ['AUDITOR'] }, TRACE_ID),
    );
    expect(unknown).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
  });

  it('hides persistence and hashing failures behind 500 INTERNAL_ERROR', async () => {
    const first = useCase();
    first.credentials.failSave = new Error('duplicate key value');
    const saved = await capture(first.register.execute({ email: 'ana@toka.com', password: 'Password123!' }, TRACE_ID));
    expect(saved).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', message: 'internal error' });
    expect(saved.message).not.toContain('duplicate');

    const second = useCase();
    second.hasher.failHash = 'boom';
    const hashed = await capture(second.register.execute({ email: 'ana@toka.com', password: 'Password123!' }, TRACE_ID));
    expect(hashed.code).toBe('INTERNAL_ERROR');
    expect(second.logger.entries.at(-1)?.context).toEqual({ errorName: 'UnknownError' });
  });
});
