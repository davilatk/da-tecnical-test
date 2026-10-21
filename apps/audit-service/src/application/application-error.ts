import type { ApiFieldError, ErrorHttpStatus, Logger } from '@toka/shared';

export const APPLICATION_ERROR_CODES = ['VALIDATION_ERROR', 'TOKEN_INVALID_OR_REVOKED', 'FORBIDDEN', 'INTERNAL_ERROR'] as const;

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
  const message =
    first === undefined ? 'request validation failed' : first.field === null ? first.message : `${first.field} ${first.message}`;
  return new ApplicationError(400, 'VALIDATION_ERROR', message, violations);
}

export function tokenRejected(): ApplicationError {
  return new ApplicationError(401, 'TOKEN_INVALID_OR_REVOKED', 'token is invalid or revoked');
}

export function forbidden(): ApplicationError {
  return new ApplicationError(403, 'FORBIDDEN', 'forbidden');
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
