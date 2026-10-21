import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { lastValueFrom, of } from 'rxjs';
import { ContractError, type AccessTokenVerifier, type JwtPayload } from '@toka/shared';
import { ApplicationError } from '../application/application-error.js';
import { CreateUserUseCase } from '../application/create-user.use-case.js';
import { DeleteUserUseCase } from '../application/delete-user.use-case.js';
import { GetUserByIdUseCase } from '../application/get-user-by-id.use-case.js';
import { GetUsersUseCase } from '../application/get-users.use-case.js';
import { UpdateUserUseCase } from '../application/update-user.use-case.js';
import { CreateUserDto } from '../presentation/dto/create-user.dto.js';
import { UpdateUserDto } from '../presentation/dto/update-user.dto.js';
import { UsersController } from '../presentation/users.controller.js';
import { ApiExceptionFilter } from '../presentation/http/api-exception.filter.js';
import { readBearerToken } from '../presentation/http/bearer-token.js';
import { JwtAuthGuard } from '../presentation/http/jwt-auth.guard.js';
import { SuccessEnvelopeInterceptor } from '../presentation/http/success-envelope.interceptor.js';
import { traceMiddleware } from '../presentation/http/trace.middleware.js';
import { validationExceptionFactory } from '../presentation/http/validation-exception.factory.js';
import { ACTOR_ID, JWT_SECRET, RecordingLogger, TRACE_ID, USER_ID, VIEW } from './fakes.js';

const payload: JwtPayload = {
  sub: ACTOR_ID,
  email: 'admin@toka.com',
  roles: ['ADMIN'],
  iat: 1_700_000_000,
  exp: 1_700_003_600,
};

