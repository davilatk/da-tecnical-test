import { isEventType, type EventType } from '@toka/shared';
import { DomainInvariantError } from './domain-invariant.error.js';

export const DEFAULT_AUDIT_LIMIT = 50;
export const MAX_AUDIT_LIMIT = 100;

export const EVENT_TYPE_RULE =
  'must be one of auth.user.logged_in, auth.role.assigned, user.created, user.updated or user.deleted';
export const ACTOR_ID_RULE = 'must be a non-empty identifier';
export const LIMIT_RULE = 'must be an integer between 1 and 100';

export interface AuditFieldViolation {
  field: string;
  message: string;
}

export interface AuditLogQuery {
  eventType?: EventType;
  actorId?: string;
  limit: number;
}

export interface AuditQueryInput {
  eventType?: unknown;
  actorId?: unknown;
  limit?: unknown;
}

export type ParsedAuditQuery =
  | { ok: true; value: AuditLogQuery }
  | { ok: false; details: AuditFieldViolation[] };

export function parseAuditLogQuery(input: AuditQueryInput): ParsedAuditQuery {
  const details: AuditFieldViolation[] = [];
  let eventType: EventType | undefined;
  if (input.eventType !== undefined) {
    if (!isEventType(input.eventType)) {
      details.push({ field: 'eventType', message: EVENT_TYPE_RULE });
    } else {
      eventType = input.eventType;
    }
  }

  let actorId: string | undefined;
  if (input.actorId !== undefined) {
    if (typeof input.actorId !== 'string' || input.actorId.trim().length === 0) {
      details.push({ field: 'actorId', message: ACTOR_ID_RULE });
    } else {
      actorId = input.actorId.trim();
    }
  }

  let limit = DEFAULT_AUDIT_LIMIT;
  if (input.limit !== undefined) {
    if (!isAuditLimit(input.limit)) {
      details.push({ field: 'limit', message: LIMIT_RULE });
    } else {
      limit = input.limit;
    }
  }

  if (details.length > 0) {
    return { ok: false, details };
  }
  return {
    ok: true,
    value: {
      ...(eventType !== undefined ? { eventType } : {}),
      ...(actorId !== undefined ? { actorId } : {}),
      limit,
    },
  };
}

export interface AuditStats {
  total: number;
  byEventType: Record<EventType, number>;
}

export function auditStatsFromCounts(rows: readonly { eventType: string; count: number }[]): AuditStats {
  const byEventType: Record<EventType, number> = {
    'auth.user.logged_in': 0,
    'auth.role.assigned': 0,
    'user.created': 0,
    'user.updated': 0,
    'user.deleted': 0,
  };
  for (const row of rows) {
    if (!isEventType(row.eventType) || !Number.isSafeInteger(row.count) || row.count < 0) {
      throw new DomainInvariantError('audit stats are invalid');
    }
    byEventType[row.eventType] += row.count;
  }
  const total = Object.values(byEventType).reduce((sum, count) => sum + count, 0);
  return { total, byEventType };
}

function isAuditLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_AUDIT_LIMIT;
}
