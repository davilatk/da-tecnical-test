export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  traceId: string;
  message: string;
  context: Record<string, unknown>;
}

export interface LogCommand {
  level: LogLevel;
  traceId: string;
  message: string;
  context?: Record<string, unknown>;
}

export function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}
