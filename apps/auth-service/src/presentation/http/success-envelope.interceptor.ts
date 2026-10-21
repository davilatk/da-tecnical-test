import { createSuccess, createTraceId, JSON_CONTENT_TYPE } from '@toka/shared';
import { map, type Observable } from 'rxjs';

export interface SuccessExecutionContext {
  switchToHttp(): {
    getRequest<T>(): T;
    getResponse<T>(): T;
  };
}

export interface HeaderResponse {
  setHeader(name: string, value: string): unknown;
}

export interface CallHandlerWithData<TData> {
  handle(): Observable<TData>;
}

export class SuccessEnvelopeInterceptor {
  intercept(context: SuccessExecutionContext, next: CallHandlerWithData<object>): Observable<object> {
    const request = context.switchToHttp().getRequest<{ traceId?: string }>();
    const response = context.switchToHttp().getResponse<HeaderResponse>();
    const traceId = request.traceId !== undefined && request.traceId.trim().length > 0 ? request.traceId.trim() : createTraceId();
    response.setHeader('Content-Type', JSON_CONTENT_TYPE);
    return next.handle().pipe(map((data) => createSuccess(data, traceId)));
  }
}
