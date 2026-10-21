import { AuditLog, type AuditLogRecord } from '../../domain/audit-log.js';

export interface AuditLogPersistence {
  eventId: string;
  eventType: string;
  occurredAt: Date;
  actorId: string;
  targetId: string;
  serviceSource: string;
  payload: unknown;
  createdAt: Date;
}

export function toPersistence(log: AuditLog): AuditLogPersistence {
  return {
    eventId: log.eventId,
    eventType: log.eventType,
    occurredAt: log.occurredAt,
    actorId: log.actorId,
    targetId: log.targetId,
    serviceSource: log.serviceSource,
    payload: log.payload,
    createdAt: log.createdAt,
  };
}

export function toAuditLog(doc: AuditLogPersistence): AuditLog {
  const record: AuditLogRecord = {
    eventId: doc.eventId,
    eventType: doc.eventType,
    occurredAt: doc.occurredAt,
    actorId: doc.actorId,
    targetId: doc.targetId,
    serviceSource: doc.serviceSource,
    payload: doc.payload,
    createdAt: doc.createdAt,
  };
  return AuditLog.rehydrate(record);
}
