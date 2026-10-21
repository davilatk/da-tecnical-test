export interface LogContext {
  [key: string]: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const FORBIDDEN_CONTEXT_KEYS = new Set([
  'password',
  'accesstoken',
  'token',
  'authorization',
  'jwt',
  'question',
  'answer',
  'content',
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }
  if (typeof value === 'object' && value !== null) {
    const output: LogContext = {};
    for (const [key, inner] of Object.entries(value)) {
      if (FORBIDDEN_CONTEXT_KEYS.has(key.toLowerCase())) {
        continue;
      }
      output[key] = sanitize(inner);
    }
    return output;
  }
  return value;
}

function write(level: LogLevel, traceId: string, message: string, context: LogContext): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'web-client',
    traceId,
    message,
    context: sanitize(context),
  });
  console.log(line);
}

export const logger = {
  debug(traceId: string, message: string, context: LogContext = {}): void {
    write('debug', traceId, message, context);
  },
  info(traceId: string, message: string, context: LogContext = {}): void {
    write('info', traceId, message, context);
  },
  warn(traceId: string, message: string, context: LogContext = {}): void {
    write('warn', traceId, message, context);
  },
  error(traceId: string, message: string, context: LogContext = {}): void {
    write('error', traceId, message, context);
  },
};
