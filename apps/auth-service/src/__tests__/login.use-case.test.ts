import { parseDomainEvent, verifyAccessToken } from '@toka/shared';
import { AuthCredential } from '../domain/auth-credential.js';
import { LoginUseCase } from '../application/login.use-case.js';
import { JwtAccessTokenIssuer } from '../infrastructure/security/jwt-access-token-issuer.js';
import {
  FixedClock,
  FixedIds,
  JWT_SECRET,
  MemoryCredentials,
  NOW,
  RecordingLogger,
  RecordingPublisher,
  ScriptedIssuer,
  TRACE_ID,
  USER_ID,
  capture,
} from './fakes.js';
import { FakeHasher } from './fakes.js';

async function setup() {
  const credentials = new MemoryCredentials();
  const hasher = new FakeHasher();
  const publisher = new RecordingPublisher();
  const logger = new RecordingLogger();
  const clock = new FixedClock(NOW);
  const passwordHash = await hasher.hash('Password123!');
  await credentials.save(
    AuthCredential.create({
      id: USER_ID,
      email: 'ana@toka.com',
      passwordHash,
      roles: ['USER', 'AUDITOR'],
      now: NOW,
    }),
  );
  const login = new LoginUseCase(
    credentials,
    hasher,
    new JwtAccessTokenIssuer(JWT_SECRET),
    publisher,
    new FixedIds(),
    clock,
    logger,
  );
  return { login, publisher, logger };
}

describe('LoginUseCase', () => {
  it('emits a JWT with the contractual payload and publishes auth.user.logged_in', async () => {
    const { login, publisher, logger } = await setup();
    const result = await login.execute({ email: ' Ana@Toka.com ', password: 'Password123!' }, TRACE_ID);

    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(3600);
    expect(result.user).toEqual({ id: USER_ID, email: 'ana@toka.com', roles: ['USER', 'AUDITOR'] });
    const payload = verifyAccessToken(result.accessToken, JWT_SECRET, NOW);
    expect(payload).toEqual({
      sub: USER_ID,
      email: 'ana@toka.com',
      roles: ['USER', 'AUDITOR'],
      iat: payload.iat,
      exp: payload.exp,
    });
    expect(Object.keys(payload).sort()).toEqual(['email', 'exp', 'iat', 'roles', 'sub']);
    expect(payload.exp - payload.iat).toBe(result.expiresIn);

    expect(publisher.events).toHaveLength(1);
    const event = parseDomainEvent(publisher.events[0]);
    expect(event).toMatchObject({
      eventType: 'auth.user.logged_in',
      actorId: USER_ID,
      targetId: USER_ID,
      serviceSource: 'auth-service',
      payload: { email: 'ana@toka.com' },
    });
    expect(logger.entries[0]).toMatchObject({ message: 'login accepted', context: { userId: USER_ID } });
    expect(logger.serialized()).not.toContain(result.accessToken);
    expect(logger.serialized()).not.toContain('Password123!');
  });

  it('returns the same 401 INVALID_CREDENTIALS for an unknown email and a wrong password', async () => {
    const { login, publisher } = await setup();
    const unknown = await capture(login.execute({ email: 'missing@toka.com', password: 'Password123!' }, TRACE_ID));
    const wrong = await capture(login.execute({ email: 'ana@toka.com', password: 'short' }, TRACE_ID));
    expect(unknown).toEqual(wrong);
    expect(unknown).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'invalid credentials',
      details: [],
    });
    expect(unknown.message).not.toContain('email');
    expect(unknown.message).not.toContain('password');
    expect(JSON.stringify(unknown)).not.toContain('missing@toka.com');
    expect(publisher.events).toHaveLength(0);
  });

  it('returns 400 when the login request is malformed and 500 when publishing fails', async () => {
    const { login, publisher } = await setup();
    const invalid = await capture(login.execute({ email: 'bad', password: '' }, TRACE_ID));
    expect(invalid).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(invalid.details.map((detail) => detail.field)).toEqual(['email', 'password']);

    publisher.fail = new Error('broker down');
    const failed = await capture(login.execute({ email: 'ana@toka.com', password: 'Password123!' }, TRACE_ID));
    expect(failed).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', message: 'internal error' });
  });

  it('returns 500 when the issued token does not match its declared lifetime', async () => {
    const credentials = new MemoryCredentials();
    const hasher = new FakeHasher();
    const passwordHash = await hasher.hash('Password123!');
    await credentials.save(
      AuthCredential.create({ id: USER_ID, email: 'ana@toka.com', passwordHash, roles: ['USER'], now: NOW }),
    );
    const issuer = new ScriptedIssuer();
    issuer.issued = {
      accessToken: 'token',
      expiresIn: 10,
      payload: { sub: USER_ID, email: 'ana@toka.com', roles: ['USER'], iat: 100, exp: 3700 },
    };
    const login = new LoginUseCase(
      credentials,
      hasher,
      issuer,
      new RecordingPublisher(),
      new FixedIds(),
      new FixedClock(NOW),
      new RecordingLogger(),
    );
    const error = await capture(login.execute({ email: 'ana@toka.com', password: 'Password123!' }, TRACE_ID));
    expect(error.code).toBe('INTERNAL_ERROR');
  });
});
