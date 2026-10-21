import { ContractError } from './contract-error.js';
import { isPlainObject } from './formats.js';

export const JSON_CONTENT_TYPE = 'application/json' as const;

export const SUCCESS_HTTP_STATUSES = [200, 201, 204] as const;

export const ERROR_HTTP_STATUSES = [400, 401, 403, 404, 409, 500] as const;

export type SuccessHttpStatus = (typeof SUCCESS_HTTP_STATUSES)[number];

export type ErrorHttpStatus = (typeof ERROR_HTTP_STATUSES)[number];

export type BodySuccessStatus = 200 | 201;

export interface ApiSuccess<TData> {
  success: true;
  data: TData;
  traceId: string;
}

export interface ApiFieldError {
  field: string | null;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details: ApiFieldError[];
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
  traceId: string;
}

export interface HttpErrorInput {
  code: string;
  message: string;
  details?: readonly ApiFieldError[];
}

export interface HttpSuccessResponse<TData> {
  status: BodySuccessStatus;
  contentType: typeof JSON_CONTENT_TYPE;
  body: ApiSuccess<TData>;
}

export interface HttpNoContentResponse {
  status: 204;
  body: undefined;
}

export interface HttpFailureResponse {
  status: ErrorHttpStatus;
  contentType: typeof JSON_CONTENT_TYPE;
  body: ApiFailure;
}

function assertTraceId(traceId: string): void {
  if (traceId.trim().length === 0) {
    throw new ContractError('traceId must be a non-empty string');
  }
}

function assertJsonData(data: object): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(data);
  } catch {
    throw new ContractError('success data must be an object or an array');
  }
  const parsed: unknown = JSON.parse(serialized);
  if (!Array.isArray(parsed) && !isPlainObject(parsed)) {
    throw new ContractError('success data must be an object or an array');
  }
}

function copyDetails(details: readonly ApiFieldError[]): ApiFieldError[] {
  return details.map((detail) => {
    if (detail.field !== null && typeof detail.field !== 'string') {
      throw new ContractError('error detail field must be a string or null');
    }
    if (typeof detail.message !== 'string' || detail.message.trim().length === 0) {
      throw new ContractError('error detail message must be a non-empty string');
    }
    return {
      field: detail.field,
      message: detail.message,
    };
  });
}

export function createSuccess<TData extends object>(data: TData, traceId: string): ApiSuccess<TData> {
  assertTraceId(traceId);
  assertJsonData(data);
  return {
    success: true,
    data,
    traceId,
  };
}

export function createFailure(error: HttpErrorInput, traceId: string): ApiFailure {
  assertTraceId(traceId);
  if (error.code.trim().length === 0) {
    throw new ContractError('error code must be a non-empty string');
  }
  if (error.message.trim().length === 0) {
    throw new ContractError('error message must be a non-empty string');
  }
  return {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: copyDetails(error.details ?? []),
    },
    traceId,
  };
}

export function createHttpSuccess<TData extends object>(
  status: BodySuccessStatus,
  data: TData,
  traceId: string,
): HttpSuccessResponse<TData> {
  return {
    status,
    contentType: JSON_CONTENT_TYPE,
    body: createSuccess(data, traceId),
  };
}

export function createNoContentResponse(): HttpNoContentResponse {
  return {
    status: 204,
    body: undefined,
  };
}

export function createHttpFailure(
  status: ErrorHttpStatus,
  error: HttpErrorInput,
  traceId: string,
): HttpFailureResponse {
  return {
    status,
    contentType: JSON_CONTENT_TYPE,
    body: createFailure(error, traceId),
  };
}
