import type { Logger } from '@toka/shared';
import { auditStatsFromCounts, type AuditStats } from '../domain/audit-query.js';
import { internalError, isApplicationError } from './application-error.js';
import type { AuthenticatedActor } from './authenticated-actor.js';
import type { AuditLogRepository } from './ports.js';
import { requireAuditor } from './require-auditor.js';

export class GetAuditStatsUseCase {
  constructor(
    private readonly logs: AuditLogRepository,
    private readonly logger: Logger,
  ) {}

  async execute(actor: AuthenticatedActor | null, traceId: string): Promise<AuditStats> {
    try {
      const auditor = requireAuditor(actor);
      const stats = auditStatsFromCounts(await this.logs.countByEventType());
      this.logger.info(traceId, 'audit stats read', { actorId: auditor.id, total: stats.total });
      return stats;
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}
