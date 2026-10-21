import type { LogCommand, LogEntry, Logger, UserRole } from '@toka/shared';
import { ApplicationError } from '../application/application-error.js';
import type { AuthenticatedActor } from '../application/authenticated-actor.js';
import type { AuditLogRepository, Clock } from '../application/ports.js';
import { AuditLog } from '../domain/audit-log.js';
import type { AuditLogQuery } from '../domain/audit-query.js';

export const TRACE_ID = 'trc_01JQ7D7QW7NZGFWTHR2G7Y2Q3F';
export const OCCURRED_AT = '2026-10-21T17:24:00.000Z';
export const CREATED_AT = new Date('2026-10-21T17:24:01.000Z');
export const ACTOR_ID = 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F';
export const TARGET_ID = 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3H';
export const JWT_SECRET = 'test-jwt-secret';

export const ADMIN: AuthenticatedActor = {
  id: ACTOR_ID,
  email: 'admin@toka.com',
  roles: ['ADMIN'],
};

export const AUDITOR: AuthenticatedActor = {
  id: 'usr_auditor',
  email: 'auditor@toka.com',
  roles: ['AUDITOR'],
};

export const USER_ACTOR: AuthenticatedActor = {
  id: 'usr_user',
  email: 'user@toka.com',
  roles: ['USER'],
};

export function loggedInEvent(eventId = 'evt_logged_in') {
  return {
    eventId,
    eventType: 'auth.user.logged_in' as const,
    occurredAt: OCCURRED_AT,
    actorId: ACTOR_ID,
    targetId: ACTOR_ID,
    serviceSource: 'auth-service' as const,
    payload: { email: 'admin@toka.com' },
  };
}

export function roleAssignedEvent(eventId = 'evt_role_assigned') {
  return {
    eventId,
    eventType: 'auth.role.assigned' as const,
    occurredAt: OCCURRED_AT,
    actorId: ACTOR_ID,
    targetId: TARGET_ID,
    serviceSource: 'auth-service' as const,
    payload: { role: 'AUDITOR' as UserRole },
  };
}

export function userCreatedEvent(eventId = 'evt_01JQ7D7QW7NZGFWTHR2G7Y2Q3F') {
  return {
    eventId,
    eventType: 'user.created' as const,
    occurredAt: OCCURRED_AT,
    actorId: ACTOR_ID,
    targetId: ACTOR_ID,
    serviceSource: 'user-service' as const,
    payload: {
      email: 'ana@toka.com',
      fullName: 'Ana Pérez',
      department: 'Engineering',
      status: 'ACTIVE' as const,
      roles: ['USER'] as UserRole[],
    },
  };
}

export function userUpdatedEvent(eventId = 'evt_user_updated') {
  return {
    eventId,
    eventType: 'user.updated' as const,
    occurredAt: '2026-10-21T17:25:00.000Z',
    actorId: ACTOR_ID,
    targetId: TARGET_ID,
    serviceSource: 'user-service' as const,
    payload: { changedFields: ['fullName', 'department'] as const },
  };
}

export function userDeletedEvent(eventId = 'evt_user_deleted') {
  return {
    eventId,
    eventType: 'user.deleted' as const,
    occurredAt: '2026-10-21T17:26:00.000Z',
    actorId: 'usr_other',
    targetId: TARGET_ID,
    serviceSource: 'user-service' as const,
    payload: { email: 'ana@toka.com' },
  };
}

export const DOMAIN_EVENTS = [
  loggedInEvent(),
  roleAssignedEvent(),
  userCreatedEvent(),
  userUpdatedEvent(),
  userDeletedEvent(),
];

export class RecordingLogger implements Logger {
  readonly entries: LogCommand[] = [];

  log(command: LogCommand): LogEntry {
    this.entries.push({
      level: command.level,
      traceId: command.traceId,
      message: command.message,
      ...(command.context !== undefined ? { context: command.context } : {}),
    });
    return {
      timestamp: CREATED_AT.toISOString(),
      level: command.level,
      service: 'audit-service',
      traceId: command.traceId,
      message: command.message,
      context: command.context ?? {},
    };
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

  private write(level: LogCommand['level'], traceId: string, message: string, context?: Record<string, unknown>): LogEntry {
    return this.log({
      level,
      traceId,
      message,
      ...(context !== undefined ? { context } : {}),
    });
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }
}

export class MemoryAuditLogs implements AuditLogRepository {
  readonly rows: AuditLog[] = [];
  readonly searches: AuditLogQuery[] = [];
  failFind: unknown = null;
  failInsert: unknown = null;
  failSearch: unknown = null;
  failCount: unknown = null;
  duplicateOnInsert = false;
  counts: { eventType: string; count: number }[] | null = null;

  findByEventId(eventId: string): Promise<AuditLog | null> {
    if (this.failFind !== null) {
      return Promise.reject(this.failFind);
    }
    return Promise.resolve(this.rows.find((row) => row.eventId === eventId) ?? null);
  }

  insert(log: AuditLog): Promise<'inserted' | 'duplicate'> {
    if (this.failInsert !== null) {
      return Promise.reject(this.failInsert);
    }
    if (this.duplicateOnInsert || this.rows.some((row) => row.eventId === log.eventId)) {
      return Promise.resolve('duplicate');
    }
    this.rows.push(log);
    return Promise.resolve('inserted');
  }

  search(query: AuditLogQuery): Promise<AuditLog[]> {
    this.searches.push(query);
    if (this.failSearch !== null) {
      return Promise.reject(this.failSearch);
    }
    return Promise.resolve([...this.rows]);
  }

  countByEventType(): Promise<{ eventType: string; count: number }[]> {
    if (this.failCount !== null) {
      return Promise.reject(this.failCount);
    }
    if (this.counts !== null) {
      return Promise.resolve(this.counts);
    }
    const counts = new Map<string, number>();
    for (const row of this.rows) {
      counts.set(row.eventType, (counts.get(row.eventType) ?? 0) + 1);
    }
    return Promise.resolve([...counts.entries()].map(([eventType, count]) => ({ eventType, count })));
  }
}

export async function capture(promise: Promise<unknown>): Promise<ApplicationError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApplicationError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected an application error');
}
