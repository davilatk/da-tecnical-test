import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { lastValueFrom, of } from 'rxjs';
import {
  ContractError,
  type AccessTokenVerifier,
  type JwtPayload,
} from '@toka/shared';
import { ApplicationError } from '../application/application-error.js';
import { AssignRoleUseCase } from '../application/assign-role.use-case.js';
import { ListRolesUseCase } from '../application/list-roles.use-case.js';
import { LoginUseCase } from '../application/login.use-case.js';
import { RegisterAuthUseCase } from '../application/register-auth.use-case.js';
import { ValidateTokenUseCase } from '../application/validate-token.use-case.js';
import { AssignRoleDto } from '../presentation/dto/assign-role.dto.js';
import { LoginDto } from '../presentation/dto/login.dto.js';
import { RegisterAuthDto } from '../presentation/dto/register-auth.dto.js';
import { AuthController } from '../presentation/auth.controller.js';
import { ApiExceptionFilter } from '../presentation/http/api-exception.filter.js';
import { readBearerToken } from '../presentation/http/bearer-token.js';
import { JwtAuthGuard, type RoleReflector } from '../presentation/http/jwt-auth.guard.js';
import { SuccessEnvelopeInterceptor } from '../presentation/http/success-envelope.interceptor.js';
import { traceMiddleware } from '../presentation/http/trace.middleware.js';
import { validationExceptionFactory } from '../presentation/http/validation-exception.factory.js';
import { RolesController } from '../presentation/roles.controller.js';
import { JWT_SECRET, OTHER_ID, RecordingLogger, TRACE_ID, USER_ID } from './fakes.js';

const adminPayload: JwtPayload = {
  sub: OTHER_ID,
  email: 'admin@toka.com',
  roles: ['ADMIN'],
  iat: 1_700_000_000,
  exp: 1_700_003_600,
};

