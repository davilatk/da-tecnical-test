import type { AuditQuery } from './contracts';

export function compactAuditQuery(query: AuditQuery): AuditQuery {
  const compact: AuditQuery = {};
  if (query.eventType !== undefined) {
    compact.eventType = query.eventType;
  }
  if (query.actorId !== undefined && query.actorId !== '') {
    compact.actorId = query.actorId;
  }
  if (query.limit !== undefined) {
    compact.limit = query.limit;
  }
  return compact;
}
