import { internalServiceBaseUrl, isUserRole, type ApiFieldError, type ErrorHttpStatus, type UserRole } from '@toka/shared';
import type {
  AuthRegisterCommand,
  AuthRegistrationResult,
  AuthRegistrar,
  PropagatedHttpError,
  RegisteredAuthUser,
} from '../../application/ports.js';
import { isPlainObject } from '../../domain/input-rules.js';

export const AUTH_REGISTER_URL = `${internalServiceBaseUrl('auth-service')}/auth/register`;

const ERROR_STATUSES = new Set<number>([400, 401, 403, 404, 409, 500]);

export interface HttpResponse {
  status: number;
  json(): Promise<unknown>;
}

export interface HttpRequest {
  method: string;
  headers: Record<string, string>;
  body: string;
}

export type HttpFetcher = (url: string, request: HttpRequest) => Promise<HttpResponse>;

export class FetchAuthRegistrar implements AuthRegistrar {
  constructor(private readonly fetchImpl: HttpFetcher = nodeFetch) {}

  async register(command: AuthRegisterCommand, traceId: string): Promise<AuthRegistrationResult> {
    const response = await this.fetchImpl(AUTH_REGISTER_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-trace-id': traceId,
      },
      body: JSON.stringify({
        email: command.email,
        password: command.password,
        roles: [...command.roles],
      }),
    });
    const body = await response.json();
    if (response.status === 201) {
      const user = readRegisteredUser(body);
      if (user !== null) {
        return { status: 'registered', user };
      }
    }
    const failure = readFailure(response.status, body);
    if (failure !== null) {
      return { status: 'rejected', error: failure };
    }
    throw new Error('UnexpectedAuthResponse');
  }
}

function readRegisteredUser(body: unknown): RegisteredAuthUser | null {
  if (!isPlainObject(body) || body['success'] !== true) {
    return null;
  }
  const data = body['data'];
  if (!isPlainObject(data) || typeof data['id'] !== 'string' || data['id'].trim().length === 0) {
    return null;
  }
  if (typeof data['email'] !== 'string') {
    return null;
  }
  const roles = readRoles(data['roles']);
  if (roles === null) {
    return null;
  }
  return { id: data['id'].trim(), email: data['email'], roles };
}

function readRoles(value: unknown): UserRole[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const roles: UserRole[] = [];
  const seen = new Set<string>();
  for (const role of value) {
    if (typeof role !== 'string' || !isUserRole(role) || seen.has(role)) {
      return null;
    }
    seen.add(role);
    roles.push(role);
  }
  return roles;
}

function readFailure(status: number, body: unknown): PropagatedHttpError | null {
  if (!isErrorStatus(status) || !isPlainObject(body) || body['success'] !== false || !isPlainObject(body['error'])) {
    return null;
  }
  const error = body['error'];
  const code = error['code'];
  const message = error['message'];
  if (typeof code !== 'string' || code.trim().length === 0 || typeof message !== 'string' || message.trim().length === 0) {
    return null;
  }
  const details = readDetails(error['details']);
  if (details === null) {
    return null;
  }
  return { status, code, message, details };
}

function readDetails(value: unknown): ApiFieldError[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const details: ApiFieldError[] = [];
  for (const item of value) {
    if (!isPlainObject(item) || typeof item['message'] !== 'string' || item['message'].trim().length === 0) {
      return null;
    }
    if (item['field'] !== null && typeof item['field'] !== 'string') {
      return null;
    }
    details.push({ field: item['field'], message: item['message'] });
  }
  return details;
}

function isErrorStatus(status: number): status is ErrorHttpStatus {
  return ERROR_STATUSES.has(status);
}

async function nodeFetch(url: string, request: HttpRequest): Promise<HttpResponse> {
  const response = await fetch(url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  return {
    status: response.status,
    json: () => response.json() as Promise<unknown>,
  };
}