describe('HTTP presentation', () => {
  it('validates the contractual request DTOs', async () => {
    const register = plainToInstance(RegisterAuthDto, { email: '  ANA@toka.com ', password: 'Password123!' });
    expect(await validate(register)).toHaveLength(0);
    expect(register.email).toBe('ana@toka.com');
    expect(register.roles).toBeUndefined();

    const duplicated = plainToInstance(RegisterAuthDto, {
      email: 'ana@toka.com',
      password: 'short',
      roles: ['USER', 'USER'],
    });
    const registerErrors = validationExceptionFactory(await validate(duplicated));
    expect(registerErrors).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(registerErrors.details.map((detail) => detail.field)).toEqual(expect.arrayContaining(['password', 'roles']));

    const extra = plainToInstance(RegisterAuthDto, { email: 'ana@toka.com', password: 'Password123!', extra: true });
    const forbiddenField = validationExceptionFactory(
      await validate(extra, { whitelist: true, forbidNonWhitelisted: true }),
    );
    expect(forbiddenField.details).toContainEqual({ field: 'extra', message: 'is not allowed' });

    const login = plainToInstance(LoginDto, { email: 'ADMIN@toka.com', password: 'x' });
    expect(await validate(login)).toHaveLength(0);
    expect(login.email).toBe('admin@toka.com');
    const badLogin = validationExceptionFactory(await validate(plainToInstance(LoginDto, { email: 'bad', password: '' })));
    expect(badLogin.details.map((detail) => detail.field)).toEqual(expect.arrayContaining(['email', 'password']));

    const assign = plainToInstance(AssignRoleDto, { userId: USER_ID, role: 'AUDITOR' });
    expect(await validate(assign)).toHaveLength(0);
    const badAssign = validationExceptionFactory(await validate(plainToInstance(AssignRoleDto, { userId: '', role: 'ROOT' })));
    expect(badAssign.code).toBe('VALIDATION_ERROR');

    const nested = new ValidationError();
    nested.property = 'roles';
    nested.children = [Object.assign(new ValidationError(), { property: '0', constraints: { isIn: 'must be an existing ADMIN, USER or AUDITOR value' } })];
    const empty = new ValidationError();
    empty.property = 'note';
    empty.constraints = { empty: '   ' };
    expect(validationExceptionFactory([nested, empty]).details).toEqual([
      { field: 'roles.0', message: 'must be an existing ADMIN, USER or AUDITOR value' },
    ]);
    expect(validationExceptionFactory([]).message).toBe('request validation failed');
  });

  it('propagates or creates a trace id and reads bearer tokens', () => {
    const request: { headers: Record<string, unknown>; header?: (name: string) => string | undefined; traceId?: string } = {
      headers: { 'X-Trace-Id': '  trc_header  ' },
    };
    traceMiddleware(request, {}, () => undefined);
    expect(request.traceId).toBe('trc_header');

    const fromMethod = { headers: {}, header: (name: string) => (name === 'x-trace-id' ? 'trc_method' : undefined), traceId: undefined };
    traceMiddleware(fromMethod, {}, () => undefined);
    expect(fromMethod.traceId).toBe('trc_method');

    const generated = { headers: { 'x-trace-id': ['', 'ignored'] } };
    traceMiddleware(generated, {}, () => undefined);
    expect(generated.traceId).toMatch(/^trc_/);
    const withoutHeaders: { header: () => string; traceId?: string } = { header: () => '   ' };
    traceMiddleware(withoutHeaders, {}, () => undefined);
    expect(withoutHeaders.traceId).toMatch(/^trc_/);

    const arrayTrace = { headers: { 'x-trace-id': [' trc_array '] } };
    traceMiddleware(arrayTrace, {}, () => undefined);
    expect(arrayTrace.traceId).toBe('trc_array');

    expect(readBearerToken({ Authorization: 'Bearer token-1' })).toBe('token-1');
    expect(readBearerToken({ authorization: ['Bearer token-2'] })).toBe('token-2');
    expect(readBearerToken({ authorization: 'Basic abc' })).toBeNull();
    expect(readBearerToken({ authorization: 5 })).toBeNull();
    expect(readBearerToken(undefined)).toBeNull();
  });

  it('wraps success and failure responses in the shared envelope', async () => {
    const headers: Record<string, string> = {};
    const state: { status?: number; body?: unknown } = {};
    const response = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      status(code: number) {
        state.status = code;
        return {
          json(body: unknown) {
            state.body = body;
          },
        };
      },
    };
    const logger = new RecordingLogger();
    const filter = new ApiExceptionFilter(logger);
    filter.catch(new ApplicationError(409, 'EMAIL_ALREADY_REGISTERED', 'email is already registered', [{ field: 'email', message: 'is already registered' }]), {
      switchToHttp: () => ({
        getRequest: () => ({ traceId: TRACE_ID }),
        getResponse: () => response,
      }),
    });
    expect(state).toEqual({
      status: 409,
      body: {
        success: false,
        error: {
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'email is already registered',
          details: [{ field: 'email', message: 'is already registered' }],
        },
        traceId: TRACE_ID,
      },
    });
    expect(headers['Content-Type']).toBe('application/json');

    filter.catch(new Error('password=Admin123! stack'), {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => response,
      }),
    });
    expect(state.status).toBe(500);
    expect(JSON.stringify(state.body)).not.toContain('Admin123!');
    expect(state.body).toMatchObject({ success: false, error: { code: 'INTERNAL_ERROR', message: 'internal error', details: [] } });

    const interceptor = new SuccessEnvelopeInterceptor();
    const success = await lastValueFrom(
      interceptor.intercept(
        {
          switchToHttp: () => ({
            getRequest: () => ({ traceId: TRACE_ID }),
            getResponse: () => response,
          }),
        },
        { handle: () => of({ valid: true, user: { id: USER_ID, email: 'ana@toka.com', roles: ['USER'] } }) },
      ),
    );
    expect(success).toEqual({
      success: true,
      data: { valid: true, user: { id: USER_ID, email: 'ana@toka.com', roles: ['USER'] } },
      traceId: TRACE_ID,
    });
    const generated = await lastValueFrom(
      interceptor.intercept(
        {
          switchToHttp: () => ({
            getRequest: () => ({ traceId: '   ' }),
            getResponse: () => response,
          }),
        },
        { handle: () => of(['ADMIN', 'USER', 'AUDITOR']) },
      ),
    );
    expect(generated).toMatchObject({ success: true, data: ['ADMIN', 'USER', 'AUDITOR'] });
    expect(logger.entries.some((entry) => entry.level === 'error')).toBe(true);
  });

  it('delegates auth and role controllers to the use cases', async () => {
    const user = { id: USER_ID, email: 'ana@toka.com', roles: ['USER'] as const };
    const register = { execute: jest.fn().mockResolvedValue(user) };
    const login = { execute: jest.fn().mockResolvedValue({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user }) };
    const validate = { execute: jest.fn().mockResolvedValue({ valid: true, user }) };
    const auth = new AuthController(
      register as unknown as RegisterAuthUseCase,
      login as unknown as LoginUseCase,
      validate as unknown as ValidateTokenUseCase,
    );
    await expect(
      auth.register({ email: 'ana@toka.com', password: 'Password123!', roles: ['USER'] }, { traceId: TRACE_ID }),
    ).resolves.toEqual(user);
    await expect(auth.register({ email: 'ana@toka.com', password: 'Password123!' }, { traceId: '  ' })).resolves.toEqual(user);
    expect(login.execute).not.toHaveBeenCalled();
    await auth.loginWithPassword({ email: 'ana@toka.com', password: 'Password123!' }, { traceId: TRACE_ID });
    await auth.validate({ headers: { authorization: 'Bearer token-1' }, traceId: TRACE_ID });
    expect(validate.execute).toHaveBeenCalledWith('token-1', TRACE_ID);

    const list = { execute: jest.fn().mockResolvedValue(['ADMIN', 'USER', 'AUDITOR']) };
    const assign = { execute: jest.fn().mockResolvedValue({ ...user, roles: ['USER', 'AUDITOR'] }) };
    const roles = new RolesController(list as unknown as ListRolesUseCase, assign as unknown as AssignRoleUseCase);
    const actor = { id: OTHER_ID, email: 'admin@toka.com', roles: ['ADMIN'] as const };
    await expect(roles.list({ traceId: TRACE_ID, actor })).resolves.toEqual(['ADMIN', 'USER', 'AUDITOR']);
    await expect(roles.list({})).resolves.toEqual(['ADMIN', 'USER', 'AUDITOR']);
    expect(list.execute).toHaveBeenLastCalledWith(null, expect.stringMatching(/^trc_/));
    await roles.assign({ userId: USER_ID, role: 'AUDITOR' }, { traceId: TRACE_ID, actor });
    expect(assign.execute).toHaveBeenCalledWith(actor, { userId: USER_ID, role: 'AUDITOR' }, TRACE_ID);
  });

  it('rejects protected routes without a valid ADMIN token', async () => {
    const blacklist = { isRevoked: jest.fn().mockResolvedValue(false), revoke: jest.fn() };
    const reflector = (roles?: readonly string[]): RoleReflector => ({
      getAllAndOverride: () => roles as never,
    });
    const verifier: AccessTokenVerifier = {
      verify(token: string): JwtPayload {
        if (token === 'bad') {
          throw new ContractError('jwt signature is invalid');
        }
        if (token === 'boom') {
          throw new Error('unexpected');
        }
        return token === 'user' ? { ...adminPayload, roles: ['USER'] } : adminPayload;
      },
    };
    const guard = new JwtAuthGuard(reflector(['ADMIN']), verifier, blacklist, { jwtSecret: JWT_SECRET }, new RecordingLogger());
    const request: { headers?: Record<string, unknown>; traceId?: string; actor?: unknown; accessToken?: string } = {
      headers: { authorization: 'Bearer admin' },
      traceId: TRACE_ID,
    };
    await expect(
      guard.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({ getRequest: () => request }),
      }),
    ).resolves.toBe(true);
    expect(request.actor).toMatchObject({ id: OTHER_ID, roles: ['ADMIN'] });
    expect(request.accessToken).toBe('admin');

    await expect(
      guard.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({ getRequest: () => ({ headers: {}, traceId: TRACE_ID }) }),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'TOKEN_INVALID_OR_REVOKED' });
    await expect(
      guard.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer bad' }, traceId: TRACE_ID }) }),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'TOKEN_INVALID_OR_REVOKED' });

    const userGuard = new JwtAuthGuard(reflector(['ADMIN']), verifier, blacklist, { jwtSecret: JWT_SECRET }, new RecordingLogger());
    await expect(
      userGuard.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer user' }, traceId: TRACE_ID }) }),
      }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });

    blacklist.isRevoked.mockResolvedValue(true);
    await expect(
      guard.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer admin' }, traceId: TRACE_ID }) }),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'TOKEN_INVALID_OR_REVOKED' });

    const open = new JwtAuthGuard(reflector(undefined), verifier, blacklist, { jwtSecret: JWT_SECRET }, new RecordingLogger());
    blacklist.isRevoked.mockResolvedValue(false);
    await expect(
      open.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer user' }, traceId: '  ' }) }),
      }),
    ).resolves.toBe(true);

    const broken = new JwtAuthGuard(reflector(['ADMIN']), verifier, blacklist, { jwtSecret: JWT_SECRET }, new RecordingLogger(), () => {
      throw new Error('clock');
    });
    await expect(
      broken.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer admin' }, traceId: TRACE_ID }) }),
      }),
    ).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });

    const internal = new JwtAuthGuard(reflector(['ADMIN']), verifier, {
      isRevoked: () => Promise.reject(new Error('redis')),
      revoke: () => Promise.resolve(),
    }, { jwtSecret: JWT_SECRET }, new RecordingLogger());
    await expect(
      internal.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer admin' }, traceId: TRACE_ID }) }),
      }),
    ).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    const unexpected = new JwtAuthGuard(reflector(['ADMIN']), verifier, blacklist, { jwtSecret: JWT_SECRET }, new RecordingLogger());
    await expect(
      unexpected.canActivate({
        getHandler: () => 'handler',
        getClass: () => 'class',
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer boom' }, traceId: TRACE_ID }) }),
      }),
    ).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });
});
