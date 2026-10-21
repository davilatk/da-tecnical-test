import type { LoggerService } from '@nestjs/common';
import { JsonLogger, type Logger } from '@toka/shared';

export class NestJsonLogger implements LoggerService {
  constructor(
    private readonly logger: Logger,
    private readonly traceId: string,
  ) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(this.traceId, text(message), context(optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error(this.traceId, text(message), context(optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn(this.traceId, text(message), context(optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(this.traceId, text(message), context(optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(this.traceId, text(message), context(optionalParams));
  }
}

export function createNestJsonLogger(traceId: string): NestJsonLogger {
  return new NestJsonLogger(new JsonLogger('auth-service'), traceId);
}

function text(message: unknown): string {
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  if (typeof message === 'number' || typeof message === 'boolean') {
    return String(message);
  }
  return 'application log';
}

function context(optionalParams: unknown[]): Record<string, unknown> {
  const record = optionalParams.find((param) => isContext(param));
  return record ?? {};
}

function isContext(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
