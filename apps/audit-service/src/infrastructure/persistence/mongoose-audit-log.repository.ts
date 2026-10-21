import type { Model } from 'mongoose';
import type { AuditLogRepository } from '../../application/ports.js';
import { AUDIT_LOG_SORT, type AuditLog } from '../../domain/audit-log.js';
import type { AuditLogQuery } from '../../domain/audit-query.js';
import { toAuditLog, toPersistence, type AuditLogPersistence } from './audit-log.mapper.js';
import type { AuditLogDocument } from './audit-log.schema.js';
import { isDuplicateEventId } from './duplicate-event.js';
import { PersistenceError } from './persistence.error.js';

export class MongooseAuditLogRepository implements AuditLogRepository {
  constructor(private readonly model: Model<AuditLogDocument>) {}

  async findByEventId(eventId: string): Promise<AuditLog | null> {
    const doc = await this.model.findOne({ eventId }).lean<AuditLogPersistence | null>().exec();
    if (doc === null) {
      return null;
    }
    return toAuditLog(doc);
  }

  async insert(log: AuditLog): Promise<'inserted' | 'duplicate'> {
    try {
      await this.model.create(toPersistence(log));
      return 'inserted';
    } catch (error) {
      if (isDuplicateEventId(error)) {
        return 'duplicate';
      }
      throw new PersistenceError();
    }
  }

  async search(query: AuditLogQuery): Promise<AuditLog[]> {
    const filter: Record<string, string> = {};
    if (query.eventType !== undefined) {
      filter['eventType'] = query.eventType;
    }
    if (query.actorId !== undefined) {
      filter['actorId'] = query.actorId;
    }
    const docs = await this.model.find(filter).sort(AUDIT_LOG_SORT).limit(query.limit).lean<AuditLogPersistence[]>().exec();
    return docs.map((doc) => toAuditLog(doc));
  }

  async countByEventType(): Promise<{ eventType: string; count: number }[]> {
    const rows = await this.model
      .aggregate<{ _id: unknown; count: unknown }>([{ $group: { _id: '$eventType', count: { $sum: 1 } } }])
      .exec();
    return rows.map((row) => {
      if (typeof row._id !== 'string' || typeof row.count !== 'number' || !Number.isInteger(row.count) || row.count < 0) {
        throw new PersistenceError();
      }
      return { eventType: row._id, count: row.count };
    });
  }
}
