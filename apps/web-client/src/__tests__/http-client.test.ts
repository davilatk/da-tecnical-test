import MockAdapter from 'axios-mock-adapter';
import { ApiClientError } from '../application/api-client-error';
import { useAiAgentStore } from '../application/stores/ai-agent.store';
import { useAuditStore } from '../application/stores/audit.store';
import { useAuthStore } from '../application/stores/auth.store';
import { useUserStore } from '../application/stores/user.store';
import { env } from '../infrastructure/env';
import { aiAgentApi, auditApi, authApi, userApi } from '../infrastructure/http/api';
import { bindApiPorts } from '../infrastructure/http/bind-api-ports';
import { httpClient } from '../infrastructure/http/http-client';
import { logger } from '../infrastructure/logger';
import { browserNavigation } from '../infrastructure/navigation';
import { createTraceId } from '../infrastructure/trace-id';
import { anaUser, askResponse, auditStats, ingestResponse, loginResponse } from './fixtures';
import { resetClientState, seedSession } from './test-utils';
import { adminUser } from './fixtures';

const failure = {
  success: false as const,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'email must be a valid email address',
    details: [{ field: 'email', message: 'must be a valid email address' }],
  },
  traceId: 'trc_fail',
};

function readHeader(headers: unknown, name: string): string {
  if (typeof headers === 'object' && headers !== null && 'get' in headers) {
    const value = (headers as { get: (key: string) => unknown }).get(name);
    return value === undefined || value === null ? '' : String(value);
  }
  return '';
}

