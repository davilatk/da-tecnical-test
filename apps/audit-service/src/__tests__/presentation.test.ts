import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { lastValueFrom, of } from 'rxjs';
import { ContractError, type AccessTokenVerifier, type JwtPayload } from '@toka/shared';
import { ApplicationError, validationError } from '../application/application-error.js';
import { GetAuditLogsUseCase } from '../application/get-audit-logs.use-case.js';
import { GetAuditStatsUseCase } from '../application/get-audit-stats.use-case.js';
import { ACTOR_ID_RULE, EVENT_TYPE_RULE, LIMIT_RULE } from '../domain/audit-query.js';
import { AuditsController } from '../presentation/audits.controller.js';
import { ListAuditsQueryDto } from '../presentation/dto/list-audits-query.dto.js';
import { ApiExceptionFilter } from '../presentation/http/api-exception.filter.js';
import { readBearerToken } from '../presentation/http/bearer-token.js';
import { JwtAuthGuard } from '../presentation/http/jwt-auth.guard.js';
import { REQUIRED_ROLES } from '../presentation/http/require-roles.js';
import { SuccessEnvelopeInterceptor } from '../presentation/http/success-envelope.interceptor.js';
import { traceMiddleware } from '../presentation/http/trace.middleware.js';
import { validationExceptionFactory } from '../presentation/http/validation-exception.factory.js';
import { ADMIN, ACTOR_ID, JWT_SECRET, RecordingLogger, TRACE_ID, userCreatedEvent } from './fakes.js';

const payload: JwtPayload = {
  sub: ACTOR_ID,
  email: 'admin@toka.com',
  roles: ['ADMIN'],
  iat: 1_700_000_000,
  exp: 1_700_003_600,
};

const auditorPayload: JwtPayload = {
  ...payload,
  sub: 'usr_auditor',
  email: 'auditor@toka.com',
  roles: ['AUDITOR'],
};

