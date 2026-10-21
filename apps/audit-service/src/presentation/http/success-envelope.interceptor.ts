import { createSuccess, createTraceId, JSON_CONTENT_TYPE } from '@toka/shared';
import { map, type Observable } from 'rxjs';

export interface SuccessExecutionContext {
  switchToHttp(): {
    getRequest<T>(): T;
    getResponse<T>(): T;
  };
}

export interface HeaderResponse {
  statusCode?: number;
  setHeader(name: string, value: string): unknown;
}

export interface CallHandlerWithData<TData> {
  handle(): Observable<TData>;
}

function isJsonBody(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

export class SuccessEnvelopeInterceptor {
  intercept(context: SuccessExecutionContext, next: CallHandlerWithData<unknown>): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ traceId?: string }>();
    const response = context.switchToHttp().getResponse<HeaderResponse>();
    const traceId = request.traceId !== undefined && request.traceId.trim().length > 0 ? request.traceId.trim() : createTraceId();
    return next.handle().pipe(
      map((data) => {
        if (data === undefined || data === null || response.statusCode === 204 || !isJsonBody(data)) {
          return data;
        }
        response.setHeader('Content-Type', JSON_CONTENT_TYPE);
        return createSuccess(data, traceId);
      }),
    );
  }
}
