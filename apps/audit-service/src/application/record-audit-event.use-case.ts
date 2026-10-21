import { ContractError, parseDomainEvent, type Logger } from '@toka/shared';
import { AuditLog } from '../domain/audit-log.js';
import type { AuditLogRepository, Clock } from './ports.js';
import { UnconfirmedAuditEventError } from './unconfirmed-audit-event.error.js';

export class RecordAuditEventUseCase {
  constructor(
    private readonly logs: AuditLogRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(input: unknown, traceId: string): Promise<'recorded' | 'duplicate'> {
    try {
      const event = parseDomainEvent(input);
      const log = AuditLog.record(event, this.clock.now());
      const existing = await this.logs.findByEventId(log.eventId);
      if (existing !== null) {
        this.logger.info(traceId, 'audit event already recorded', { eventId: log.eventId });
        return 'duplicate';
      }
      const inserted = await this.logs.insert(log);
      if (inserted === 'duplicate') {
        this.logger.info(traceId, 'audit event already recorded', { eventId: log.eventId });
        return 'duplicate';
      }
      this.logger.info(traceId, 'audit event recorded', { eventId: log.eventId, eventType: log.eventType });
      return 'recorded';
    } catch (error) {
      if (error instanceof ContractError) {
        this.logger.warn(traceId, 'audit event rejected', {});
        throw new UnconfirmedAuditEventError('invalid');
      }
      this.logger.error(traceId, 'audit event was not persisted', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new UnconfirmedAuditEventError('persistence');
    }
  }
}
