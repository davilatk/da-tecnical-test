import { parseDomainEvent, type DomainEvent, type EventType, type ServiceSource } from '@toka/shared';
import type { AuditLogQuery } from './audit-query.js';
import { DomainInvariantError } from './domain-invariant.error.js';

export const AUDIT_LOG_SORT = {
  occurredAt: -1,
  eventId: -1,
} as const;

export interface AuditLogView {
  eventId: string;
  eventType: EventType;
  occurredAt: string;
  actorId: string;
  targetId: string;
  serviceSource: ServiceSource;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLogView[];
  limit: number;
}

export interface AuditLogRecord {
  eventId: string;
  eventType: string;
  occurredAt: Date | string;
  actorId: string;
  targetId: string;
  serviceSource: string;
  payload: unknown;
  createdAt: Date;
}

export class AuditLog {
  private constructor(
    readonly eventId: string,
    readonly eventType: EventType,
    readonly occurredAt: Date,
    readonly actorId: string,
    readonly targetId: string,
    readonly serviceSource: ServiceSource,
    private readonly eventPayload: Record<string, unknown>,
    readonly createdAt: Date,
  ) {}

  get payload(): Record<string, unknown> {
    return clonePayload(this.eventPayload);
  }

  toView(): AuditLogView {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      occurredAt: this.occurredAt.toISOString(),
      actorId: this.actorId,
      targetId: this.targetId,
      serviceSource: this.serviceSource,
      payload: this.payload,
      createdAt: this.createdAt.toISOString(),
    };
  }

  static record(event: DomainEvent, createdAt: Date): AuditLog {
    const valid = parseDomainEvent(event);
    const occurredAt = new Date(valid.occurredAt);
    assertTimestamp(occurredAt, 'occurredAt is invalid');
    assertTimestamp(createdAt, 'createdAt is invalid');
    return new AuditLog(
      valid.eventId,
      valid.eventType,
      occurredAt,
      valid.actorId,
      valid.targetId,
      valid.serviceSource,
      clonePayload(valid.payload),
      createdAt,
    );
  }

  static rehydrate(input: AuditLogRecord): AuditLog {
    let event: DomainEvent;
    try {
      event = parseDomainEvent({
        eventId: input.eventId,
        eventType: input.eventType,
        occurredAt: occurredAtIso(input.occurredAt),
        actorId: input.actorId,
        targetId: input.targetId,
        serviceSource: input.serviceSource,
        payload: input.payload,
      });
    } catch (error) {
      if (error instanceof DomainInvariantError) {
        throw error;
      }
      throw new DomainInvariantError('audit log is invalid');
    }
    return AuditLog.record(event, input.createdAt);
  }
}

export function sortAuditLogs(logs: readonly AuditLog[]): AuditLog[] {
  return [...logs].sort((left, right) => {
    const byTime = right.occurredAt.getTime() - left.occurredAt.getTime();
    if (byTime !== 0) {
      return byTime;
    }
    if (left.eventId === right.eventId) {
      return 0;
    }
    return left.eventId < right.eventId ? 1 : -1;
  });
}

export function selectAuditLogs(logs: readonly AuditLog[], query: AuditLogQuery): AuditLog[] {
  const filtered = logs.filter((log) => {
    if (query.eventType !== undefined && log.eventType !== query.eventType) {
      return false;
    }
    if (query.actorId !== undefined && log.actorId !== query.actorId) {
      return false;
    }
    return true;
  });
  return sortAuditLogs(filtered).slice(0, query.limit);
}

function occurredAtIso(value: Date | string): string {
  if (value instanceof Date) {
    assertTimestamp(value, 'occurredAt is invalid');
    return value.toISOString();
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainInvariantError('occurredAt is invalid');
  }
  return value;
}

function assertTimestamp(value: Date, message: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainInvariantError(message);
  }
}

function clonePayload(payload: object): Record<string, unknown> {
  return structuredClone(payload) as Record<string, unknown>;
}