describe('HTTP presentation', () => {
  it('validates the create and update DTOs', async () => {
    const create = plainToInstance(CreateUserDto, {
      email: '  ANA@toka.com ',
      password: 'Password123!',
      fullName: '  Ana Pérez  ',
      department: ' Engineering ',
    });
    expect(await validate(create)).toHaveLength(0);
    expect(create.email).toBe('ana@toka.com');
    expect(create.fullName).toBe('Ana Pérez');
    expect(create.department).toBe('Engineering');
    expect(create.roles).toBeUndefined();

    const invalid = plainToInstance(CreateUserDto, {
      email: 'bad',
      password: 'short',
      fullName: '',
      department: '',
      roles: ['USER', 'USER'],
    });
    const createErrors = validationExceptionFactory(await validate(invalid));
    expect(createErrors).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(createErrors.details.map((detail) => detail.field)).toEqual(
      expect.arrayContaining(['email', 'password', 'fullName', 'department', 'roles']),
    );

    const extra = plainToInstance(CreateUserDto, { ...create, status: 'ACTIVE' });
    const forbidden = validationExceptionFactory(await validate(extra, { whitelist: true, forbidNonWhitelisted: true }));
    expect(forbidden.details).toContainEqual({ field: 'status', message: 'is not allowed' });

    const update = plainToInstance(UpdateUserDto, { fullName: ' Ana ', department: 'Platform', status: 'INACTIVE' });
    expect(await validate(update)).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateUserDto, {}))).toHaveLength(0);
    const badUpdate = validationExceptionFactory(
      await validate(plainToInstance(UpdateUserDto, { fullName: '', status: 'PAUSED' }), { whitelist: true, forbidNonWhitelisted: true }),
    );
    expect(badUpdate.code).toBe('VALIDATION_ERROR');
    const unknownUpdate = validationExceptionFactory(
      await validate(plainToInstance(UpdateUserDto, { email: 'ana@toka.com' }), { whitelist: true, forbidNonWhitelisted: true }),
    );
    expect(unknownUpdate.details).toContainEqual({ field: 'email', message: 'is not allowed' });

    const nested = new ValidationError();
    nested.property = 'roles';
    nested.children = [Object.assign(new ValidationError(), { property: '0', constraints: { isIn: 'must be a non-empty list of unique ADMIN, USER or AUDITOR values' } })];
    const empty = new ValidationError();
    empty.property = 'note';
    empty.constraints = { empty: '   ', whitelistValidation: 'should not exist' };
    expect(validationExceptionFactory([nested, empty]).details).toEqual([
      { field: 'roles.0', message: 'must be a non-empty list of unique ADMIN, USER or AUDITOR values' },
      { field: 'note', message: 'is not allowed' },
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

  it('wraps success responses and leaves 204 without a body', async () => {
    const headers: Record<string, string> = {};
    const state: { status?: number; body?: unknown } = {};
    const response = {
      statusCode: 200,
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
    filter.catch(new ApplicationError(404, 'USER_NOT_FOUND', 'user was not found'), {
      switchToHttp: () => ({
        getRequest: () => ({ traceId: TRACE_ID }),
        getResponse: () => response,
      }),
    });
    expect(state.body).toMatchObject({ success: false, error: { code: 'USER_NOT_FOUND' }, traceId: TRACE_ID });
    expect(headers['Content-Type']).toBe('application/json');

    filter.catch(new Error('password=Password123!'), {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => response }),
    });
    expect(state.status).toBe(500);
    expect(JSON.stringify(state.body)).not.toContain('Password123!');
    expect(logger.entries.some((entry) => entry.level === 'error')).toBe(true);
    expect(logger.entries.some((entry) => entry.level === 'warn')).toBe(true);

    const interceptor = new SuccessEnvelopeInterceptor();
    const success = await lastValueFrom(
      interceptor.intercept(
        { switchToHttp: () => ({ getRequest: () => ({ traceId: TRACE_ID }), getResponse: () => response }) },
        { handle: () => of(VIEW) },
      ),
    );
    expect(success).toEqual({ success: true, data: VIEW, traceId: TRACE_ID });

    const noContent = await lastValueFrom(
      interceptor.intercept(
        {
          switchToHttp: () => ({
            getRequest: () => ({ traceId: '   ' }),
            getResponse: () => ({ ...response, statusCode: 204 }),
          }),
        },
        { handle: () => of(undefined) },
      ),
    );
    expect(noContent).toBeUndefined();
  });

  it('delegates every user route to its use case with the JWT subject', async () => {
    const createUser = { execute: jest.fn().mockResolvedValue(VIEW) };
    const getUsers = { execute: jest.fn().mockResolvedValue([VIEW]) };
    const getUserById = { execute: jest.fn().mockResolvedValue(VIEW) };
    const updateUser = { execute: jest.fn().mockResolvedValue({ ...VIEW, department: 'Platform' }) };
    const deleteUser = { execute: jest.fn().mockResolvedValue(undefined) };
    const controller = new UsersController(
      createUser as unknown as CreateUserUseCase,
      getUsers as unknown as GetUsersUseCase,
      getUserById as unknown as GetUserByIdUseCase,
      updateUser as unknown as UpdateUserUseCase,
      deleteUser as unknown as DeleteUserUseCase,
    );
    const actor = { id: ACTOR_ID, email: 'admin@toka.com', roles: ['ADMIN'] as const };
    await expect(controller.list({ traceId: TRACE_ID, actor })).resolves.toEqual([VIEW]);
    await expect(controller.findOne(USER_ID, { traceId: '  ', actor })).resolves.toEqual(VIEW);
    expect(getUserById.execute).toHaveBeenLastCalledWith(USER_ID, ACTOR_ID, expect.stringMatching(/^trc_/));
    await controller.create(
      { email: 'ana@toka.com', password: 'Password123!', fullName: 'Ana Pérez', department: 'Engineering', roles: ['USER'] },
      { traceId: TRACE_ID, actor },
    );
    expect(createUser.execute).toHaveBeenCalledWith(
      { email: 'ana@toka.com', password: 'Password123!', fullName: 'Ana Pérez', department: 'Engineering', roles: ['USER'] },
      ACTOR_ID,
      TRACE_ID,
    );
    await controller.create(
      { email: 'ana@toka.com', password: 'Password123!', fullName: 'Ana Pérez', department: 'Engineering' },
      { traceId: TRACE_ID, actor },
    );
    expect(createUser.execute).toHaveBeenLastCalledWith(
      { email: 'ana@toka.com', password: 'Password123!', fullName: 'Ana Pérez', department: 'Engineering' },
      ACTOR_ID,
      TRACE_ID,
    );
    await controller.update(USER_ID, { department: 'Platform', status: 'INACTIVE' }, { traceId: TRACE_ID, actor });
    expect(updateUser.execute).toHaveBeenCalledWith(USER_ID, { department: 'Platform', status: 'INACTIVE' }, ACTOR_ID, TRACE_ID);
    await expect(controller.remove(USER_ID, { traceId: TRACE_ID, actor })).resolves.toBeUndefined();
    expect(deleteUser.execute).toHaveBeenCalledWith(USER_ID, ACTOR_ID, TRACE_ID);

    expect(() => controller.list({ traceId: TRACE_ID })).toThrow(ApplicationError);
    expect(() => controller.list({ traceId: TRACE_ID, actor: { id: '   ', email: 'admin@toka.com', roles: ['ADMIN'] } })).toThrow(
      ApplicationError,
    );
  });

  it('rejects requests without a valid bearer token', async () => {
    const verifier: AccessTokenVerifier = {
      verify(token: string): JwtPayload {
        if (token === 'bad') {
          throw new ContractError('jwt signature is invalid');
        }
        if (token === 'boom') {
          throw new Error('unexpected');
        }
        return payload;
      },
    };
    const guard = new JwtAuthGuard(verifier, { jwtSecret: JWT_SECRET }, new RecordingLogger());
    const request: { headers?: Record<string, unknown>; traceId?: string; actor?: unknown; accessToken?: string } = {
      headers: { authorization: 'Bearer token-ok' },
      traceId: TRACE_ID,
    };
    await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) })).resolves.toBe(true);
    expect(request.actor).toMatchObject({ id: ACTOR_ID, email: 'admin@toka.com', roles: ['ADMIN'] });
    expect(request.accessToken).toBe('token-ok');

    await expect(
      guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers: {}, traceId: TRACE_ID }) }) }),
    ).rejects.toMatchObject({ status: 401, code: 'TOKEN_INVALID_OR_REVOKED' });
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer bad' }, traceId: '  ' }) }),
      }),
    ).rejects.toMatchObject({ status: 401, code: 'TOKEN_INVALID_OR_REVOKED' });
    await expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer boom' }, traceId: TRACE_ID }) }),
      }),
    ).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });

    const broken = new JwtAuthGuard(verifier, { jwtSecret: JWT_SECRET }, new RecordingLogger(), () => {
      throw new Error('clock');
    });
    await expect(
      broken.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer token-ok' }, traceId: TRACE_ID }) }),
      }),
    ).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });
});
