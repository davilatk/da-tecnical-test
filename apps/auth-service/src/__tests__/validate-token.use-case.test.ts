import { ContractError, JsonWebTokenVerifier, type AccessTokenVerifier, type JwtPayload } from '@toka/shared';
import { ValidateTokenUseCase } from '../application/validate-token.use-case.js';
import type { AuthUser } from '../domain/auth-credential.js';
import { JwtAccessTokenIssuer } from '../infrastructure/security/jwt-access-token-issuer.js';
import { RedisTokenBlacklist, type RedisKeyValueStore } from '../infrastructure/redis/redis-token-blacklist.js';
import { FixedClock, JWT_SECRET, NOW, RecordingLogger, TRACE_ID, USER_ID, capture } from './fakes.js';

const user: AuthUser = { id: USER_ID, email: 'admin@toka.com', roles: ['ADMIN'] };

class MemoryRedis implements RedisKeyValueStore {
  readonly values = new Map<string, { value: string; ttl: number }>();

  async set(key: string, value: string, expiryMode: 'EX', ttlSeconds: number): Promise<unknown> {
    this.values.set(key, { value, ttl: expiryMode === 'EX' ? ttlSeconds : 0 });
    return 'OK';
  }

  async exists(key: string): Promise<number> {
    return this.values.has(key) ? 1 : 0;
  }

  async connect(): Promise<void> {
    return undefined;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async quit(): Promise<unknown> {
    return 'OK';
  }
}

function validateWith(redis: MemoryRedis, clock: FixedClock): ValidateTokenUseCase {
  return new ValidateTokenUseCase(
    new JsonWebTokenVerifier(),
    new RedisTokenBlacklist(redis),
    { jwtSecret: JWT_SECRET },
    clock,
    new RecordingLogger(),
  );
}

describe('ValidateTokenUseCase', () => {
  it('accepts a verifiable token and rejects missing, invalid, expired and blacklisted tokens', async () => {
    const redis = new MemoryRedis();
    const clock = new FixedClock(NOW);
    const blacklist = new RedisTokenBlacklist(redis);
    const validate = validateWith(redis, clock);
    const issued = new JwtAccessTokenIssuer(JWT_SECRET).issue(user, NOW);

    await expect(validate.execute(issued.accessToken, TRACE_ID)).resolves.toEqual({ valid: true, user });
    await expect(capture(validate.execute(null, TRACE_ID))).resolves.toMatchObject({
      status: 401,
      code: 'TOKEN_INVALID_OR_REVOKED',
      message: 'token is invalid or revoked',
      details: [],
    });
    await expect(capture(validate.execute('not-a-jwt', TRACE_ID))).resolves.toMatchObject({
      code: 'TOKEN_INVALID_OR_REVOKED',
    });

    clock.advance(3600 * 1000);
    await expect(capture(validate.execute(issued.accessToken, TRACE_ID))).resolves.toMatchObject({
      code: 'TOKEN_INVALID_OR_REVOKED',
    });

    clock.advance(-3600 * 1000);
    await blacklist.revokeUntilExpiry(issued.accessToken, issued.payload.exp, NOW);
    expect([...redis.values.keys()]).toEqual([`auth:blacklist:${issued.accessToken}`]);
    expect(redis.values.get(`auth:blacklist:${issued.accessToken}`)?.ttl).toBe(3600);
    await expect(capture(validate.execute(issued.accessToken, TRACE_ID))).resolves.toMatchObject({
      code: 'TOKEN_INVALID_OR_REVOKED',
    });
  });

  it('returns 500 when the blacklist or the verifier fails unexpectedly', async () => {
    const failingRedis = new MemoryRedis();
    failingRedis.exists = () => Promise.reject(new Error('redis down'));
    const validate = validateWith(failingRedis, new FixedClock(NOW));
    const token = new JwtAccessTokenIssuer(JWT_SECRET).issue(user, NOW).accessToken;
    await expect(capture(validate.execute(token, TRACE_ID))).resolves.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'internal error',
    });

    const verifier: AccessTokenVerifier = {
      verify(): JwtPayload {
        throw new Error('unexpected');
      },
    };
    const broken = new ValidateTokenUseCase(verifier, new RedisTokenBlacklist(new MemoryRedis()), { jwtSecret: JWT_SECRET }, new FixedClock(NOW), new RecordingLogger());
    await expect(capture(broken.execute('token', TRACE_ID))).resolves.toMatchObject({ code: 'INTERNAL_ERROR' });

    const contract: AccessTokenVerifier = {
      verify(): JwtPayload {
        throw new ContractError('jwt signature is invalid');
      },
    };
    const rejected = new ValidateTokenUseCase(contract, new RedisTokenBlacklist(new MemoryRedis()), { jwtSecret: JWT_SECRET }, new FixedClock(NOW), new RecordingLogger());
    await expect(capture(rejected.execute('token', TRACE_ID))).resolves.toMatchObject({ code: 'TOKEN_INVALID_OR_REVOKED' });
  });
});
