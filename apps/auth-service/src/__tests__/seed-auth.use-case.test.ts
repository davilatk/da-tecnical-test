import { USER_ROLES } from '@toka/shared';
import { SeedAuthUseCase, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_ROLES } from '../application/seed-auth.use-case.js';
import { parsePassword } from '../domain/input-rules.js';
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

describe('SeedAuthUseCase', () => {
  it('inserts ADMIN, USER and AUDITOR plus the hashed admin credential once', async () => {
    expect(parsePassword(SEED_ADMIN_PASSWORD).ok).toBe(true);
    const credentials = new MemoryCredentials();
    const roles = new MemoryRoles();
    const hasher = new FakeHasher();
    const logger = new RecordingLogger();
    const seed = new SeedAuthUseCase(credentials, roles, hasher, new FixedIds(), new FixedClock(NOW), logger);

    await seed.execute(TRACE_ID);
    await seed.execute(TRACE_ID);

    expect(roles.inserted).toEqual([...USER_ROLES, ...USER_ROLES]);
    expect([...roles.names]).toEqual([...USER_ROLES]);
    expect(credentials.saved).toHaveLength(1);
    const admin = credentials.saved[0];
    expect(admin?.id).toBe(USER_ID);
    expect(admin?.email).toBe(SEED_ADMIN_EMAIL);
    expect(admin?.roles).toEqual([...SEED_ADMIN_ROLES]);
    expect(admin?.passwordHash).toBe('hash-1');
    expect(admin?.passwordHash).not.toBe(SEED_ADMIN_PASSWORD);
    expect(logger.serialized()).not.toContain(SEED_ADMIN_PASSWORD);
    expect(logger.entries.map((entry) => entry.context)).toEqual([
      { email: SEED_ADMIN_EMAIL, created: true },
      { email: SEED_ADMIN_EMAIL, created: false },
    ]);
  });

  it('returns 500 when hashing the seed password fails and does not log the password', async () => {
    const hasher = new FakeHasher();
    hasher.failHash = new Error('hash failed');
    const logger = new RecordingLogger();
    const seed = new SeedAuthUseCase(
      new MemoryCredentials(),
      new MemoryRoles(),
      hasher,
      new FixedIds(),
      new FixedClock(NOW),
      logger,
    );
    await expect(capture(seed.execute(TRACE_ID))).resolves.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(logger.serialized()).not.toContain(SEED_ADMIN_PASSWORD);
  });
});