describe('cliente HTTP', () => {
  const mock = new MockAdapter(httpClient);
  const redirectTo = jest.fn();
  let currentPath = '/dashboard';
  const originalRedirect = browserNavigation.redirectTo;
  const originalPath = browserNavigation.currentPath;

  beforeEach(() => {
    resetClientState();
    mock.reset();
    redirectTo.mockReset();
    currentPath = '/dashboard';
    browserNavigation.redirectTo = redirectTo;
    browserNavigation.currentPath = () => currentPath;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => {
    browserNavigation.redirectTo = originalRedirect;
    browserNavigation.currentPath = originalPath;
    mock.restore();
  });

  it('añade Authorization y X-Trace-Id cuando hay sesión', async () => {
    seedSession(adminUser);
    mock.onGet('/auth/validate').reply(200, {
      success: true,
      data: { valid: true, user: adminUser },
      traceId: 'trc_ok',
    });
    await authApi.validate();
    const headers = mock.history.get[0]?.headers;
    expect(readHeader(headers, 'Authorization')).toBe('Bearer token-test');
    expect(readHeader(headers, 'X-Trace-Id')).toMatch(/^trc_/);
  });

  it('normaliza ApiFailure y errores de red', async () => {
    mock.onPost('/auth/login').reply(400, failure);
    await expect(authApi.login({ email: 'a@b.c', password: 'Password123!' })).rejects.toMatchObject({
      status: 400,
      traceId: 'trc_fail',
      body: failure.error,
    });

    mock.onGet('/users').reply(200, failure);
    await expect(userApi.list()).rejects.toBeInstanceOf(ApiClientError);

    mock.onGet('/audits/stats').networkError();
    await expect(auditApi.stats()).rejects.toMatchObject({ status: 0, body: { code: 'NETWORK_ERROR' } });

    mock.onGet('/roles').timeout();
    await expect(authApi.listRoles()).rejects.toMatchObject({ status: 0, body: { code: 'NETWORK_ERROR' } });

    mock.onPost('/ai/ask').reply(500, 'plain');
    await expect(aiAgentApi.ask({ question: 'hola' })).rejects.toMatchObject({
      status: 500,
      body: { code: 'UNKNOWN_ERROR' },
    });
  });

  it('cierra la sesión ante un 401 fuera del login', async () => {
    seedSession(adminUser);
    useUserStore.setState({ users: [anaUser] });
    mock.onGet('/users').reply(401, {
      success: false,
      error: { code: 'TOKEN_INVALID_OR_REVOKED', message: 'token inválido', details: [] },
      traceId: 'trc_401',
    });
    await expect(userApi.list()).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useUserStore.getState().users).toEqual([]);
    expect(redirectTo).toHaveBeenCalledWith('/login');

    currentPath = '/login';
    redirectTo.mockClear();
    seedSession(adminUser);
    mock.onGet('/users').reply(401, {
      success: false,
      error: { code: 'TOKEN_INVALID_OR_REVOKED', message: 'token inválido', details: [] },
      traceId: 'trc_401',
    });
    await expect(userApi.list()).rejects.toBeInstanceOf(ApiClientError);
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it('no cierra la sesión cuando el 401 viene del login', async () => {
    seedSession(adminUser);
    mock.onPost('/auth/login').reply(401, {
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', details: [] },
      traceId: 'trc_login',
    });
    await expect(authApi.login({ email: 'admin@toka.com', password: 'mala' })).rejects.toMatchObject({
      status: 401,
      body: { code: 'INVALID_CREDENTIALS' },
    });
    expect(useAuthStore.getState().accessToken).toBe('token-test');
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it('desenvuelve los contratos y omite filtros vacíos', async () => {
    seedSession(adminUser);
    mock.onPost('/auth/register').reply(201, { success: true, data: adminUser, traceId: 'trc_1' });
    mock.onPost('/roles/assign').reply(200, { success: true, data: adminUser, traceId: 'trc_1' });
    mock.onGet('/users/usr_ana').reply(200, { success: true, data: anaUser, traceId: 'trc_1' });
    mock.onPost('/users').reply(201, { success: true, data: anaUser, traceId: 'trc_1' });
    mock.onPatch('/users/usr_ana').reply(200, { success: true, data: anaUser, traceId: 'trc_1' });
    mock.onDelete('/users/usr_ana').reply(204);
    mock.onGet('/audits').reply(200, { success: true, data: { items: [], limit: 50 }, traceId: 'trc_1' });
    mock.onGet('/audits/stats').reply(200, { success: true, data: auditStats, traceId: 'trc_1' });
    mock.onPost('/ai/ingest').reply(201, { success: true, data: ingestResponse, traceId: 'trc_1' });
    mock.onPost('/ai/ask').reply(200, { success: true, data: askResponse, traceId: 'trc_1' });
    mock.onPost('/auth/login').reply(200, { success: true, data: loginResponse, traceId: 'trc_1' });

    await expect(authApi.register({ email: 'admin@toka.com', password: 'Admin123!' })).resolves.toEqual(adminUser);
    await expect(authApi.login({ email: 'admin@toka.com', password: 'Admin123!' })).resolves.toEqual(loginResponse);
    await expect(authApi.assignRole({ userId: 'usr_admin', role: 'ADMIN' })).resolves.toEqual(adminUser);
    await expect(userApi.getById('usr_ana')).resolves.toEqual(anaUser);
    await expect(
      userApi.create({
        email: anaUser.email,
        password: 'Password123!',
        fullName: anaUser.fullName,
        department: anaUser.department,
      }),
    ).resolves.toEqual(anaUser);
    await expect(userApi.update('usr_ana', { department: 'Platform' })).resolves.toEqual(anaUser);
    await expect(userApi.remove('usr_ana')).resolves.toBeUndefined();
    await expect(auditApi.list({ actorId: '', limit: 50 })).resolves.toEqual({ items: [], limit: 50 });
    expect(mock.history.get.find((entry) => entry.url === '/audits')?.params).toEqual({ limit: 50 });
    await expect(auditApi.stats()).resolves.toEqual(auditStats);
    await expect(
      aiAgentApi.ingest({ documents: [{ title: 't', source: 's', content: 'c' }] }),
    ).resolves.toEqual(ingestResponse);
    await expect(aiAgentApi.ask({ question: 'hola' })).resolves.toEqual(askResponse);

    bindApiPorts();
    expect(useAuditStore.getState().query.limit).toBe(50);
    expect(useAiAgentStore.getState().messages).toEqual([]);
  });
});

describe('logger, traza y navegación', () => {
  it('emite una línea JSON sin secretos', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    logger.info('trc_log', 'web client started', {
      mode: 'test',
      password: 'Admin123!',
      accessToken: 'jwt',
      question: 'secreta',
      nested: { answer: 'oculta', userId: 'usr_01' },
    });
    const line = String(spy.mock.calls[0]?.[0]);
    const parsed = JSON.parse(line) as {
      timestamp: string;
      level: string;
      service: string;
      traceId: string;
      message: string;
      context: Record<string, unknown>;
    };
    expect(parsed.service).toBe('web-client');
    expect(parsed.level).toBe('info');
    expect(parsed.traceId).toBe('trc_log');
    expect(parsed.message).toBe('web client started');
    expect(parsed.timestamp).toContain('T');
    expect(parsed.context).toEqual({ mode: 'test', nested: { userId: 'usr_01' } });
    expect(line).not.toContain('Admin123!');
    expect(line).not.toContain('jwt');
    logger.warn('trc_log', 'aviso');
    logger.error('trc_log', 'fallo');
    logger.debug('trc_log', 'detalle');
    expect(env.mode).toBe('test');
    expect(env.dev).toBe(false);
    expect(createTraceId()).toMatch(/^trc_[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  it('lee la ruta actual', () => {
    expect(browserNavigation.currentPath()).toBe(window.location.pathname);
  });
});
