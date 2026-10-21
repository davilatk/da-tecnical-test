import { GetAuditLogsUseCase } from '../application/get-audit-logs.use-case.js';
import { AuditLog } from '../domain/audit-log.js';
import { ACTOR_ID_RULE, EVENT_TYPE_RULE, LIMIT_RULE } from '../domain/audit-query.js';
import {
  ADMIN,
  AUDITOR,
  CREATED_AT,
  MemoryAuditLogs,
  RecordingLogger,
  TRACE_ID,
  USER_ACTOR,
  userCreatedEvent,
  userDeletedEvent,
  userUpdatedEvent,
  capture,
} from './fakes.js';

function useCase() {
  const logs = new MemoryAuditLogs();
  const logger = new RecordingLogger();
  logs.rows.push(
    AuditLog.record(userCreatedEvent('evt_a'), CREATED_AT),
    AuditLog.record(userUpdatedEvent('evt_b'), CREATED_AT),
    AuditLog.record(userDeletedEvent('evt_c'), CREATED_AT),
  );
  return { logs, logger, getLogs: new GetAuditLogsUseCase(logs, logger) };
}

describe('GetAuditLogsUseCase', () => {
  it('validates eventType, actorId and the limit range', async () => {
    const { getLogs, logs } = useCase();
    const invalid = await capture(getLogs.execute({ eventType: 'nope', actorId: ' ', limit: 0 }, ADMIN, TRACE_ID));
    expect(invalid).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(invalid.details).toEqual([
      { field: 'eventType', message: EVENT_TYPE_RULE },
      { field: 'actorId', message: ACTOR_ID_RULE },
      { field: 'limit', message: LIMIT_RULE },
    ]);
    expect(invalid.message).toBe(`eventType ${EVENT_TYPE_RULE}`);

    const limit = await capture(getLogs.execute({ limit: 101 }, ADMIN, TRACE_ID));
    expect(limit.details).toEqual([{ field: 'limit', message: LIMIT_RULE }]);
    expect((await capture(getLogs.execute({ limit: 1.2 }, AUDITOR, TRACE_ID))).code).toBe('VALIDATION_ERROR');
    expect((await capture(getLogs.execute({ actorId: '' }, ADMIN, TRACE_ID))).code).toBe('VALIDATION_ERROR');
    expect(logs.searches).toHaveLength(0);
  });

  it('applies filters, the default limit and the contract order', async () => {
    const { getLogs, logs, logger } = useCase();
    const page = await getLogs.execute({}, ADMIN, TRACE_ID);
    expect(page.limit).toBe(50);
    expect(page.items.map((item) => item.eventId)).toEqual(['evt_c', 'evt_b', 'evt_a']);
    expect(logs.searches).toEqual([{ limit: 50 }]);

    const filtered = await getLogs.execute({ eventType: 'user.created', actorId: ' usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F ', limit: 20 }, AUDITOR, TRACE_ID);
    expect(filtered.limit).toBe(20);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]).toMatchObject({
      eventId: 'evt_a',
      eventType: 'user.created',
      serviceSource: 'user-service',
      payload: userCreatedEvent().payload,
    });
    expect(logs.searches[1]).toEqual({
      eventType: 'user.created',
      actorId: 'usr_01JQ7D7QW7NZGFWTHR2G7Y2Q3F',
      limit: 20,
    });

    const limited = await getLogs.execute({ limit: 1 }, ADMIN, TRACE_ID);
    expect(limited.items.map((item) => item.eventId)).toEqual(['evt_c']);
    expect(limited.limit).toBe(1);
    expect(logger.entries[0]?.context).toMatchObject({ actorId: ADMIN.id, count: 3, limit: 50 });

    const empty = await getLogs.execute({ eventType: 'auth.role.assigned', limit: 100 }, ADMIN, TRACE_ID);
    expect(empty.items).toEqual([]);
    expect(empty.limit).toBe(100);
  });

  it('rejects invalid tokens and unauthorized roles', async () => {
    const { getLogs } = useCase();
    expect((await capture(getLogs.execute({}, null, TRACE_ID))).code).toBe('TOKEN_INVALID_OR_REVOKED');
    expect((await capture(getLogs.execute({}, { ...ADMIN, id: '   ' }, TRACE_ID))).status).toBe(401);
    const forbidden = await capture(getLogs.execute({}, USER_ACTOR, TRACE_ID));
    expect(forbidden).toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'forbidden' });
    expect((await capture(getLogs.execute({}, { ...ADMIN, roles: [] }, TRACE_ID))).code).toBe('FORBIDDEN');
  });

  it('hides repository failures', async () => {
    const { getLogs, logs, logger } = useCase();
    logs.failSearch = new Error('db down');
    expect((await capture(getLogs.execute({}, ADMIN, TRACE_ID))).code).toBe('INTERNAL_ERROR');
    expect(logger.entries.at(-1)?.context).toEqual({ errorName: 'Error' });

    logs.failSearch = 'down';
    expect((await capture(getLogs.execute({ limit: 1 }, AUDITOR, TRACE_ID))).message).toBe('internal error');
    expect(logger.entries.at(-1)?.context).toEqual({ errorName: 'UnknownError' });
  });
});
