import type { ApiFieldError, ErrorHttpStatus, Logger } from '@toka/shared';

export const APPLICATION_ERROR_CODES = [
  'VALIDATION_ERROR',
  'EMAIL_ALREADY_REGISTERED',
  'INVALID_CREDENTIALS',
  'TOKEN_INVALID_OR_REVOKED',
  'FORBIDDEN',
  'AUTH_USER_NOT_FOUND',
  'INTERNAL_ERROR',
] as const;

export type ApplicationErrorCode = (typeof APPLICATION_ERROR_CODES)[number];

export class ApplicationError extends Error {
  readonly details: readonly ApiFieldError[];

  constructor(
    readonly status: ErrorHttpStatus,
    readonly code: ApplicationErrorCode,
    message: string,
    details: readonly ApiFieldError[] = [],
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.details = details.map((detail) => ({
      field: detail.field,
      message: detail.message,
    }));
  }
}

export function validationError(violations: readonly ApiFieldError[]): ApplicationError {
  const first = violations[0];
  const message = first ? `${first.field} ${first.message}` : 'request validation failed';
  return new ApplicationError(400, 'VALIDATION_ERROR', message, violations);
}

export function emailAlreadyRegistered(): ApplicationError {
  return new ApplicationError(409, 'EMAIL_ALREADY_REGISTERED', 'email is already registered', [
    { field: 'email', message: 'is already registered' },
  ]);
}

export function invalidCredentials(): ApplicationError {
  return new ApplicationError(401, 'INVALID_CREDENTIALS', 'invalid credentials');
}

export function tokenRejected(): ApplicationError {
  return new ApplicationError(401, 'TOKEN_INVALID_OR_REVOKED', 'token is invalid or revoked');
}

export function forbidden(): ApplicationError {
  return new ApplicationError(403, 'FORBIDDEN', 'forbidden');
}

export function authUserNotFound(): ApplicationError {
  return new ApplicationError(404, 'AUTH_USER_NOT_FOUND', 'auth user was not found');
}

export function internalError(logger: Logger, traceId: string, error: unknown): ApplicationError {
  logger.error(traceId, 'internal error', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return new ApplicationError(500, 'INTERNAL_ERROR', 'internal error');
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
