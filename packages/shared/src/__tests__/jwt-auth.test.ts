import { createHmac } from 'node:crypto';
import { AuthenticateAccessToken } from '../application/authenticate-access-token.js';
import type { AccessTokenVerifier } from '../application/access-token-verifier.js';
import { ContractError } from '../domain/contract-error.js';
import type { JwtPayload } from '../domain/jwt-payload.js';
import { createJwtMiddleware, type JwtHttpRequest, type JwtHttpResponse } from '../presentation/jwt-auth.middleware.js';
import {
  assertJwtPayload,
  createJwtAuthMiddleware,
  hasAnyRole,
  verifyAccessToken,
  type ApiFailure,
} from '../index.js';
import { EXP, IAT, JWT_SECRET, NOW, TRACE_ID, USER_ID, signHs256, validJwtPayload } from './fixtures.js';

function responseRecorder(): {
  response: JwtHttpResponse;
  state: { status?: number; body?: ApiFailure; contentType?: string };
} {
  const state: { status?: number; body?: ApiFailure; contentType?: string } = {};
  const response: JwtHttpResponse = {
    setHeader(name, value) {
      if (name === 'Content-Type') {
        state.contentType = value;
      }
    },
    status(code) {
      state.status = code;
      return {
        json(body) {
          state.body = body;
        },
      };
    },
  };
  return { response, state };
}

