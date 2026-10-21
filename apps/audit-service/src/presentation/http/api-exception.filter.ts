import { Catch, type ExceptionFilter } from '@nestjs/common';
import { createHttpFailure, createTraceId, type Logger } from '@toka/shared';
import { ApplicationError } from '../../application/application-error.js';

export interface FailureHttpResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): { json(body: unknown): unknown };
}

export interface ExceptionHost {
  switchToHttp(): {
    getRequest<T>(): T;
    getResponse<T>(): T;
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ExceptionHost): void {
    const request = host.switchToHttp().getRequest<{ traceId?: string }>();
    const response = host.switchToHttp().getResponse<FailureHttpResponse>();
    const traceId = request.traceId !== undefined && request.traceId.trim().length > 0 ? request.traceId.trim() : createTraceId();
    const error = exception instanceof ApplicationError ? exception : new ApplicationError(500, 'INTERNAL_ERROR', 'internal error');
    if (error.status >= 500) {
      this.logger.error(traceId, 'request failed', { code: error.code, status: error.status });
    } else {
      this.logger.warn(traceId, 'request rejected', { code: error.code, status: error.status });
    }
    const failure = createHttpFailure(error.status, { code: error.code, message: error.message, details: error.details }, traceId);
    response.setHeader('Content-Type', failure.contentType);
    response.status(failure.status).json(failure.body);
  }
}
