import {
  COMPONENT_PORTS,
  ContractError,
  ERROR_HTTP_STATUSES,
  JSON_CONTENT_TYPE,
  SUCCESS_HTTP_STATUSES,
  createFailure,
  createHttpFailure,
  createHttpSuccess,
  createNoContentResponse,
  createSuccess,
  internalServiceBaseUrl,
} from '../index.js';

describe('HTTP envelopes and service ports', () => {
  it('builds the success envelope for objects and arrays', () => {
    const objectResponse = createHttpSuccess(201, { id: 'usr_1', roles: ['USER'] }, 'trc_1');
    const arrayResponse = createSuccess(['ADMIN', 'USER', 'AUDITOR'], 'trc_2');

    expect(objectResponse).toEqual({
      status: 201,
      contentType: JSON_CONTENT_TYPE,
      body: { success: true, data: { id: 'usr_1', roles: ['USER'] }, traceId: 'trc_1' },
    });
    expect(arrayResponse).toEqual({
      success: true,
      data: ['ADMIN', 'USER', 'AUDITOR'],
      traceId: 'trc_2',
    });
    expect(createHttpSuccess(200, {}, 'trc_3').body.success).toBe(true);
  });

  it('keeps 204 without a body and maps the contractual error statuses', () => {
    expect(createNoContentResponse()).toEqual({ status: 204, body: undefined });
    expect(SUCCESS_HTTP_STATUSES).toEqual([200, 201, 204]);
    expect(ERROR_HTTP_STATUSES).toEqual([400, 401, 403, 404, 409, 500]);

    for (const status of ERROR_HTTP_STATUSES) {
      const response = createHttpFailure(
        status,
        {
          code: 'VALIDATION_ERROR',
          message: 'email must be a valid email address',
          details: [{ field: 'email', message: 'must be a valid email address' }, { field: null, message: 'not associated' }],
        },
        'trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F',
      );
      expect(response.status).toBe(status);
      expect(response.contentType).toBe('application/json');
      expect(response.body.success).toBe(false);
      expect(response.body.error.details).toHaveLength(2);
    }
  });

  it('defaults missing details and rejects incomplete envelopes', () => {
    expect(createFailure({ code: 'INTERNAL_ERROR', message: 'internal error' }, 'trc_1').error.details).toEqual([]);
    expect(() => createSuccess('nope' as unknown as object, 'trc_1')).toThrow(ContractError);
    expect(() => createSuccess(new Date('2026-10-21T17:24:00.000Z'), 'trc_1')).toThrow(ContractError);
    expect(() => createSuccess({ id: 'usr_1' }, '   ')).toThrow(ContractError);
    expect(() => createFailure({ code: ' ', message: 'ok' }, 'trc_1')).toThrow(ContractError);
    expect(() => createFailure({ code: 'X', message: ' ' }, 'trc_1')).toThrow(ContractError);
    expect(() =>
      createFailure({ code: 'X', message: 'ok', details: [{ field: 1 as unknown as string, message: 'bad' }] }, 'trc_1'),
    ).toThrow(ContractError);
    expect(() =>
      createFailure({ code: 'X', message: 'ok', details: [{ field: 'email', message: ' ' }] }, 'trc_1'),
    ).toThrow(ContractError);

    class UserDto {
      id = 'usr_1';
    }
    expect(createSuccess(new UserDto(), 'trc_1').data).toEqual({ id: 'usr_1' });
  });

  it('exposes the port map and internal service urls from the system context', () => {
    expect(COMPONENT_PORTS).toEqual([
      { component: 'auth-service', port: 3001, exposure: 'HTTP interno' },
      { component: 'user-service', port: 3002, exposure: 'HTTP' },
      { component: 'audit-service', port: 3003, exposure: 'HTTP' },
      { component: 'ai-agent-service', port: 8000, exposure: 'HTTP' },
      { component: 'web-client', port: 5173, exposure: 'Desarrollo' },
      { component: 'web-client', port: 80, exposure: 'Producción' },
    ]);
    expect(internalServiceBaseUrl('auth-service')).toBe('http://auth-service:3001');
    expect(internalServiceBaseUrl('user-service')).toBe('http://user-service:3002');
    expect(internalServiceBaseUrl('audit-service')).toBe('http://audit-service:3003');
    expect(internalServiceBaseUrl('ai-agent-service')).toBe('http://ai-agent-service:8000');
  });
});