describe('distributed JWT validation', () => {
  const payload = validJwtPayload();
  const token = signHs256(payload);

  it('accepts the access token payload from the contract', () => {
    const verified = verifyAccessToken(token, JWT_SECRET, NOW);
    expect(verified).toEqual({
      sub: USER_ID,
      email: 'admin@toka.com',
      roles: ['ADMIN'],
      iat: IAT,
      exp: EXP,
    });
    expect(Object.keys(verified).sort()).toEqual(['email', 'exp', 'iat', 'roles', 'sub']);
    expect(hasAnyRole(verified, ['AUDITOR', 'ADMIN'])).toBe(true);
    expect(hasAnyRole(verified, ['USER'])).toBe(false);
  });

  it('rejects malformed, expired, mistyped and non-HS256 tokens', () => {
    expect(() => verifyAccessToken(signHs256(validJwtPayload({ iss: 'toka' })), JWT_SECRET, NOW)).toThrow(ContractError);
    expect(() => verifyAccessToken(signHs256(validJwtPayload({ email: undefined })), JWT_SECRET, NOW)).toThrow(
      ContractError,
    );
    expect(() => verifyAccessToken(signHs256(validJwtPayload({ email: 'not-an-email' })), JWT_SECRET, NOW)).toThrow(
      ContractError,
    );
    expect(() => verifyAccessToken(signHs256(validJwtPayload({ sub: '   ' })), JWT_SECRET, NOW)).toThrow(ContractError);
    expect(() => verifyAccessToken(signHs256(validJwtPayload({ roles: [] })), JWT_SECRET, NOW)).toThrow(ContractError);
    expect(() => verifyAccessToken(signHs256(validJwtPayload({ roles: ['USER', 'USER'] })), JWT_SECRET, NOW)).toThrow(
      ContractError,
    );
    expect(() => verifyAccessToken(signHs256(validJwtPayload({ roles: ['ROOT'] })), JWT_SECRET, NOW)).toThrow(
      ContractError,
    );
    expect(() => verifyAccessToken(signHs256(validJwtPayload({ roles: 'ADMIN' })), JWT_SECRET, NOW)).toThrow(
      ContractError,
    );
    expect(() => verifyAccessToken(signHs256(validJwtPayload({ iat: EXP, exp: EXP })), JWT_SECRET, NOW)).toThrow(
      ContractError,
    );
    expect(() => verifyAccessToken(signHs256(validJwtPayload({ iat: 1.5, exp: EXP })), JWT_SECRET, NOW)).toThrow(
      ContractError,
    );
    expect(() => verifyAccessToken(token, JWT_SECRET, new Date('2026-10-21T18:24:00.000Z'))).toThrow(ContractError);
    expect(() => verifyAccessToken(token, 'other-secret', NOW)).toThrow(ContractError);
    expect(() => verifyAccessToken(`${token}x`, JWT_SECRET, NOW)).toThrow(ContractError);
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(() => verifyAccessToken(`${noneHeader}.${body}.`, JWT_SECRET, NOW)).toThrow(ContractError);
    const stringHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const stringBody = Buffer.from(JSON.stringify('hello')).toString('base64url');
    const stringSignature = createHmac('sha256', JWT_SECRET)
      .update(`${stringHeader}.${stringBody}`)
      .digest('base64url');
    expect(() => verifyAccessToken(`${stringHeader}.${stringBody}.${stringSignature}`, JWT_SECRET, NOW)).toThrow(
      ContractError,
    );
    expect(() => assertJwtPayload('hello', Math.floor(NOW.getTime() / 1000))).toThrow(ContractError);
    expect(() => verifyAccessToken(token, '', NOW)).toThrow(ContractError);
    expect(() => verifyAccessToken(token, JWT_SECRET, new Date(Number.NaN))).toThrow(ContractError);
    expect(() => assertJwtPayload(validJwtPayload({ exp: IAT }), Math.floor(NOW.getTime() / 1000))).toThrow(
      /greater than iat/,
    );
  });

  it('authenticates a bearer token and returns the contractual error envelope', async () => {
    const middleware = createJwtAuthMiddleware({
      secret: JWT_SECRET,
      now: () => NOW,
      requiredRoles: ['ADMIN'],
    });
    const request: JwtHttpRequest = {
      headers: { Authorization: `Bearer ${token}`, 'X-Trace-Id': `  ${TRACE_ID}  ` },
    };
    const { response, state } = responseRecorder();
    const next = jest.fn();

    await middleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(request.traceId).toBe(TRACE_ID);
    expect(request.accessToken).toBe(token);
    expect(request.accessTokenPayload).toMatchObject({ sub: USER_ID, email: 'admin@toka.com', roles: ['ADMIN'] });
    expect(state.body).toBeUndefined();
  });

  it('rejects missing, revoked and under-privileged tokens without leaking the token', async () => {
    const middleware = createJwtAuthMiddleware({
      secret: JWT_SECRET,
      now: () => NOW,
      requiredRoles: ['AUDITOR'],
      isRevoked: ({ payload }) => payload.email === 'revoked@toka.com',
    });
    const userToken = signHs256(validJwtPayload({ email: 'ana@toka.com', roles: ['USER'] }));
    const cases: Array<{ headers?: Record<string, unknown>; traceId?: string; status: number; code: string }> = [
      { status: 401, code: 'TOKEN_INVALID_OR_REVOKED' },
      { headers: { authorization: 'Basic abc' }, status: 401, code: 'TOKEN_INVALID_OR_REVOKED' },
      { headers: { authorization: `Bearer ${token}x` }, status: 401, code: 'TOKEN_INVALID_OR_REVOKED' },
      { headers: { authorization: ['Bearer', token] }, status: 401, code: 'TOKEN_INVALID_OR_REVOKED' },
      { headers: { authorization: `bearer ${token} extra` }, status: 401, code: 'TOKEN_INVALID_OR_REVOKED' },
      {
        headers: { authorization: `Bearer ${signHs256(validJwtPayload({ email: 'revoked@toka.com' }))}` },
        status: 401,
        code: 'TOKEN_INVALID_OR_REVOKED',
      },
      { headers: { authorization: `Bearer ${userToken}` }, status: 403, code: 'FORBIDDEN' },
    ];

    for (const item of cases) {
      const request: JwtHttpRequest = { headers: item.headers, traceId: item.traceId };
      const { response, state } = responseRecorder();
      const next = jest.fn();
      await middleware(request, response, next);
      expect(next).not.toHaveBeenCalled();
      expect(state.status).toBe(item.status);
      expect(state.contentType).toBe('application/json');
      expect(state.body).toMatchObject({
        success: false,
        error: { code: item.code, details: [] },
        traceId: expect.stringMatching(/^trc_[0-9A-HJKMNP-TV-Z]{26}$/),
      });
      expect(JSON.stringify(state.body)).not.toContain(userToken);
      expect(JSON.stringify(state.body)).not.toContain(JWT_SECRET);
    }
  });

  it('prefers an existing trace id, reads header arrays and hides verifier failures', async () => {
    const middleware = createJwtAuthMiddleware({
      secret: JWT_SECRET,
      now: () => NOW,
      createTraceId: () => 'trc_generated',
    });
    const request: JwtHttpRequest = {
      traceId: '   ',
      headers: { 'x-trace-id': ['  trc_from_header  ', 'ignored'] },
      header: (name) => (name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined),
    };
    const { response, state } = responseRecorder();
    const next = jest.fn();
    await middleware(request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(request.traceId).toBe('trc_from_header');
    expect(state.status).toBeUndefined();

    const exploding = {
      async execute(): Promise<never> {
        throw new Error('redis password leaked');
      },
    } as unknown as AuthenticateAccessToken;
    const guarded = createJwtMiddleware(exploding, {
      secret: JWT_SECRET,
      now: () => NOW,
      createTraceId: () => TRACE_ID,
    });
    const failed = responseRecorder();
    const failedNext = jest.fn();
    await guarded({ headers: { authorization: `Bearer ${token}` } }, failed.response, failedNext);
    expect(failedNext).not.toHaveBeenCalled();
    expect(failed.state.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'internal error', details: [] },
      traceId: TRACE_ID,
    });
    expect(JSON.stringify(failed.state.body)).not.toContain('password');
  });

  it('maps revocation and unexpected verifier failures to safe HTTP codes', async () => {
    const verifier: AccessTokenVerifier = {
      verify(received, secret, now) {
        if (received === 'boom') {
          throw new Error(`keystore down ${secret}`);
        }
        return assertJwtPayload(validJwtPayload(), Math.floor(now.getTime() / 1000));
      },
    };
    const useCase = new AuthenticateAccessToken(verifier);
    await expect(
      useCase.execute({
        token: 'boom',
        secret: JWT_SECRET,
        now: NOW,
      }),
    ).resolves.toEqual({
      status: 'rejected',
      httpStatus: 500,
      code: 'INTERNAL_ERROR',
      message: 'internal error',
    });
    await expect(
      useCase.execute({
        token,
        secret: JWT_SECRET,
        now: NOW,
        isRevoked: () => {
          throw new Error('redis timeout');
        },
      }),
    ).resolves.toMatchObject({ httpStatus: 500, code: 'INTERNAL_ERROR' });
    await expect(
      useCase.execute({
        token: null,
        secret: JWT_SECRET,
        now: NOW,
      }),
    ).resolves.toMatchObject({ httpStatus: 401, code: 'TOKEN_INVALID_OR_REVOKED' });
    expect(() => createJwtAuthMiddleware({ secret: '   ' })).toThrow(ContractError);
    expect(() => createJwtAuthMiddleware({ secret: JWT_SECRET, requiredRoles: ['ROOT' as 'ADMIN'] })).toThrow(
      ContractError,
    );
    await expect(
      useCase.execute({
        token,
        secret: JWT_SECRET,
        now: NOW,
        requiredRoles: [],
      }),
    ).resolves.toMatchObject({ status: 'authenticated', payload: { sub: USER_ID } });
  });
});
