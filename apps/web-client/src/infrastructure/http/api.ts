import type { ApiSuccess } from '../../domain/contracts';
import { compactAuditQuery } from '../../domain/audit-query';
import type { AiAgentApiPort, AuditApiPort, AuthApiPort, UserApiPort } from '../../application/ports';
import { httpClient } from './http-client';

function unwrap<T>(body: ApiSuccess<T>): T {
  return body.data;
}

export const authApi: AuthApiPort = {
  async register(req) {
    const response = await httpClient.post<ApiSuccess<Awaited<ReturnType<AuthApiPort['register']>>>>(
      '/auth/register',
      req,
    );
    return unwrap(response.data);
  },
  async login(req) {
    const response = await httpClient.post<ApiSuccess<Awaited<ReturnType<AuthApiPort['login']>>>>(
      '/auth/login',
      req,
    );
    return unwrap(response.data);
  },
  async validate() {
    const response = await httpClient.get<ApiSuccess<Awaited<ReturnType<AuthApiPort['validate']>>>>(
      '/auth/validate',
    );
    return unwrap(response.data);
  },
  async listRoles() {
    const response = await httpClient.get<ApiSuccess<Awaited<ReturnType<AuthApiPort['listRoles']>>>>('/roles');
    return unwrap(response.data);
  },
  async assignRole(req) {
    const response = await httpClient.post<ApiSuccess<Awaited<ReturnType<AuthApiPort['assignRole']>>>>(
      '/roles/assign',
      req,
    );
    return unwrap(response.data);
  },
};

export const userApi: UserApiPort = {
  async list() {
    const response = await httpClient.get<ApiSuccess<Awaited<ReturnType<UserApiPort['list']>>>>('/users');
    return unwrap(response.data);
  },
  async getById(id) {
    const response = await httpClient.get<ApiSuccess<Awaited<ReturnType<UserApiPort['getById']>>>>(
      `/users/${encodeURIComponent(id)}`,
    );
    return unwrap(response.data);
  },
  async create(req) {
    const response = await httpClient.post<ApiSuccess<Awaited<ReturnType<UserApiPort['create']>>>>('/users', req);
    return unwrap(response.data);
  },
  async update(id, req) {
    const response = await httpClient.patch<ApiSuccess<Awaited<ReturnType<UserApiPort['update']>>>>(
      `/users/${encodeURIComponent(id)}`,
      req,
    );
    return unwrap(response.data);
  },
  async remove(id) {
    await httpClient.delete(`/users/${encodeURIComponent(id)}`);
  },
};

export const auditApi: AuditApiPort = {
  async list(query) {
    const params = query === undefined ? undefined : compactAuditQuery(query);
    const response = await httpClient.get<ApiSuccess<Awaited<ReturnType<AuditApiPort['list']>>>>('/audits', {
      params,
    });
    return unwrap(response.data);
  },
  async stats() {
    const response = await httpClient.get<ApiSuccess<Awaited<ReturnType<AuditApiPort['stats']>>>>('/audits/stats');
    return unwrap(response.data);
  },
};

export const aiAgentApi: AiAgentApiPort = {
  async ingest(req) {
    const response = await httpClient.post<ApiSuccess<Awaited<ReturnType<AiAgentApiPort['ingest']>>>>(
      '/ai/ingest',
      req,
    );
    return unwrap(response.data);
  },
  async ask(req) {
    const response = await httpClient.post<ApiSuccess<Awaited<ReturnType<AiAgentApiPort['ask']>>>>('/ai/ask', req);
    return unwrap(response.data);
  },
};