describe('audit HTTP presentation', () => {
  it('validates the audit filter DTO', async () => {
    const query = plainToInstance(ListAuditsQueryDto, { eventType: 'user.created', actorId: '  usr_01  ', limit: '20' });
    expect(await validate(query)).toHaveLength(0);
    expect(query.actorId).toBe('usr_01');
    expect(query.limit).toBe(20);

    const invalid = plainToInstance(ListAuditsQueryDto, { eventType: 'user.paused', actorId: '   ', limit: '0' });
    const errors = validationExceptionFactory(await validate(invalid));
    expect(errors).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(errors.details.map((detail) => detail.field)).toEqual(expect.arrayContaining(['eventType', 'actorId', 'limit']));
    expect(errors.details).toEqual(
      expect.arrayContaining([
        { field: 'eventType', message: EVENT_TYPE_RULE },
        { field: 'actorId', message: ACTOR_ID_RULE },
        { field: 'limit', message: LIMIT_RULE },
      ]),
    );

    const extra = validationExceptionFactory(
      await validate(plainToInstance(ListAuditsQueryDto, { offset: 1 }), { whitelist: true, forbidNonWhitelisted: true }),
    );
    expect(extra.details).toContainEqual({ field: 'offset', message: 'is not allowed' });
    expect(await validate(plainToInstance(ListAuditsQueryDto, {}))).toHaveLength(0);
    expect(validationExceptionFactory([]).message).toBe('request validation failed');
    expect(validationError([{ field: null, message: 'must be present' }]).message).toBe('must be present');

    const nested = new ValidationError();
    nested.property = 'limit';
    nested.children = [Object.assign(new ValidationError(), { property: '0', constraints: { isInt: LIMIT_RULE } })];
    const blank = new ValidationError();
    blank.property = 'note';
    blank.constraints = { empty: '   ', whitelistValidation: 'should not exist' };
    expect(validationExceptionFactory([nested, blank]).details).toEqual([
      { field: 'limit.0', message: LIMIT_RULE },
      { field: 'note', message: 'is not allowed' },
    ]);
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
    const missingHeader: { headers: Record<string, unknown>; traceId?: string } = { headers: { host: 'localhost' } };
    traceMiddleware(missingHeader, {}, () => undefined);
    expect(missingHeader.traceId).toMatch(/^trc_/);
    const numericHeader: { headers: Record<string, unknown>; traceId?: string } = { headers: { 'x-trace-id': 12 } };
    traceMiddleware(numericHeader, {}, () => undefined);
    expect(numericHeader.traceId).toMatch(/^trc_/);

    expect(readBearerToken({ Authorization: 'Bearer token-1' })).toBe('token-1');
    expect(readBearerToken({ authorization: ['Bearer token-2'] })).toBe('token-2');
    expect(readBearerToken({ authorization: 'Basic abc' })).toBeNull();
    expect(readBearerToken({ authorization: 5 })).toBeNull();
    expect(readBearerToken(undefined)).toBeNull();
  });

  it('wraps audit responses and hides internal failures', async () => {
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
    const page = { items: [], limit: 20 };
    filter.catch(new ApplicationError(400, 'VALIDATION_ERROR', 'eventType is invalid', [{ field: 'eventType', message: EVENT_TYPE_RULE }]), {
      switchToHttp: () => ({ getRequest: () => ({ traceId: TRACE_ID }), getResponse: () => response }),
    });
    expect(state.body).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: [{ field: 'eventType', message: EVENT_TYPE_RULE }] },
      traceId: TRACE_ID,
    });
    expect(headers['Content-Type']).toBe('application/json');

    filter.catch(new ApplicationError(401, 'TOKEN_INVALID_OR_REVOKED', 'token is invalid or revoked'), {
      switchToHttp: () => ({ getRequest: () => ({ traceId: '   ' }), getResponse: () => response }),
    });
    expect(state.status).toBe(401);
    filter.catch(new ApplicationError(403, 'FORBIDDEN', 'forbidden'), {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => response }),
    });
    expect(state.status).toBe(403);
    filter.catch(new Error('mongo query'), {
      switchToHttp: () => ({ getRequest: () => ({ traceId: TRACE_ID }), getResponse: () => response }),
    });
    expect(state.status).toBe(500);
    expect(JSON.stringify(state.body)).not.toContain('mongo query');
    expect(logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
    expect(logger.entries.some((entry) => entry.level === 'error')).toBe(true);

    const interceptor = new SuccessEnvelopeInterceptor();
    const success = await lastValueFrom(
      interceptor.intercept(
        { switchToHttp: () => ({ getRequest: () => ({ traceId: TRACE_ID }), getResponse: () => response }) },
        { handle: () => of(page) },
      ),
    );
    expect(success).toEqual({ success: true, data: page, traceId: TRACE_ID });
    const stats = await lastValueFrom(
      interceptor.intercept(
        { switchToHttp: () => ({ getRequest: () => ({ traceId: '  ' }), getResponse: () => ({ ...response, statusCode: 200 }) }) },
        { handle: () => of({ total: 0, byEventType: {} }) },
      ),
    );
    expect(stats).toMatchObject({ success: true, data: { total: 0 } });
    const skipped = await lastValueFrom(
      interceptor.intercept(
        { switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({ ...response, statusCode: 204 }) }) },
        { handle: () => of({ ignored: true }) },
      ),
    );
    expect(skipped).toEqual({ ignored: true });
    const plain = await lastValueFrom(
      interceptor.intercept(
        { switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({ ...response, statusCode: 200 }) }) },
        { handle: () => of('text') },
      ),
    );
    expect(plain).toBe('text');
  });

  it('delegates both routes with the authenticated actor', async () => {
    const stats = { total: 1, byEventType: { 'user.created': 1 } };
    const page = {
      items: [{ ...userCreatedEvent(), occurredAt: userCreatedEvent().occurredAt, createdAt: '2026-10-21T17:24:01.000Z' }],
      limit: 20,
    };
    const getLogs = { execute: jest.fn().mockResolvedValue(page) };
    const getStats = { execute: jest.fn().mockResolvedValue(stats) };
    const controller = new AuditsController(getLogs as unknown as GetAuditLogsUseCase, getStats as unknown as GetAuditStatsUseCase);
    await expect(controller.stats({ traceId: TRACE_ID, actor: ADMIN })).resolves.toEqual(stats);
    expect(getStats.execute).toHaveBeenCalledWith(ADMIN, TRACE_ID);
    await expect(controller.list({ eventType: 'user.created', actorId: 'usr_01', limit: 20 }, { traceId: '  ', actor: ADMIN })).resolves.toEqual(page);
    expect(getLogs.execute).toHaveBeenLastCalledWith(
      { eventType: 'user.created', actorId: 'usr_01', limit: 20 },
      ADMIN,
      expect.stringMatching(/^trc_/),
    );
    await controller.list({}, { traceId: TRACE_ID });
    expect(getLogs.execute).toHaveBeenLastCalledWith({}, null, TRACE_ID);
    await controller.stats({ traceId: TRACE_ID });
    expect(getStats.execute).toHaveBeenLastCalledWith(null, TRACE_ID);

    const reflector = new Reflector();
    expect(reflector.getAllAndOverride(REQUIRED_ROLES, [AuditsController.prototype.list, AuditsController])).toEqual(['ADMIN', 'AUDITOR']);
    expect(reflector.getAllAndOverride(REQUIRED_ROLES, [AuditsController.prototype.stats, AuditsController])).toEqual(['ADMIN', 'AUDITOR']);
  });

  it('rejects invalid tokens and roles other than ADMIN or AUDITOR', async () => {
    const verifier: AccessTokenVerifier = {
      verify(token: string): JwtPayload {
        if (token === 'bad') {
          throw new ContractError('jwt signature is invalid');
        }
        if (token === 'boom') {
          throw new Error('unexpected');
        }
        if (token === 'user') {
          return { ...payload, roles: ['USER'] };
        }
        if (token === 'auditor') {
          return auditorPayload;
        }
        return payload;
      },
    };
    const reflector = {
      getAllAndOverride: () => ['ADMIN', 'AUDITOR'] as const,
    };
    const guard = new JwtAuthGuard(reflector, verifier, { jwtSecret: JWT_SECRET }, new RecordingLogger());
    const adminRequest: { headers?: Record<string, unknown>; traceId?: string; actor?: unknown; accessToken?: string } = {
      headers: { authorization: 'Bearer token-ok' },
      traceId: TRACE_ID,
    };
    await expect(guard.canActivate(contextOf(adminRequest))).resolves.toBe(true);
    expect(adminRequest.actor).toMatchObject({ id: ACTOR_ID, roles: ['ADMIN'] });

    const auditorRequest = { headers: { authorization: 'Bearer auditor' }, traceId: TRACE_ID };
    await expect(guard.canActivate(contextOf(auditorRequest))).resolves.toBe(true);

    await expect(guard.canActivate(contextOf({ headers: {}, traceId: TRACE_ID }))).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_INVALID_OR_REVOKED',
    });
    await expect(guard.canActivate(contextOf({ headers: { authorization: 'Bearer bad' }, traceId: '  ' }))).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_INVALID_OR_REVOKED',
    });
    await expect(guard.canActivate(contextOf({ headers: { authorization: 'Bearer user' }, traceId: TRACE_ID }))).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    await expect(guard.canActivate(contextOf({ headers: { authorization: 'Bearer boom' }, traceId: TRACE_ID }))).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });

    const broken = new JwtAuthGuard(reflector, verifier, { jwtSecret: JWT_SECRET }, new RecordingLogger(), () => {
      throw new Error('clock');
    });
    await expect(broken.canActivate(contextOf({ headers: { authorization: 'Bearer token-ok' }, traceId: TRACE_ID }))).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });

    const open = new JwtAuthGuard({ getAllAndOverride: () => undefined }, verifier, { jwtSecret: JWT_SECRET }, new RecordingLogger());
    await expect(open.canActivate(contextOf({ headers: { authorization: 'Bearer user' }, traceId: TRACE_ID }))).resolves.toBe(true);
  });
});

function contextOf(request: object) {
  return {
    getHandler: () => AuditsController.prototype.list,
    getClass: () => AuditsController,
    switchToHttp: () => ({ getRequest: () => request }),
  };
}
