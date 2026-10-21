import type { AuditLog } from '../domain/audit-log.js';
import type { AuditLogQuery } from '../domain/audit-query.js';

export interface AuditLogRepository {
  findByEventId(eventId: string): Promise<AuditLog | null>;
  insert(log: AuditLog): Promise<'inserted' | 'duplicate'>;
  search(query: AuditLogQuery): Promise<AuditLog[]>;
  countByEventType(): Promise<{ eventType: string; count: number }[]>;
}

export interface Clock {
  now(): Date;
}

export interface AuditSettings {
  jwtSecret: string;
}

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');
export const CLOCK = Symbol('CLOCK');
export const APP_LOGGER = Symbol('APP_LOGGER');
export const AUDIT_SETTINGS = Symbol('AUDIT_SETTINGS');
export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');
