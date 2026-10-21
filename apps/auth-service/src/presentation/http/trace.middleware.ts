import { createTraceId } from '@toka/shared';

export interface TraceRequest {
  headers?: Record<string, unknown>;
  header?: (name: string) => string | undefined;
  traceId?: string;
}

export type TraceNext = (error?: unknown) => void;

export function traceMiddleware(request: TraceRequest, _response: unknown, next: TraceNext): void {
  request.traceId = incomingTraceId(request) ?? createTraceId();
  next();
}

function incomingTraceId(request: TraceRequest): string | undefined {
  const fromMethod = request.header?.('x-trace-id') ?? request.header?.('X-Trace-Id');
  if (typeof fromMethod === 'string' && fromMethod.trim().length > 0) {
    return fromMethod.trim();
  }
  const headers = request.headers;
  if (headers === undefined) {
    return undefined;
  }
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === 'x-trace-id');
  if (entry === undefined) {
    return undefined;
  }
  const raw = entry[1];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  return value.trim();
}
