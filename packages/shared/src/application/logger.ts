import type { LogCommand, LogEntry } from '../domain/log-entry.js';

export interface Logger {
  log(command: LogCommand): LogEntry;
  debug(traceId: string, message: string, context?: Record<string, unknown>): LogEntry;
  info(traceId: string, message: string, context?: Record<string, unknown>): LogEntry;
  warn(traceId: string, message: string, context?: Record<string, unknown>): LogEntry;
  error(traceId: string, message: string, context?: Record<string, unknown>): LogEntry;
}
