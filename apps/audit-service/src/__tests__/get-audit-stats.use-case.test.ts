import { GetAuditStatsUseCase } from '../application/get-audit-stats.use-case.js';
import { AuditLog } from '../domain/audit-log.js';
import {
  ADMIN,
  AUDITOR,
  CREATED_AT,
  DOMAIN_EVENTS,
  MemoryAuditLogs,
  RecordingLogger,
  TRACE_ID,
  USER_ACTOR,
  capture,
} from './fakes.js';

function useCase() {
  const logs = new MemoryAuditLogs();
  const logger = new RecordingLogger();
  return { logs, logger, getStats: new GetAuditStatsUseCase(logs, logger) };
}

describe('GetAuditStatsUseCase', () => {
  it('returns the five keys and the persisted counters', async () => {
    const { logs, getStats, logger } = useCase();
    const empty = await getStats.execute(AUDITOR, TRACE_ID);
    expect(empty).toEqual({
      total: 0,
      byEventType: {
        'auth.user.logged_in': 0,
        'auth.role.assigned': 0,
        'user.created': 0,
        'user.updated': 0,
        'user.deleted': 0,
      },
    });

    for (const event of DOMAIN_EVENTS) {
      logs.rows.push(AuditLog.record(event, CREATED_AT));
    }
    logs.rows.push(AuditLog.record(DOMAIN_EVENTS[2]!, CREATED_AT));
    const stats = await getStats.execute(ADMIN, TRACE_ID);
    expect(stats.total).toBe(6);
    expect(stats.byEventType).toEqual({
      'auth.user.logged_in': 1,
      'auth.role.assigned': 1,
      'user.created': 2,
      'user.updated': 1,
      'user.deleted': 1,
    });
    expect(Object.keys(stats.byEventType)).toEqual([
      'auth.user.logged_in',
      'auth.role.assigned',
      'user.created',
      'user.updated',
      'user.deleted',
    ]);
    expect(logger.entries.at(-1)?.context).toEqual({ actorId: ADMIN.id, total: 6 });
  });

  it('rejects invalid tokens and unauthorized roles', async () => {
    const { getStats } = useCase();
    expect((await capture(getStats.execute(null, TRACE_ID))).code).toBe('TOKEN_INVALID_OR_REVOKED');
    expect((await capture(getStats.execute({ ...AUDITOR, id: '' }, TRACE_ID))).status).toBe(401);
    expect((await capture(getStats.execute(USER_ACTOR, TRACE_ID))).code).toBe('FORBIDDEN');
    expect((await capture(getStats.execute({ id: ADMIN.id, email: ADMIN.email, roles: ['USER'] }, TRACE_ID))).status).toBe(403);
  });

  it('hides invalid aggregates and repository failures', async () => {
    const { getStats, logs, logger } = useCase();
    logs.counts = [{ eventType: 'user.created', count: -1 }];
    expect((await capture(getStats.execute(ADMIN, TRACE_ID))).code).toBe('INTERNAL_ERROR');
    logs.counts = [{ eventType: 'unknown', count: 1 }];
    expect((await capture(getStats.execute(AUDITOR, TRACE_ID))).message).toBe('internal error');
    logs.counts = null;
    logs.failCount = 'down';
    expect((await capture(getStats.execute(ADMIN, TRACE_ID))).code).toBe('INTERNAL_ERROR');
    expect(logger.entries.some((entry) => entry.context?.['errorName'] === 'UnknownError')).toBe(true);
    expect(logger.entries.some((entry) => entry.context?.['errorName'] === 'DomainInvariantError')).toBe(true);
  });
});
