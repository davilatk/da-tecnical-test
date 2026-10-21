import type { Logger } from '../application/logger.js';
import { ContractError } from '../domain/contract-error.js';
import { isPlainObject } from '../domain/formats.js';
import { isLogLevel, type LogCommand, type LogEntry, type LogLevel } from '../domain/log-entry.js';
import { redactJwt, redactSensitive } from '../domain/redact.js';

export type LogSink = (line: string) => void;

export function writeLogLine(line: string): void {
  process.stdout.write(`${line}\n`);
}

export class JsonLogger implements Logger {
  constructor(
    private readonly service: string,
    private readonly writeLine: LogSink = writeLogLine,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (service.trim().length === 0) {
      throw new ContractError('log service must be a non-empty string');
    }
  }

  log(command: LogCommand): LogEntry {
    if (!isLogLevel(command.level)) {
      throw new ContractError('log level must be debug, info, warn or error');
    }
    if (command.traceId.trim().length === 0) {
      throw new ContractError('traceId must be a non-empty string');
    }
    if (command.message.trim().length === 0) {
      throw new ContractError('log message must be a non-empty string');
    }
    const context = this.sanitizeContext(command.context ?? {});
    let timestamp: string;
    try {
      timestamp = this.now().toISOString();
    } catch {
      throw new ContractError('log timestamp must be a valid date');
    }
    const entry: LogEntry = {
      timestamp,
      level: command.level,
      service: this.service,
      traceId: command.traceId,
      message: redactJwt(command.message),
      context,
    };
    this.writeLine(JSON.stringify(entry));
    return entry;
  }

  debug(traceId: string, message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('debug', traceId, message, context);
  }

  info(traceId: string, message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('info', traceId, message, context);
  }

  warn(traceId: string, message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('warn', traceId, message, context);
  }

  error(traceId: string, message: string, context?: Record<string, unknown>): LogEntry {
    return this.write('error', traceId, message, context);
  }

  private write(
    level: LogLevel,
    traceId: string,
    message: string,
    context?: Record<string, unknown>,
  ): LogEntry {
    return this.log({
      level,
      traceId,
      message,
      ...(context !== undefined ? { context } : {}),
    });
  }

  private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    if (!isPlainObject(context)) {
      throw new ContractError('context must be an object');
    }
    let cloned: unknown;
    try {
      cloned = structuredClone(context);
    } catch {
      throw new ContractError('context must be a JSON object');
    }
    let serialized: unknown;
    try {
      serialized = JSON.parse(JSON.stringify(redactSensitive(cloned))) as unknown;
    } catch {
      throw new ContractError('context must be a JSON object');
    }
    if (!isPlainObject(serialized)) {
      throw new ContractError('context must be a JSON object');
    }
    return serialized;
  }
}
