import type { Logger } from '@toka/shared';
import { selectAuditLogs, type AuditLogPage } from '../domain/audit-log.js';
import { parseAuditLogQuery, type AuditQueryInput } from '../domain/audit-query.js';
import { internalError, isApplicationError, validationError } from './application-error.js';
import type { AuthenticatedActor } from './authenticated-actor.js';
import type { AuditLogRepository } from './ports.js';
import { requireAuditor } from './require-auditor.js';

export class GetAuditLogsUseCase {
  constructor(
    private readonly logs: AuditLogRepository,
    private readonly logger: Logger,
  ) {}

  async execute(input: AuditQueryInput, actor: AuthenticatedActor | null, traceId: string): Promise<AuditLogPage> {
    try {
      const auditor = requireAuditor(actor);
      const parsed = parseAuditLogQuery(input);
      if (!parsed.ok) {
        throw validationError(parsed.details);
      }
      const items = selectAuditLogs(await this.logs.search(parsed.value), parsed.value).map((log) => log.toView());
      this.logger.info(traceId, 'audit logs listed', {
        actorId: auditor.id,
        count: items.length,
        limit: parsed.value.limit,
      });
      return { items, limit: parsed.value.limit };
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}
