import type { ApiErrorBody } from '../domain/contracts';

export class ApiClientError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;
  readonly traceId: string;

  constructor(status: number, body: ApiErrorBody, traceId: string) {
    super(body.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.body = body;
    this.traceId = traceId;
  }
}

export function toApiErrorBody(error: unknown): ApiErrorBody {
  if (error instanceof ApiClientError) {
    return error.body;
  }
  return {
    code: 'INTERNAL_ERROR',
    message: 'Error inesperado',
    details: [],
  };
}
