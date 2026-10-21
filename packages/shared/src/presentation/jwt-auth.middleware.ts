import { AuthenticateAccessToken } from '../application/authenticate-access-token.js';
import { ContractError } from '../domain/contract-error.js';
import {
  createHttpFailure,
  type ApiFailure,
  type ErrorHttpStatus,
} from '../domain/http-response.js';
import { isUserRole, type JwtPayload, type UserRole } from '../domain/jwt-payload.js';

export interface JwtHttpRequest {
  headers?: Record<string, unknown>;
  header?: (name: string) => string | undefined;
  traceId?: string;
  accessToken?: string;
  accessTokenPayload?: JwtPayload;
}

export interface JwtHttpResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): { json(body: ApiFailure): unknown };
}

export type JwtAuthNext = (error?: unknown) => void;

export interface JwtMiddlewareOptions {
  secret: string;
  now?: () => Date;
  requiredRoles?: readonly UserRole[];
  isRevoked?: (access: { token: string; payload: JwtPayload }) => boolean | Promise<boolean>;
  createTraceId?: () => string;
}

export interface ResolvedJwtMiddlewareOptions {
  secret: string;
  now: () => Date;
  createTraceId: () => string;
  requiredRoles?: readonly UserRole[];
  isRevoked?: (access: { token: string; payload: JwtPayload }) => boolean | Promise<boolean>;
}

export type JwtAuthMiddleware = (
  request: JwtHttpRequest,
  response: JwtHttpResponse,
  next: JwtAuthNext,
) => Promise<void>;

function readHeaderValue(raw: unknown): string | undefined {
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw;
  }
  if (Array.isArray(raw)) {
    const first: unknown = raw[0];
    if (typeof first === 'string' && first.trim().length > 0) {
      return first;
    }
  }
  return undefined;
}

function readHeader(request: JwtHttpRequest, name: string): string | undefined {
  const fromMethod = request.header?.(name) ?? request.header?.(name.toLowerCase());
  if (typeof fromMethod === 'string' && fromMethod.trim().length > 0) {
    return fromMethod;
  }
  const headers = request.headers;
  if (headers === undefined) {
    return undefined;
  }
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  if (entry === undefined) {
    return undefined;
  }
  return readHeaderValue(entry[1]);
}

function readBearer(request: JwtHttpRequest): string | null {
  const header = readHeader(request, 'authorization');
  if (header === undefined) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function resolveTraceId(request: JwtHttpRequest, createId: () => string): string {
  if (request.traceId !== undefined && request.traceId.trim().length > 0) {
    return request.traceId.trim();
  }
  const header = readHeader(request, 'x-trace-id');
  if (header !== undefined && header.trim().length > 0) {
    return header.trim();
  }
  return createId();
}

function writeFailure(
  response: JwtHttpResponse,
  status: ErrorHttpStatus,
  code: string,
  message: string,
  traceId: string,
): void {
  const failure = createHttpFailure(status, { code, message, details: [] }, traceId);
  response.setHeader('Content-Type', failure.contentType);
  response.status(failure.status).json(failure.body);
}

export function createJwtMiddleware(
  useCase: AuthenticateAccessToken,
  options: ResolvedJwtMiddlewareOptions,
): JwtAuthMiddleware {
  if (options.secret.trim().length === 0) {
    throw new ContractError('jwt secret must be non-empty');
  }
  if (options.requiredRoles !== undefined) {
    for (const role of options.requiredRoles) {
      if (!isUserRole(role)) {
        throw new ContractError('required roles must belong to the contract');
      }
    }
  }

  return async (request, response, next) => {
    const traceId = resolveTraceId(request, options.createTraceId);
    request.traceId = traceId;
    let decision: Awaited<ReturnType<AuthenticateAccessToken['execute']>>;
    try {
      decision = await useCase.execute({
        token: readBearer(request),
        secret: options.secret,
        now: options.now(),
        ...(options.requiredRoles !== undefined ? { requiredRoles: options.requiredRoles } : {}),
        ...(options.isRevoked !== undefined ? { isRevoked: options.isRevoked } : {}),
      });
    } catch {
      writeFailure(response, 500, 'INTERNAL_ERROR', 'internal error', traceId);
      return;
    }
    if (decision.status === 'rejected') {
      writeFailure(response, decision.httpStatus, decision.code, decision.message, traceId);
      return;
    }
    request.accessToken = decision.token;
    request.accessTokenPayload = decision.payload;
    next();
  };
}
